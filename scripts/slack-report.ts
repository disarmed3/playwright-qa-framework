#!/usr/bin/env node
// Slack failure notification for native Playwright JSON reports (Week 5 Task 02). Node built-ins
// only; runs on Node's own type stripping, so only erasable TypeScript is used. Rule:
// .claude/rules/90-failure-notification.md.
//
//   node scripts/slack-report.ts <report.json> [--dry-run] [--run-target dev|prod] [--evidence-url <https>]
//   node scripts/slack-report.ts --check-connection
//   node scripts/slack-report.ts --send <report.json> --approve-digest <12 hex> [same options]
//
// Modes (never combined):
//   preview (default, or --dry-run): validates the report and prints the message. Never reads .env
//     and never calls Slack, even when credentials exist.
//   --check-connection: one auth.test request. Prints success or failure and the workspace and bot
//     names. No message, no channel lookup.
//   --send: one chat.postMessage request, only when --approve-digest equals the digest the preview
//     printed for the same input and options. No retry, no schedule.
//
// Private settings: SLACK_BOT_TOKEN and SLACK_CHANNEL. A non-empty value in the process environment
// wins. Only when one is missing is the root .env read, and only those two lines are parsed.
//
// Exit: 0 done; 1 usage or digest refused; 2 invalid or unusable report; 3 credentials missing;
// 4 Slack refused or unreachable; 5 delivery uncertain; 6 rate limited. The last stdout line is
// `slack-report: exit <n> <mode> <verdict|error-kind>`.

import type {
  JSONReport,
  JSONReportSpec,
  JSONReportSuite,
  JSONReportTest,
} from '@playwright/test/reporter';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');
const API = 'https://slack.com/api/';
const TIMEOUT_MS = 10_000;
const MAX_FAILURES = 10;
const SUPPORTED_MAJOR = 1;
const TAGS_ADDED = '2026-11-13';

export type Deps = {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  /** The root .env text, or undefined. Called only by --check-connection and --send. */
  readDotEnv: () => string | undefined;
  log: (line: string) => void;
  root: string;
};

type Mode = 'preview' | 'check' | 'send';
type Args = {
  mode: Mode;
  report?: string;
  digest?: string;
  runTarget?: string;
  evidenceUrl?: string;
};

class Refusal extends Error {
  code: number;
  kind: string;
  constructor(code: number, kind: string, detail: string) {
    super(detail);
    this.code = code;
    this.kind = kind;
  }
}

// ---------- text safety ----------

// Token shapes are assembled from pieces so this file never holds a literal token prefix.
const TOKEN_SHAPES = [
  new RegExp('xo' + 'x[a-z]-[A-Za-z0-9-]+', 'g'),
  new RegExp('xa' + 'pp-[A-Za-z0-9-]+', 'g'),
  new RegExp('AT' + 'ATT[A-Za-z0-9_=-]+', 'g'),
  new RegExp('AK' + 'IA[0-9A-Z]{16}', 'g'),
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
];
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const CONTROL = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
  'g',
);
const ZWSP = String.fromCharCode(0x200b);

/** Strips ANSI and control characters, masks paths, emails and token shapes, caps the length. */
function clean(text: string, max = 200): string {
  let t = text.replace(ANSI, '');
  t = t.replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s'"]+/gi, '[home]');
  t = t.replace(/\/(?:Users|home)\/[^/\s'"]+/g, '[home]');
  t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, '[email]');
  for (const re of TOKEN_SHAPES) t = t.replace(re, '[redacted]');
  t = t.replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted]');
  t = t.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  // A mention character never reaches Slack unbroken.
  t = t.replace(/@/g, `@${ZWSP}`).replace(/</g, '(').replace(/>/g, ')');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
const mrkdwnSafe = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- arguments ----------

function parseArgs(argv: string[]): Args {
  const a: Args = { mode: 'preview' };
  let dry = false;
  let check = false;
  let send = false;
  const value = (i: number, flag: string): string => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--'))
      throw new Refusal(1, 'usage', `${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') dry = true;
    else if (arg === '--check-connection') check = true;
    else if (arg === '--send') send = true;
    else if (arg === '--approve-digest') a.digest = value(i++, arg);
    else if (arg === '--run-target') a.runTarget = value(i++, arg);
    else if (arg === '--evidence-url') a.evidenceUrl = value(i++, arg);
    else if (arg === '--help')
      throw new Refusal(1, 'help', 'see the header of scripts/slack-report.ts');
    else if (arg.startsWith('--')) throw new Refusal(1, 'usage', `unknown flag ${clean(arg, 40)}`);
    else if (a.report === undefined) a.report = arg;
    else throw new Refusal(1, 'usage', 'only one report path is accepted');
  }
  if (Number(dry) + Number(check) + Number(send) > 1)
    throw new Refusal(1, 'usage', '--dry-run, --check-connection and --send cannot be combined');
  a.mode = check ? 'check' : send ? 'send' : 'preview';
  if (a.mode === 'check' && (a.report !== undefined || a.digest !== undefined))
    throw new Refusal(1, 'usage', '--check-connection takes no report and no digest');
  if (a.mode !== 'check' && a.report === undefined)
    throw new Refusal(1, 'usage', 'a report path is required');
  if (a.mode !== 'send' && a.digest !== undefined)
    throw new Refusal(1, 'usage', '--approve-digest is only for --send');
  if (a.mode === 'send' && !/^[0-9a-f]{12}$/.test(a.digest ?? ''))
    throw new Refusal(1, 'usage', '--send needs --approve-digest <12 hex> from the preview');
  if (a.runTarget !== undefined && a.runTarget !== 'dev' && a.runTarget !== 'prod')
    throw new Refusal(1, 'usage', '--run-target is exactly dev or prod');
  if (a.evidenceUrl !== undefined) {
    let u: URL;
    try {
      u = new URL(a.evidenceUrl);
    } catch {
      throw new Refusal(1, 'usage', '--evidence-url is not a URL');
    }
    if (u.protocol !== 'https:' || u.username || u.password)
      throw new Refusal(1, 'usage', '--evidence-url must be https without credentials');
  }
  return a;
}

// ---------- report validation ----------

type Row = { spec: JSONReportSpec; test: JSONReportTest; path: string[]; file: string };
type Eval = {
  verdict: 'PASS' | 'PASS (flaky)' | 'FAIL';
  rows: Row[];
  counts: { expected: number; unexpected: number; flaky: number; skipped: number };
  attempts: number;
  retried: number;
  elapsedMs: number | null;
  sumMs: number;
  workers: number | null;
  startTime: string | null;
  files: string[];
  rootDir: string;
};

function invalid(detail: string): never {
  throw new Refusal(2, 'invalid_input', detail);
}

function collect(suites: JSONReportSuite[], chain: string[], out: Row[], depth: number): void {
  for (const s of suites) {
    const next = depth === 0 ? chain : [...chain, s.title];
    for (const spec of s.specs ?? [])
      for (const test of spec.tests ?? [])
        out.push({ spec, test, path: [...next, spec.title], file: spec.file });
    collect(s.suites ?? [], next, out, depth + 1);
  }
}

function evaluate(report: JSONReport): Eval {
  const r = report as unknown as Record<string, unknown>;
  if (typeof r !== 'object' || r === null || !r.config || !Array.isArray(r.suites) || !r.stats)
    invalid('not a native Playwright JSON report (config, suites and stats are required)');
  const version = String((report.config as { version?: unknown }).version ?? '');
  if (Number(version.split('.')[0]) !== SUPPORTED_MAJOR)
    invalid(`unsupported report version ${clean(version, 20)}`);
  if (!Array.isArray(report.errors) || report.errors.length > 0)
    invalid(
      `report has ${Array.isArray(report.errors) ? report.errors.length : 'unreadable'} top-level error(s)`,
    );
  const rows: Row[] = [];
  collect(report.suites, [], rows, 0);
  const counts = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 };
  let attempts = 0;
  let retried = 0;
  let sumMs = 0;
  for (const { test } of rows) {
    if (!(test.status in counts))
      invalid(`a test has the unknown status ${clean(String(test.status), 20)}`);
    counts[test.status] += 1;
    const results = test.results ?? [];
    if (results.length === 0 && test.status !== 'skipped')
      invalid('a test has no result (the run did not finish)');
    for (const res of results) {
      if (res.status === 'interrupted') invalid('the run was interrupted');
      attempts += 1;
      if (res.retry > 0) retried += 1;
      sumMs += Number(res.duration) || 0;
    }
  }
  const st = report.stats;
  if (
    st.expected !== counts.expected ||
    st.unexpected !== counts.unexpected ||
    st.flaky !== counts.flaky ||
    st.skipped !== counts.skipped
  )
    invalid('stats do not match the counts derived from the tests');
  if (rows.length === 0)
    throw new Refusal(2, 'no_result', 'NO RESULT: the report contains no tests');
  if (counts.skipped === rows.length)
    throw new Refusal(2, 'no_result', 'NO RESULT: every test was skipped');
  const meta = (report.config.metadata ?? {}) as { actualWorkers?: unknown };
  return {
    verdict: counts.unexpected > 0 ? 'FAIL' : counts.flaky > 0 ? 'PASS (flaky)' : 'PASS',
    rows,
    counts,
    attempts,
    retried,
    elapsedMs: typeof st.duration === 'number' ? st.duration : null,
    sumMs,
    workers: typeof meta.actualWorkers === 'number' ? meta.actualWorkers : null,
    startTime: typeof st.startTime === 'string' ? st.startTime : null,
    files: [...new Set(rows.map((x) => x.file))].sort(),
    rootDir: String(report.config.rootDir ?? ''),
  };
}

// ---------- message ----------

const secs = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

function scopeText(e: Eval): string {
  const prefix = /[\\/]tests$/.test(e.rootDir) ? 'tests/' : '';
  const files = e.files.map((f) => `${prefix}${f.replace(/\\/g, '/')}`);
  const parts = files.map((f) => f.split('/'));
  let common = parts[0].slice(0, -1);
  for (const p of parts) {
    let i = 0;
    while (i < common.length && i < p.length - 1 && common[i] === p[i]) i++;
    common = common.slice(0, i);
  }
  const where =
    files.length <= 2
      ? files.join(', ')
      : common.length
        ? `${common.join('/')}/`
        : '(several folders)';
  return `${where} · ${e.rows.length} test${e.rows.length === 1 ? '' : 's'} in ${files.length} file${files.length === 1 ? '' : 's'}`;
}

function smokeText(e: Eval): string {
  const recorded = e.rows.some((r) => (r.spec.tags ?? []).length > 0);
  if (!recorded)
    return `not recorded in this run (the report has no tag data; tags were added ${TAGS_ADDED})`;
  const smoke = e.rows.filter((r) =>
    (r.spec.tags ?? []).some((t) => t.replace(/^@/, '') === 'smoke'),
  );
  if (smoke.length === 0) return 'no smoke tests in this run (tags are recorded)';
  const n = (s: string) => smoke.filter((r) => r.test.status === s).length;
  return `${n('expected') + n('flaky')} passed · ${n('unexpected')} failed · ${n('skipped')} skipped (of ${smoke.length}, from the report's own tags)`;
}

function skipReasons(e: Eval): string[] {
  const reasons = new Map<string, number>();
  for (const { test } of e.rows) {
    if (test.status !== 'skipped') continue;
    const a = (test.annotations ?? []).find((x) => x.type === 'skip');
    const key = clean(a?.description ?? 'no reason recorded', 120);
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  return [...reasons].slice(0, 3).map(([k, n]) => `${n} × ${k}`);
}

function failureLines(e: Eval): string[] {
  const failed = e.rows.filter((r) => r.test.status === 'unexpected');
  const lines = failed.slice(0, MAX_FAILURES).map((r, i) => {
    const last = r.test.results[r.test.results.length - 1];
    const msg = (last?.errors ?? [])
      .flatMap((x) => String(x.message ?? '').split('\n'))
      .map((l) => l.replace(ANSI, '').trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(' · ');
    const where = `${(/[\\/]tests$/.test(e.rootDir) ? 'tests/' : '') + r.file.replace(/\\/g, '/')}:${r.spec.line}`;
    return clean(`${i + 1}. ${r.path.join(' › ')} (${where}) — ${msg || 'no error text'}`, 300);
  });
  if (failed.length > MAX_FAILURES) lines.push(`+${failed.length - MAX_FAILURES} more not shown`);
  return lines;
}

type Message = {
  text: string;
  blocks: unknown[];
  parse: 'none';
  link_names: false;
  unfurl_links: false;
  unfurl_media: false;
};

function build(
  e: Eval,
  info: { label: string; target: string; evidence: string },
): { message: Message; lines: string[] } {
  const c = e.counts;
  const failed = e.rows.filter((r) => r.test.status === 'unexpected').length;
  const head = `${e.verdict} · qa-framework · target: ${info.target}`;
  const lines = [
    `Source: ${info.label}${e.startTime ? ` · started ${e.startTime.replace('T', ' ').replace(/\.\d+Z$/, 'Z')}` : ' · start time unavailable'}`,
    `Scope: ${scopeText(e)}`,
    `Counts are tests (one outcome per test). Attempts: ${e.attempts}, of which retried: ${e.retried}`,
    `Pass ${c.expected} · Fail ${c.unexpected} · Flaky ${c.flaky} · Skip ${c.skipped}`,
    ...skipReasons(e).map((s) => `Skipped: ${s}`),
    `Smoke: ${smokeText(e)}`,
    `Elapsed: ${e.elapsedMs === null ? 'unavailable' : `${secs(e.elapsedMs)} (run total, stats.duration)`}` +
      ` · Sum of test durations: ${secs(e.sumMs)} (not elapsed${e.workers !== null && e.workers > 1 ? `; ${e.workers} workers overlap` : ''})`,
  ];
  const fails = failureLines(e);
  const failBlock =
    failed > 0 ? [`Failures (${Math.min(failed, MAX_FAILURES)} of ${failed}):`, ...fails] : [];
  const tail = [`Evidence: ${info.evidence}`];
  const all = [head, ...lines, ...failBlock, ...tail];
  const cap = (t: string) => (t.length > 2900 ? `${t.slice(0, 2899)}…` : t);
  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: head.slice(0, 150) } },
    { type: 'section', text: { type: 'plain_text', text: cap(lines.join('\n')) } },
  ];
  if (failBlock.length)
    blocks.push({ type: 'section', text: { type: 'plain_text', text: cap(failBlock.join('\n')) } });
  blocks.push({ type: 'context', elements: [{ type: 'plain_text', text: cap(tail.join('\n')) }] });
  return {
    message: {
      text: mrkdwnSafe(all.join('\n')),
      blocks,
      parse: 'none',
      link_names: false,
      unfurl_links: false,
      unfurl_media: false,
    },
    lines: all,
  };
}

// ---------- Slack ----------

type Settings = { token: string; channel: string };

function pick(env: Record<string, string | undefined>, key: string): string {
  const v = env[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : '';
}

function loadSettings(deps: Deps, needChannel: boolean): Settings {
  let token = pick(deps.env, 'SLACK_BOT_TOKEN');
  let channel = pick(deps.env, 'SLACK_CHANNEL');
  if (!token || (needChannel && !channel)) {
    const text = deps.readDotEnv();
    if (text !== undefined) {
      // Only the two private lines are parsed; every other line of the file is ignored.
      const mine = text
        .split(/\r?\n/)
        .filter((l) => /^\s*(?:export\s+)?(?:SLACK_BOT_TOKEN|SLACK_CHANNEL)\s*=/.test(l))
        .join('\n');
      const parsed = parseEnv(mine) as Record<string, string | undefined>;
      token = token || pick(parsed, 'SLACK_BOT_TOKEN');
      channel = channel || pick(parsed, 'SLACK_CHANNEL');
    }
  }
  const missing = [!token && 'SLACK_BOT_TOKEN', needChannel && !channel && 'SLACK_CHANNEL'].filter(
    Boolean,
  );
  if (missing.length)
    throw new Refusal(
      3,
      'credentials_missing',
      `missing: ${missing.join(', ')} (process environment or root .env)`,
    );
  return { token, channel };
}

type Reply = { ok: boolean; [k: string]: unknown };

/** One request, no retry. `sending` makes an unclear outcome "uncertain delivery" instead of a plain failure. */
async function callSlack(
  deps: Deps,
  token: string,
  method: string,
  body: unknown,
  sending: boolean,
): Promise<Reply> {
  const unclear = sending
    ? (why: string) =>
        new Refusal(
          5,
          'delivery_uncertain',
          `${why}; the message may or may not have been posted. Check the channel before any resend`,
        )
    : (why: string) => new Refusal(4, 'slack_unreachable', why);
  let res: Response;
  try {
    res = await deps.fetch(`${API}${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw unclear('no response (network error or timeout)');
  }
  if (res.status === 429) {
    const wait = clean(res.headers.get('retry-after') ?? 'unknown', 12);
    throw new Refusal(6, 'rate_limited', `Slack asked to wait ${wait} s; nothing was retried`);
  }
  if (res.status >= 500) throw unclear(`Slack answered HTTP ${res.status}`);
  if (!res.ok) throw new Refusal(4, `http_${res.status}`, `Slack answered HTTP ${res.status}`);
  let reply: Reply;
  try {
    reply = (await res.json()) as Reply;
  } catch {
    throw unclear('the answer was not readable');
  }
  if (reply.ok !== true) {
    const code = /^[a-z_]{1,40}$/.test(String(reply.error)) ? String(reply.error) : 'unknown_error';
    throw new Refusal(4, code, `Slack refused: ${code}`);
  }
  return reply;
}

// ---------- run ----------

function shownPath(root: string, abs: string): string {
  const rel = relative(root, abs).replace(/\\/g, '/');
  return rel.startsWith('..') || isAbsolute(rel) ? basename(abs) : rel;
}

function targetFor(args: Args, reportAbs: string): string {
  if (args.runTarget) return `${args.runTarget} (--run-target)`;
  const p = join(dirname(reportAbs), 'provenance.txt');
  if (existsSync(p)) {
    for (const raw of readFileSync(p, 'utf8').replace(/\r/g, '').split('\n')) {
      const kv = /^(target|app_env):\s*(dev|prod)\s*$/.exec(raw);
      if (kv) return `${kv[2]} (provenance.txt)`;
    }
  }
  return 'unknown (not recorded in the report; pass --run-target)';
}

export async function run(argv: string[], deps: Deps): Promise<number> {
  let mode: Mode = 'preview';
  try {
    const args = parseArgs(argv);
    mode = args.mode;
    if (mode === 'check') {
      const { token } = loadSettings(deps, false);
      const reply = await callSlack(deps, token, 'auth.test', {}, false);
      // Names are cleaned; ids must look like Slack ids (upper-case letters and digits) or they are hidden.
      const id = (v: unknown): string =>
        /^[A-Z0-9]{1,24}$/.test(String(v)) ? String(v) : 'unknown';
      const workspace = `${clean(String(reply.team ?? 'unknown'), 60)} (${id(reply.team_id)})`;
      deps.log('no message was sent; no channel was looked up');
      if (reply.bot_id === undefined || reply.bot_id === null || reply.bot_id === '') {
        deps.log(`authenticated, workspace ${workspace}, but the reply has no bot_id`);
        throw new Refusal(
          4,
          'not_a_bot_token',
          'BLOCKER: the token authenticates but is not a bot token (no bot_id); the intended bot is not verified',
        );
      }
      deps.log(
        `connection: ok · workspace ${workspace} · bot ${clean(String(reply.user ?? 'unknown'), 60)} (${id(reply.bot_id)})`,
      );
      deps.log(`slack-report: exit 0 check ok`);
      return 0;
    }
    // preview and send share validation, so send can never reach Slack with unusable input.
    const reportAbs = resolve(deps.root, args.report as string);
    if (!existsSync(reportAbs)) invalid(`report not found: ${shownPath(deps.root, reportAbs)}`);
    const bytes = readFileSync(reportAbs);
    let report: JSONReport;
    try {
      report = JSON.parse(bytes.toString('utf8')) as JSONReport;
    } catch {
      return invalid('the report is not valid JSON');
    }
    const e = evaluate(report);
    const shown = shownPath(deps.root, reportAbs);
    const stamp = /\d{8}T\d{6}Z/.exec(basename(reportAbs))?.[0];
    // A file name, not free text: only safe characters survive, so the token rules cannot misfire on it.
    const label = `${basename(reportAbs)
      .replace(/\.sanitized\.json$|\.json$/, '')
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .slice(0, 100)}${stamp ? ` (run ${stamp})` : ''}`;
    const evidence = args.evidenceUrl
      ? args.evidenceUrl
      : `local-only (${shown}); not a shared link. Ask the QA owner for a copy`;
    const target = targetFor(args, reportAbs);
    const { message, lines } = build(e, { label, target, evidence });
    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          input: createHash('sha256').update(bytes).digest('hex'),
          target,
          evidence,
          message,
        }),
      )
      .digest('hex')
      .slice(0, 12);
    if (mode === 'preview') {
      for (const l of lines) deps.log(l);
      deps.log('---');
      deps.log(`input sha256: ${createHash('sha256').update(bytes).digest('hex')}`);
      deps.log(
        `digest: ${digest} (covers the report bytes, target, evidence link and message; not the channel)`,
      );
      deps.log('Slack: not contacted (preview)');
      deps.log(`slack-report: exit 0 preview ${e.verdict}`);
      return 0;
    }
    if (args.digest !== digest)
      throw new Refusal(
        1,
        'digest_mismatch',
        'the digest does not match this input and these options; run the preview again',
      );
    const { token, channel } = loadSettings(deps, true);
    await callSlack(deps, token, 'chat.postMessage', { channel, ...message }, true);
    deps.log(`sent: ok · channel ****${channel.slice(-4)} · ${e.verdict}`);
    deps.log(`slack-report: exit 0 send ${e.verdict}`);
    return 0;
  } catch (err) {
    if (err instanceof Refusal) {
      deps.log(`error: ${clean(err.message, 300)}`);
      deps.log(`slack-report: exit ${err.code} ${mode} ${err.kind}`);
      return err.code;
    }
    deps.log(`error: internal failure (${clean(err instanceof Error ? err.name : 'unknown', 40)})`);
    deps.log(`slack-report: exit 1 ${mode} internal`);
    return 1;
  }
}

function realDotEnv(): string | undefined {
  const p = join(ROOT, '.env');
  return existsSync(p) ? readFileSync(p, 'utf8') : undefined;
}

const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = await run(process.argv.slice(2), {
    fetch: globalThis.fetch,
    env: process.env,
    readDotEnv: realDotEnv,
    log: (line) => console.log(line),
    root: ROOT,
  });
}
