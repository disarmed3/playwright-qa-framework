// Shared helpers for the Jira integration scripts (Week 5 Task 04, rule 55). Node built-ins only.
// Nothing here reads .env, the network or process.env; callers pass what they need.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

export class Refusal extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

// ---------- canonical JSON and digests ----------

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
export const sha256 = (text) => createHash('sha256').update(text).digest('hex');
export const sha256File = (path) => sha256(readFileSync(path));
export const digest12 = (value) => sha256(canonical(value)).slice(0, 12);

// ---------- text safety ----------

// Known credential shapes. Assembled so this file holds no literal token.
const CREDENTIAL_PATTERNS = [
  new RegExp('AT' + 'ATT[A-Za-z0-9_=-]{12,}'),
  new RegExp('xo' + 'x[abp]-[A-Za-z0-9-]{8,}'),
  new RegExp('gh' + '[pousr]_[A-Za-z0-9]{20,}'),
  new RegExp('Bear' + 'er\\s+[A-Za-z0-9._~+/=-]{12,}', 'i'),
  new RegExp('Bas' + 'ic\\s+[A-Za-z0-9+/=]{16,}', 'i'),
  /\b(?:password|passwd|api[_-]?token|secret)\s*[:=]\s*\S{4,}/i,
  /JIRA_(?:WRITE_)?(?:API_TOKEN|EMAIL|BASE_URL)\s*=/,
  /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/, // a card-like number
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // an e-mail address
];
export function credentialLike(text) {
  return CREDENTIAL_PATTERNS.some((p) => p.test(String(text)));
}
export function stripAnsi(text) {
  return String(text).replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '');
}
// Skip reasons come from test annotations and may carry mentor or allocation wording. Keep the
// reason, drop the internal reference tokens, one line, capped.
export function cleanReason(text) {
  return stripAnsi(text)
    .replace(/\bmentor\s+M\d+\s*(\(Q\d+\))?\s*:?\s*/gi, '')
    .replace(/\bQ\d+\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

// ---------- test and TC identity ----------

// A Playwright suite whose title is just the spec file's path (either slash style) adds nothing to a
// test identity; the file is already the first part.
export const isFileTitle = (title) =>
  /\.(spec|test)\.[cm]?[jt]sx?$/.test(String(title).replace(/\\/g, '/'));

export const TC_ID = /\b(TC-[A-Z]+-\d+)\b/;
export const tcOf = (title) => (String(title).match(/^(TC-[A-Z]+-\d+)\b/) || [])[1] || null;

// ---------- native Playwright JSON report ----------

const SYNTHETIC = [
  /evidence[\\/]fixtures[\\/]/,
  /evidence[\\/]raw[\\/]week4[\\/]triage/,
  /triage-draft/,
];

// Outcome comes from the test-level status and its last result, never from the spec-level `ok`
// (a skipped test has ok: true).
export function outcomeOf(test) {
  const results = test.results || [];
  const last = results[results.length - 1];
  const final = last?.status;
  if (test.status === 'skipped' || final === 'skipped') return 'skipped';
  if (test.status === 'flaky') return 'flaky';
  if (test.status === 'expected' && final === 'passed') return 'passed';
  if (test.status === 'unexpected' && ['failed', 'timedOut', 'interrupted'].includes(final))
    return 'failed';
  return 'unknown';
}

export function readReport(path) {
  if (SYNTHETIC.some((p) => p.test(path)))
    throw new Refusal('a synthetic fixture or triage output is not run evidence', 2);
  if (!existsSync(path)) throw new Refusal('report file not found', 2);
  const text = readFileSync(path, 'utf8');
  let report;
  try {
    report = JSON.parse(text);
  } catch {
    throw new Refusal('report is not valid JSON', 2);
  }
  if (
    !report ||
    typeof report !== 'object' ||
    !Array.isArray(report.suites) ||
    !report.stats ||
    !report.config
  )
    throw new Refusal('not a native Playwright JSON report', 2);
  if (Array.isArray(report.errors) && report.errors.length > 0)
    throw new Refusal('report has global errors; not usable as run evidence', 2);
  const rows = [];
  const walk = (suite, chain) => {
    const here = suite.title && !isFileTitle(suite.title) ? [...chain, suite.title] : chain;
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const skip = (test.annotations || []).find((a) => a.type === 'skip');
        const last = (test.results || []).slice(-1)[0];
        rows.push({
          identity: `${(spec.file || suite.file || '').replace(/\\/g, '/')} > ${[...here, spec.title].join(' > ')} [${test.projectName || 'project?'}]`,
          file: (spec.file || suite.file || '').replace(/\\/g, '/'),
          title: spec.title,
          tcId: tcOf(spec.title),
          project: test.projectName || null,
          outcome: outcomeOf(test),
          retries: Math.max(0, (test.results || []).length - 1),
          finalStatus: last?.status ?? null,
          skipReason: skip?.description ? cleanReason(skip.description) : null,
          // Kept for /report-bug only. /writeback never copies an error message into a comment.
          firstError:
            stripAnsi(last?.error?.message || last?.errors?.[0]?.message || '')
              .split('\n')
              .map((l) => l.trim())
              .find(Boolean)
              ?.slice(0, 200) || null,
        });
      }
    }
    for (const child of suite.suites || []) walk(child, here);
  };
  for (const s of report.suites) walk(s, []);
  const s = report.stats;
  const counted = (s.expected || 0) + (s.unexpected || 0) + (s.skipped || 0) + (s.flaky || 0);
  if (rows.length === 0 || counted !== rows.length)
    throw new Refusal(`report stats (${counted}) do not match its tests (${rows.length})`, 2);
  return { report, rows, sha256: sha256(text), startTime: s.startTime, stats: s };
}

// provenance.txt written by the run (evidence/raw/week4/<area>/<UTC>/provenance.txt)
export function readProvenance(path, startTime) {
  if (!path || !existsSync(path))
    throw new Refusal('provenance file is required and was not found', 2);
  const text = readFileSync(path, 'utf8');
  const field = (name) =>
    (text.match(new RegExp(`^${name}:\\s*(.+)$`, 'm')) || [])[1]?.trim() || null;
  const utc = field('utc_start');
  const target = field('target') || '';
  const head = field('head');
  if (!utc || !/^\d{8}T\d{6}Z$/.test(utc) || !head)
    throw new Refusal('provenance lacks utc_start or head', 2);
  if (!/^dev\b/.test(target)) throw new Refusal('provenance target is not dev', 2);
  const iso = `${utc.slice(0, 4)}-${utc.slice(4, 6)}-${utc.slice(6, 8)}T${utc.slice(9, 11)}:${utc.slice(11, 13)}:${utc.slice(13, 15)}Z`;
  const gap = (Date.parse(startTime) - Date.parse(iso)) / 1000;
  if (!(gap >= -5 && gap <= 180))
    throw new Refusal('provenance start time does not match the report', 2);
  const block = (text.match(/^git_status:\n([\s\S]*?)^git_diff_stat:/m) || [])[1] || '';
  const lines = block.split('\n').filter((l) => l.trim());
  return {
    utc,
    head: head.slice(0, 8),
    path: path.replace(/\\/g, '/'),
    modified: lines.filter((l) => /^\s*M/.test(l)).length,
    untracked: lines.filter((l) => /^\?\?/.test(l)).length,
    uncommitted: lines.length > 0,
  };
}

// ---------- Jira site and ADF ----------

export function siteOrigin(value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new Refusal('site is not a URL', 2);
  }
  if (
    u.protocol !== 'https:' ||
    !u.hostname.endsWith('.atlassian.net') ||
    u.username ||
    u.password ||
    u.pathname !== '/' ||
    u.search ||
    u.hash
  )
    throw new Refusal('site must be a bare https://<site>.atlassian.net origin', 2);
  return u.origin;
}
export function adf(lines) {
  return {
    type: 'doc',
    version: 1,
    content: lines.map((t) => ({
      type: 'paragraph',
      content: t ? [{ type: 'text', text: t }] : [],
    })),
  };
}
export function adfText(doc) {
  const out = [];
  for (const p of doc?.content || []) out.push((p.content || []).map((n) => n.text || '').join(''));
  return out.join('\n');
}
