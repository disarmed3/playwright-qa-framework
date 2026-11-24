#!/usr/bin/env node
// CI helper for .github/workflows/ci.yml (Week 5 Task 04). Node built-ins only; never reads .env,
// never contacts a network or a service, never starts a test. Rule: .claude/rules/95-ci-workflow.md.
//
//   node scripts/ci-summary.mjs report --report <report.json> --role smoke|regression|prod-smoke
//        [--target dev|prod]   (dev by default; prod only with --role prod-smoke, the optional manual job)
//        --run-url <https url> --sha <40 hex> [--pr-head <40 hex>] --run-id <QA_RUN_ID>
//        --playwright-exit <n|''> --html-dir <dir> --traces <dir> [--withheld <file>] --out <summary.md>
//   node scripts/ci-summary.mjs scrub --html <dir> --json <file> [--withheld <file>] [--values-module <file>]
//   node scripts/ci-summary.mjs proof --report <report.json>
//   node scripts/ci-summary.mjs steps --steps <steps.json> --out <summary.md>
//
// report: runs `scripts/slack-report.ts <report> --dry-run` (the reviewed parser, preview mode: no .env
//   read, no Slack call, Slack variables removed from its environment) and relays its own lines.
//   Exit: 0 PASS, 1 FAIL, 2 INCOMPLETE (zero tests, every test skipped, or no executed smoke test),
//   3 ERROR (report missing, malformed, interrupted or with runner errors; exit codes that contradict).
// scrub: before any upload, removes everything from the HTML report folder that is not plain text
//   (trace archives, attachments), then withholds the whole folder when a text file, or the report data
//   embedded in index.html, holds a value exported by tests/support/users.ts (never printed) or a
//   session-cookie or bearer shape. The native JSON is withheld the same way (exit 1, required file).
// proof: the empty-input proof. Every test in the report must be skipped with the one reason the
//   reviewed gate gives for an explicitly empty STUDENT_DATABASE_URL. The reporter refuses an
//   all-skipped report on purpose, so this report never goes through `report`.
// steps: a table of step outcomes (`outcome`, not `conclusion`, so continue-on-error cannot hide a failure).

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QA_RUN_ID = /^\d{8}T\d{6}Z-[0-9a-f]{6}$/;
const SHA = /^[0-9a-f]{40}$/;
const SUMMARY_MAX = 2800;
const MAX_TEXT_BYTES = 50 * 1024 * 1024;
const MAX_ZIP_BYTES = 100 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set(['.html', '.css', '.js', '.json', '.txt', '.md', '.map', '.svg']);
const EMBEDDED_ZIP = /data:application\/zip;base64,([A-Za-z0-9+/=]+)/g;
const SHAPES = [/qa_session=[^\s;"',]{6,}/, /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/i];

export const PROOF_REASON = 'database access unavailable: STUDENT_DATABASE_URL is set but empty';
export const EXIT = { PASS: 0, FAIL: 1, INCOMPLETE: 2, ERROR: 3 };

export class UsageError extends Error {}

const FLAGS = {
  report: [
    'report',
    'role',
    'target',
    'run-url',
    'sha',
    'pr-head',
    'run-id',
    'playwright-exit',
    'html-dir',
    'traces',
    'withheld',
    'out',
  ],
  scrub: ['html', 'json', 'withheld', 'values-module'],
  proof: ['report'],
  steps: ['steps', 'out'],
};

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  if (!Object.hasOwn(FLAGS, cmd ?? '')) {
    throw new UsageError(
      'usage: ci-summary.mjs report|scrub|proof|steps [options]; see the header',
    );
  }
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    if (!flag.startsWith('--') || !FLAGS[cmd].includes(flag.slice(2))) {
      throw new UsageError(`unknown option ${JSON.stringify(flag.slice(0, 40))}`);
    }
    if (rest[i + 1] === undefined) throw new UsageError(`${flag} needs a value`);
    opts[flag.slice(2)] = rest[i + 1];
  }
  return { cmd, opts };
}

function need(opts, names) {
  for (const name of names) {
    if (opts[name] === undefined) throw new UsageError(`--${name} is required`);
  }
}

// ---------------------------------------------------------------------------------------------
// report

function runReporter(reportPath, runUrl, target) {
  const env = { ...process.env };
  delete env.SLACK_BOT_TOKEN;
  delete env.SLACK_CHANNEL;
  const result = spawnSync(
    process.execPath,
    [
      path.join(ROOT, 'scripts', 'slack-report.ts'),
      reportPath,
      '--dry-run',
      '--run-target',
      target,
      '--evidence-url',
      runUrl,
    ],
    { cwd: ROOT, encoding: 'utf8', timeout: 60_000, env, windowsHide: true },
  );
  if (result.error || result.status === null) return { error: 'the reporter did not finish' };
  const lines = result.stdout
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => line !== '');
  const found = /^slack-report: exit (\d+) (\w+) (.+)$/.exec(lines.at(-1) ?? '');
  if (found === null) return { error: 'the reporter gave no result line' };
  const cut = lines.indexOf('---');
  return {
    code: Number(found[1]),
    mode: found[2],
    kind: found[3],
    lines: cut >= 0 ? lines.slice(0, cut) : lines.slice(0, -1),
  };
}

export function classify({ reporter, pwExit, role }) {
  const error = (headline) => ({ status: 'ERROR', headline });
  if (reporter.error) return error(`the native report could not be read: ${reporter.error}`);
  if (reporter.code === 2 && reporter.kind === 'no_result') {
    return {
      status: 'INCOMPLETE',
      headline:
        'incomplete verification: no test was executed (zero tests or every test skipped). This is not a pass',
    };
  }
  if (reporter.code !== 0 || reporter.mode !== 'preview') {
    return error('the native report is invalid, interrupted or has runner errors (see the lines)');
  }
  if (!/^\d+$/.test(pwExit)) return error('the Playwright exit code was not recorded');
  const exit = Number(pwExit);
  const verdict = reporter.kind;
  if (verdict === 'FAIL') {
    return exit === 0
      ? error('the report shows failures but Playwright exited 0; the two disagree')
      : { status: 'FAIL', headline: 'one or more tests failed' };
  }
  if (verdict !== 'PASS' && verdict !== 'PASS (flaky)')
    return error('the reporter verdict is unknown');
  if (exit !== 0) return error('the report shows no failure but Playwright exited non-zero');
  if (role === 'smoke') {
    const smoke = /^Smoke: (\d+) passed · (\d+) failed · (\d+) skipped/.exec(
      reporter.lines.find((line) => line.startsWith('Smoke: ')) ?? '',
    );
    if (smoke === null || Number(smoke[1]) + Number(smoke[2]) === 0) {
      return {
        status: 'INCOMPLETE',
        headline:
          'incomplete verification: no smoke test was executed (none selected, or all skipped). This is not a pass',
      };
    }
  }
  return { status: 'PASS', headline: 'every executed test passed' };
}

/** Files below `dir` (no symbolic link is followed; one is removed), bounded in depth and count. */
function listFiles(dir, limits = { depth: 8, count: 20_000 }, depth = 0, seen = { n: 0 }) {
  const files = [];
  if (depth > limits.depth) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const stat = lstatSync(full);
    seen.n += 1;
    if (seen.n > limits.count) break;
    if (stat.isSymbolicLink()) rmSync(full, { force: true });
    else if (stat.isDirectory()) files.push(...listFiles(full, limits, depth + 1, seen));
    else if (stat.isFile()) files.push(full);
  }
  return files;
}

function countTraces(dir) {
  if (!existsSync(dir) || !lstatSync(dir).isDirectory()) return undefined;
  const found = [];
  const walk = (current, depth) => {
    if (depth > 6 || found.length > 5000) return;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.name === 'trace.zip') found.push(full);
    }
  };
  walk(dir, 0);
  return found.length;
}

/** What the required native JSON is, from the file and the reporter's verdict on it. */
export function jsonState(reportExists, reporter) {
  if (!reportExists) return 'MISSING';
  const unusable =
    reporter.error !== undefined ||
    (reporter.code !== 0 && !(reporter.code === 2 && reporter.kind === 'no_result'));
  return unusable ? 'present but REJECTED (invalid, interrupted or has runner errors)' : 'present';
}

function captureRows({ htmlDir, traces, withheld, json }) {
  const count = countTraces(traces);
  const trace =
    count === undefined
      ? 'none (no test-results folder on the runner)'
      : count === 0
        ? 'none (no failing test retained a trace)'
        : `${count} captured on the runner, withheld from upload by design (may hold session cookies and login request bodies)`;
  const notes =
    withheld !== undefined && existsSync(withheld)
      ? readFileSync(withheld, 'utf8')
          .split('\n')
          .filter((line) => line !== '' && line !== 'none')
      : [];
  const html = existsSync(path.join(htmlDir, 'index.html'))
    ? 'present (trace archives removed before upload)'
    : notes.some((note) => note.startsWith('html:'))
      ? 'not available (optional): withheld or not produced, see the notes below'
      : 'not available (optional): not produced';
  return { html, trace, notes, json };
}

// A backtick would end the fenced block; control characters could hide text. Both are replaced.
const clean = (line) =>
  // eslint-disable-next-line no-control-regex -- strips control characters before printing
  line.replace(/`/g, "'").replace(/[\u0000-\u001f\u007f]/g, ' ');

export function buildSummary({ status, headline, lines, opts, captures, pwExit }) {
  const short = opts.sha.slice(0, 7);
  const target = opts.target ?? 'dev';
  const head = opts['pr-head'] ? ` · PR head ${opts['pr-head'].slice(0, 7)}` : '';
  const build = (shown) =>
    [
      `## CI ${target} tests: ${status}`,
      '',
      headline,
      '',
      `Revision ${short} (the commit that ran)${head} · [run](${opts['run-url']}) · scope ${opts.role} · target ${target} · owned-record run id ${opts['run-id']}`,
      `Playwright exit code: ${pwExit === '' ? 'not recorded' : pwExit}`,
      '',
      '```text',
      ...shown.map(clean),
      '```',
      '',
      `Native JSON: required, ${captures.json} · HTML report: ${captures.html} · Traces: ${captures.trace}`,
      ...captures.notes.map((note) => `- ${clean(note)}`),
      '',
      `Paste if the automatic PR comment is unavailable: \`CI run ${short}: ${status} — ${opts['run-url']}\``,
      '',
    ].join('\n');
  let shown = lines.length > 0 ? lines : ['(no reporter output)'];
  let text = build(shown);
  while (text.length > SUMMARY_MAX && shown.length > 3) {
    shown = [...shown.slice(0, -2), '… truncated; see the native report'];
    text = build(shown);
  }
  return text;
}

function commandReport(opts) {
  need(opts, [
    'report',
    'role',
    'run-url',
    'sha',
    'run-id',
    'playwright-exit',
    'html-dir',
    'traces',
    'out',
  ]);
  if (!['smoke', 'regression', 'prod-smoke'].includes(opts.role)) {
    throw new UsageError('--role is smoke, regression or prod-smoke');
  }
  // dev is the default and the only target of the core CI; prod belongs to the optional manual job.
  const target = opts.target ?? 'dev';
  if (target !== 'dev' && target !== 'prod') throw new UsageError('--target is dev or prod');
  if ((opts.role === 'prod-smoke') !== (target === 'prod')) {
    throw new UsageError('--role prod-smoke and --target prod go together');
  }
  if (!/^https:\/\/[^\s@]+$/.test(opts['run-url'])) throw new UsageError('--run-url must be https');
  if (!SHA.test(opts.sha)) throw new UsageError('--sha must be 40 hex characters');
  if (opts['pr-head'] !== undefined && !SHA.test(opts['pr-head'])) {
    throw new UsageError('--pr-head must be 40 hex characters');
  }
  if (!QA_RUN_ID.test(opts['run-id'])) throw new UsageError('--run-id has the wrong shape');
  const pwExit = opts['playwright-exit'];
  const reporter = existsSync(opts.report)
    ? runReporter(opts.report, opts['run-url'], target)
    : { error: 'the native report is missing' };
  const { status, headline } = classify({ reporter, pwExit, role: opts.role });
  const text = buildSummary({
    status,
    headline,
    lines: reporter.lines ?? [],
    opts,
    captures: captureRows({
      htmlDir: opts['html-dir'],
      traces: opts.traces,
      withheld: opts.withheld,
      json: jsonState(existsSync(opts.report), reporter),
    }),
    pwExit,
  });
  writeFileSync(opts.out, text);
  return { code: EXIT[status], line: `ci-summary: report ${status}` };
}

// ---------------------------------------------------------------------------------------------
// scrub

async function secretNeedles(modulePath) {
  const mod = await import(pathToFileURL(modulePath).href);
  const values = new Set();
  for (const exported of Object.values(mod)) {
    if (exported === null || typeof exported !== 'object') continue;
    for (const value of Object.values(exported)) {
      if (typeof value === 'string' && value.length >= 4) values.add(value);
    }
  }
  if (values.size === 0) throw new Error('no values to scan for');
  return [...values].flatMap((value) => [
    value,
    encodeURIComponent(value),
    JSON.stringify(value).slice(1, -1),
  ]);
}

const leaks = (text, needles) =>
  needles.some((needle) => text.includes(needle)) || SHAPES.some((shape) => shape.test(text));

/** The entries of a zip from its central directory (stored or deflated); anything else throws. */
export function readZipEntries(buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('zip: no end record');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = [];
  let total = 0;
  for (let n = 0; n < count; n += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('zip: bad directory');
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    if (size === 0xffffffff || local === 0xffffffff) throw new Error('zip: zip64 not supported');
    if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error('zip: bad local header');
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const raw = buffer.subarray(start, start + size);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = inflateRawSync(raw, { maxOutputLength: MAX_ZIP_BYTES });
    else throw new Error('zip: unsupported compression');
    total += data.length;
    if (total > MAX_ZIP_BYTES) throw new Error('zip: too large');
    entries.push({ name: buffer.toString('utf8', offset + 46, offset + 46 + nameLength), data });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function scrubHtml(dir, needles, notes) {
  if (!existsSync(dir)) {
    notes.push('html: not produced');
    return;
  }
  const stat = lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    rmSync(dir, { recursive: true, force: true });
    notes.push('html: withheld (not a plain folder)');
    return;
  }
  let removed = 0;
  const kept = [];
  for (const file of listFiles(dir)) {
    if (TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) kept.push(file);
    else {
      rmSync(file, { force: true });
      removed += 1;
    }
  }
  if (removed > 0) {
    notes.push(
      `html: removed ${removed} file(s) that are not plain text (trace archives, attachments)`,
    );
  }
  let matched = false;
  let unscannable = false;
  for (const file of kept) {
    if (lstatSync(file).size > MAX_TEXT_BYTES) {
      unscannable = true;
      continue;
    }
    const text = readFileSync(file, 'utf8');
    if (leaks(text, needles)) matched = true;
    for (const embedded of text.matchAll(EMBEDDED_ZIP)) {
      try {
        for (const entry of readZipEntries(Buffer.from(embedded[1], 'base64'))) {
          if (leaks(entry.data.toString('utf8'), needles)) matched = true;
        }
      } catch {
        unscannable = true;
      }
    }
  }
  if (matched || unscannable) {
    rmSync(dir, { recursive: true, force: true });
    notes.push(
      matched
        ? 'html: withheld (the credential scan matched)'
        : 'html: withheld (embedded report data could not be scanned)',
    );
  }
}

function scrubJson(file, needles, notes) {
  if (!existsSync(file)) {
    notes.push('json: missing');
    return false;
  }
  if (lstatSync(file).size > MAX_TEXT_BYTES || leaks(readFileSync(file, 'utf8'), needles)) {
    rmSync(file, { force: true });
    notes.push('json: withheld (the credential scan matched or the file is too large)');
    return false;
  }
  return true;
}

async function commandScrub(opts) {
  need(opts, ['html', 'json']);
  const notes = [];
  let needles;
  try {
    needles = await secretNeedles(
      opts['values-module'] ?? path.join(ROOT, 'tests', 'support', 'users.ts'),
    );
  } catch {
    rmSync(opts.html, { recursive: true, force: true });
    rmSync(opts.json, { force: true });
    notes.push('html and json: withheld (the scan values could not be loaded)');
    if (opts.withheld !== undefined) writeFileSync(opts.withheld, `${notes.join('\n')}\n`);
    return { code: EXIT.ERROR, line: 'ci-summary: scrub ERROR values unavailable' };
  }
  scrubHtml(opts.html, needles, notes);
  const jsonOk = scrubJson(opts.json, needles, notes);
  if (opts.withheld !== undefined) {
    writeFileSync(opts.withheld, `${notes.length > 0 ? notes.join('\n') : 'none'}\n`);
  }
  return jsonOk
    ? { code: 0, line: 'ci-summary: scrub ok' }
    : { code: 1, line: 'ci-summary: scrub FAILED the native JSON is unavailable' };
}

// ---------------------------------------------------------------------------------------------
// proof and steps

function collectTests(suites, out = []) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) out.push(...(spec.tests ?? []));
    collectTests(suite.suites, out);
  }
  return out;
}

export function checkProof(text) {
  let report;
  try {
    report = JSON.parse(text);
  } catch {
    return { ok: false, message: 'the proof report is not valid JSON' };
  }
  if (!Array.isArray(report?.suites) || !Array.isArray(report?.errors)) {
    return { ok: false, message: 'the proof report is not a native Playwright report' };
  }
  if (report.errors.length > 0) return { ok: false, message: 'the proof run had runner errors' };
  const tests = collectTests(report.suites);
  if (tests.length === 0) return { ok: false, message: 'the proof run listed no test' };
  const wrong = tests.filter((test) => {
    const reason = (test.annotations ?? []).find((a) => a.type === 'skip')?.description;
    return test.status !== 'skipped' || reason !== PROOF_REASON;
  });
  if (wrong.length > 0) {
    return {
      ok: false,
      message: `${wrong.length} of ${tests.length} proof test(s) were not skipped with the expected reason`,
    };
  }
  return { ok: true, message: `${tests.length} test(s), all skipped with: ${PROOF_REASON}` };
}

function commandProof(opts) {
  need(opts, ['report']);
  if (!existsSync(opts.report)) {
    return { code: 1, line: 'ci-summary: proof FAILED the proof report is missing' };
  }
  const result = checkProof(readFileSync(opts.report, 'utf8'));
  return result.ok
    ? { code: 0, line: `ci-summary: proof ok: ${result.message}` }
    : { code: 1, line: `ci-summary: proof FAILED ${result.message}` };
}

export function stepsTable(steps) {
  const label = {
    success: 'passed',
    failure: 'FAILED',
    skipped: 'NOT RUN',
    cancelled: 'cancelled',
  };
  const rows = Object.entries(steps ?? {})
    .filter(([, value]) => value && typeof value.outcome === 'string')
    .map(([id, value]) => ({ id, outcome: value.outcome }));
  return { rows, failed: rows.filter((row) => row.outcome !== 'success'), label };
}

function commandSteps(opts) {
  need(opts, ['steps', 'out']);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(opts.steps, 'utf8'));
  } catch {
    throw new UsageError('--steps is not readable JSON');
  }
  const { rows, failed, label } = stepsTable(parsed);
  const text = [
    `## Static checks: ${failed.length === 0 && rows.length > 0 ? 'PASSED' : 'FAILED'}`,
    '',
    '| Step | Result |',
    '| --- | --- |',
    ...rows.map(
      (row) => `| ${row.id.replace(/[^A-Za-z0-9-]/g, '')} | ${label[row.outcome] ?? 'unknown'} |`,
    ),
    '',
  ].join('\n');
  writeFileSync(opts.out, text);
  const ok = failed.length === 0 && rows.length > 0;
  return { code: ok ? 0 : 1, line: `ci-summary: steps ${ok ? 'ok' : 'FAILED'}` };
}

// ---------------------------------------------------------------------------------------------

export async function main(argv) {
  try {
    const { cmd, opts } = parseArgs(argv);
    if (cmd === 'report') return commandReport(opts);
    if (cmd === 'scrub') return await commandScrub(opts);
    if (cmd === 'proof') return commandProof(opts);
    return commandSteps(opts);
  } catch (error) {
    if (error instanceof UsageError)
      return { code: 3, line: `ci-summary: usage: ${error.message}` };
    return { code: 3, line: `ci-summary: unexpected error (${error?.name ?? 'Error'})` };
  }
}

if (path.basename(process.argv[1] ?? '') === 'ci-summary.mjs') {
  const result = await main(process.argv.slice(2));
  console.log(result.line);
  process.exitCode = result.code;
}
