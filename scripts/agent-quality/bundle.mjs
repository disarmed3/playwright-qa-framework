#!/usr/bin/env node
// Bundle builder for the agent-quality practice (Week 4 Task 03, rule 60). Node built-ins only.
//
//   node scripts/agent-quality/bundle.mjs --self-heal evidence/agent-quality/fixtures/<case-id>
//   node scripts/agent-quality/bundle.mjs --review "<case-id> [self-heal-<UTC>]"
//
// scripts/agent-quality/run-worker.mjs (behind /self-heal and /quality-review) runs this; its
// stdout is the no-tool worker's only input. It reads only one case folder and, for --review, that
// case's FIRST recorded /self-heal reply: the original (owner decision 2026-11-08; later runs are
// kept, never reviewed in its place), unless the argument names one of the case's records.
// For --review only, it also adds that case's ONE row of the supplied checklist: the row named in
// evidence/agent-quality/rubric-map.json, taken from rubric.md (owner approval 2026-11-08, course
// step). --self-heal never reads rubric.md or rubric-map.json. It never reads scorecard.md,
// error-signatures.md or another case, and it never writes.
//
// Output starts with "BUNDLE-STATUS: ok" or "BUNDLE-STATUS: input-error <code>" and always exits 0,
// so an input error reaches the worker as a marker it must return, not as a silent failure. An input
// error is a missing or unreadable file, a malformed manifest or a missing or wrong field; it is never
// a diagnosis. The project root is this script's own (scripts/agent-quality/ → root); there is no
// option to read anywhere else.
//
// Secret prefixes are assembled from pieces so this file never contains them whole (as in
// scripts/hooks/guard.mjs).

import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FIXTURES = 'evidence/agent-quality/fixtures';
const ANSWERS = 'evidence/agent-quality/answers';
const MAX_FILE_BYTES = 64 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024;
const CASE_ID = /^case-\d{2}$/;
const FILE_NAME = /^[a-z0-9][a-z0-9-]*\.(md|txt|json|html)$/;
const ANSWER_NAME = /^self-heal-\d{8}T\d{6}Z\.md$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KEYS = [
  'caseId',
  'inputKind',
  'sourceVersion',
  'sourceDate',
  'requirementPath',
  'evidencePaths',
  'missingObservations',
];

const SECRET_MARKERS = [
  { kind: 'Slack bot token', test: (t) => t.includes('xo' + 'xb-') },
  { kind: 'Atlassian API token', test: (t) => t.includes('ATA' + 'TT') },
  { kind: 'AWS access key ID', test: (t) => t.includes('AK' + 'IA') },
  { kind: 'private key block', test: (t) => t.includes('BEGIN PRIV' + 'ATE KEY') },
  { kind: 'bearer token', test: (t) => new RegExp('Bear' + 'er\\s+[A-Za-z0-9._~+/-]{8,}').test(t) },
  { kind: 'JWT', test: (t) => /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./.test(t) },
  { kind: 'password value', test: (t) => new RegExp('pass' + 'word\\s*[=:]\\s*\\S', 'i').test(t) },
  { kind: 'email address', test: (t) => /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(t) },
];

class InputError extends Error {
  constructor(code, detail) {
    super(detail);
    this.code = code;
  }
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** Lstat that turns "missing" into an input error and refuses links and non-files. */
function plainEntry(relPath, kind) {
  let stat;
  try {
    stat = lstatSync(join(ROOT, relPath));
  } catch {
    throw new InputError('missing-file', `${relPath} does not exist`);
  }
  if (stat.isSymbolicLink()) throw new InputError('link-not-allowed', `${relPath} is a link`);
  if (kind === 'dir' && !stat.isDirectory()) throw new InputError('not-a-folder', `${relPath}`);
  if (kind === 'file' && !stat.isFile()) throw new InputError('not-a-file', `${relPath}`);
  return stat;
}

/** Reads one listed file: size cap, strict UTF-8, secret-like text refused (named, never shown). */
function readListed(relPath) {
  const stat = plainEntry(relPath, 'file');
  if (stat.size > MAX_FILE_BYTES) throw new InputError('file-too-large', `${relPath}`);
  const bytes = readFileSync(join(ROOT, relPath));
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new InputError('not-utf8', `${relPath}`);
  }
  const secret = SECRET_MARKERS.find(({ test }) => test(text));
  if (secret) throw new InputError('secret-like-text', `${relPath} (${secret.kind})`);
  return { relPath, bytes, text };
}

function checkFileName(field, value) {
  if (typeof value !== 'string' || !FILE_NAME.test(value) || value === 'case.json') {
    throw new InputError('bad-path', `${field} must be a plain file name inside the case folder`);
  }
}

/** Validates case.json strictly and returns it. */
function readManifest(caseId) {
  const manifestPath = `${FIXTURES}/${caseId}/case.json`;
  const { text } = readListed(manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    throw new InputError('malformed-manifest', `${manifestPath} is not valid JSON`);
  }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new InputError('malformed-manifest', `${manifestPath} is not a JSON object`);
  }
  for (const key of KEYS) {
    if (!(key in manifest)) throw new InputError('missing-field', key);
  }
  const extra = Object.keys(manifest).filter((key) => !KEYS.includes(key));
  if (extra.length > 0) throw new InputError('unknown-field', extra.join(', '));

  if (manifest.caseId !== caseId)
    throw new InputError('wrong-field', 'caseId must equal the folder');
  if (manifest.inputKind !== 'synthetic') {
    throw new InputError('wrong-field', 'inputKind must be "synthetic"');
  }
  if (typeof manifest.sourceVersion !== 'string' || manifest.sourceVersion.trim() === '') {
    throw new InputError('wrong-field', 'sourceVersion must be a non-empty string');
  }
  const date = manifest.sourceDate;
  if (
    typeof date !== 'string' ||
    !DATE.test(date) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  ) {
    throw new InputError('wrong-field', 'sourceDate must be a real date, YYYY-MM-DD');
  }
  checkFileName('requirementPath', manifest.requirementPath);
  const evidence = manifest.evidencePaths;
  if (!Array.isArray(evidence) || evidence.length === 0) {
    throw new InputError('wrong-field', 'evidencePaths must be a non-empty list');
  }
  evidence.forEach((value, i) => checkFileName(`evidencePaths[${i}]`, value));
  const all = [manifest.requirementPath, ...evidence];
  if (new Set(all).size !== all.length) {
    throw new InputError(
      'wrong-field',
      'a path is listed twice, or the requirement is also evidence',
    );
  }
  const missing = manifest.missingObservations;
  if (
    !Array.isArray(missing) ||
    missing.some((item) => typeof item !== 'string' || item.trim() === '')
  ) {
    throw new InputError('wrong-field', 'missingObservations must be a list of non-empty strings');
  }
  return { manifest, manifestPath, manifestBytes: Buffer.from(text, 'utf8') };
}

/**
 * The /self-heal reply to review: the named record if one is given, else the first (original)
 * recorded one (UTC-stamped names sort in time order).
 */
function answerToReview(caseId, named) {
  const dir = `${ANSWERS}/${caseId}`;
  try {
    plainEntry(dir, 'dir');
  } catch (error) {
    // A linked answers folder is refused as a link, not reported as "no record" (2026-11-09).
    if (error instanceof InputError && error.code === 'link-not-allowed') throw error;
    throw new InputError('no-answer-record', `no recorded /self-heal reply under ${dir}/`);
  }
  const names = readdirSync(join(ROOT, dir))
    .filter((name) => ANSWER_NAME.test(name))
    .sort();
  if (names.length === 0) {
    throw new InputError('no-answer-record', `no recorded /self-heal reply under ${dir}/`);
  }
  if (named) {
    if (!names.includes(named)) {
      throw new InputError(
        'no-answer-record',
        `${dir}/${named} is not a recorded /self-heal reply`,
      );
    }
    return `${dir}/${named}`;
  }
  return `${dir}/${names[0]}`;
}

/** That case's one row of the supplied checklist, via rubric-map.json (review mode only). */
function rubricRow(caseId) {
  const mapPath = 'evidence/agent-quality/rubric-map.json';
  const { text: mapText } = readListed(mapPath);
  let map;
  try {
    map = JSON.parse(mapText);
  } catch {
    throw new InputError('malformed-rubric-map', `${mapPath} is not valid JSON`);
  }
  const name = map && typeof map === 'object' && !Array.isArray(map) ? map[caseId] : undefined;
  if (typeof name !== 'string' || name.trim() === '') {
    throw new InputError('no-rubric-row', `${mapPath} names no checklist row for ${caseId}`);
  }
  const { text } = readListed('evidence/agent-quality/rubric.md');
  const rows = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith('|'))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
    .filter((cells) => cells.length === 2 && cells[0] === name);
  if (rows.length !== 1) {
    throw new InputError('no-rubric-row', `rubric.md has no single row named "${name}"`);
  }
  const rowText = `Practice case: ${rows[0][0]}\nSupplied review checklist: ${rows[0][1]}\n`;
  return {
    label: 'rubric-row',
    relPath: 'evidence/agent-quality/rubric.md',
    bytes: Buffer.from(rowText, 'utf8'),
    text: rowText,
  };
}

function parseArgs(argv) {
  if (argv.length !== 2) {
    throw new InputError('usage', 'expected: --self-heal <fixtures path> | --review <case-id>');
  }
  const [mode, raw] = argv;
  const value = raw.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (mode === '--self-heal') {
    const match = value.match(/^evidence\/agent-quality\/fixtures\/(case-\d{2})$/);
    if (!match) throw new InputError('bad-argument', `expected ${FIXTURES}/case-NN`);
    return { mode: 'self-heal', caseId: match[1] };
  }
  if (mode === '--review') {
    const parts = value.split(/\s+/);
    const named = parts[1] === undefined ? null : parts[1].replace(/\.md$/, '') + '.md';
    if (parts.length > 2 || !CASE_ID.test(parts[0]) || (named && !ANSWER_NAME.test(named))) {
      throw new InputError('bad-argument', 'expected case-NN [self-heal-YYYYMMDDTHHMMSSZ]');
    }
    return { mode: 'review', caseId: parts[0], named };
  }
  throw new InputError('usage', 'mode must be --self-heal or --review');
}

function build(argv) {
  const { mode, caseId, named } = parseArgs(argv);
  plainEntry(`${FIXTURES}/${caseId}`, 'dir');
  const { manifest, manifestPath, manifestBytes } = readManifest(caseId);

  const files = [
    { label: 'requirement', ...readListed(`${FIXTURES}/${caseId}/${manifest.requirementPath}`) },
    ...manifest.evidencePaths.map((name) => ({
      label: 'evidence',
      ...readListed(`${FIXTURES}/${caseId}/${name}`),
    })),
  ];
  // The case bundle alone, exactly what /self-heal hashes as bundleSha256 (added 2026-11-08, owner
  // approval): a review compares the reply with this value, not with its own larger bundle hash.
  const caseSha = sha256(
    [manifestBytes, ...files.map((f) => f.bytes)].map((b) => sha256(b)).join('\n'),
  );
  let answerRecord = null;
  let reviewHeader = [];
  if (mode === 'review') {
    answerRecord = answerToReview(caseId, named);
    const record = readListed(answerRecord);
    files.push({ label: 'original-answer', ...record });
    files.push(rubricRow(caseId));
    const recorded = (record.text.match(/^- bundleSha256: ([0-9a-f]{64})\s*$/m) ?? [])[1] ?? null;
    reviewHeader = [
      `caseBundleSha256: ${caseSha}`,
      `recordedBundleSha256: ${recorded ?? 'not recorded'}`,
      `caseBundleMatchesRecord: ${recorded === null ? 'not recorded' : recorded === caseSha ? 'yes' : 'no'}`,
    ];
  }
  const total = files.reduce((sum, file) => sum + file.bytes.length, manifestBytes.length);
  if (total > MAX_TOTAL_BYTES) throw new InputError('bundle-too-large', `${total} bytes`);

  const body = files
    .map((file) => {
      const name = file.relPath.startsWith(`${FIXTURES}/${caseId}/`)
        ? file.relPath.slice(`${FIXTURES}/${caseId}/`.length)
        : file.relPath;
      const text = file.text.endsWith('\n') ? file.text : `${file.text}\n`;
      return (
        `=== FILE ${file.label} ${name} sha256=${sha256(file.bytes)} bytes=${file.bytes.length}\n` +
        `${text}=== END FILE ${name}\n`
      );
    })
    .join('\n');
  const bundleSha = sha256(
    [manifestBytes, ...files.map((f) => f.bytes)].map((b) => sha256(b)).join('\n'),
  );
  const missing =
    manifest.missingObservations.length === 0
      ? ['missingObservations: none declared']
      : ['missingObservations:', ...manifest.missingObservations.map((item) => `- ${item}`)];

  return [
    'BUNDLE-STATUS: ok',
    `mode: ${mode}`,
    `caseId: ${manifest.caseId}`,
    `inputKind: ${manifest.inputKind}`,
    `sourceVersion: ${manifest.sourceVersion}`,
    `sourceDate: ${manifest.sourceDate}`,
    `manifest: ${manifestPath} sha256=${sha256(manifestBytes)}`,
    ...(answerRecord ? [`answerRecord: ${answerRecord}`] : []),
    `bundleSha256: ${bundleSha}`,
    ...reviewHeader,
    ...missing,
    '',
    body,
  ].join('\n');
}

try {
  process.stdout.write(build(process.argv.slice(2)));
} catch (error) {
  if (error instanceof InputError) {
    process.stdout.write(
      `BUNDLE-STATUS: input-error ${error.code}\nINPUT ERROR: ${error.message}\n`,
    );
  } else {
    process.stdout.write('BUNDLE-STATUS: input-error internal\nINPUT ERROR: unexpected failure\n');
  }
  process.exitCode = 0;
}
