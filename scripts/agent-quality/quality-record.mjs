// Job record, input validation and finding validation for the manual quality runner
// (Week 5, rule 60 "Manual quality runner"). Node built-ins only. No `claude`, no network, no model.
// Used by scripts/agent-quality/quality-run.mjs; checked by safety-tests/quality-run.test.mjs.
//
// It only reads the files a job selects and writes only inside the task's ignored `.qa-quality/` folder
// (callers pass the paths). It never touches answers/, the scorecard, settings or hooks.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';

export const SCHEMA = 'quality-job/1';
export const ACTION = 'review-self-heal-reply';
export const TASK_ID = 'week5-quality-runner';
export const STATUSES = ['claimed', 'calling', 'completed', 'failed'];
export const VERDICTS = ['supported', 'not supported', 'insufficient evidence'];
export const CHECK_NAMES = [
  'Preserved requirement',
  'Relevance',
  'Assumptions',
  'Proposed action',
  'Checklist row',
];

export class QualityError extends Error {
  constructor(code, detail) {
    super(detail);
    this.code = code;
  }
}

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** The job id: a hash of every input that decides what the review means. */
export function jobIdFor(parts) {
  const keys = [
    'action',
    'caseId',
    'proposalRef',
    'proposalSha256',
    'reviewerBundleSha256',
    'instructionsSha256',
    'rubricRowSha256',
    'claudeVersion',
    'bundleScriptSha256',
    'runWorkerSha256',
    'qualityRecordSha256',
    'qualityRunSha256',
    'triageDraftSha256',
    'supersedes',
  ];
  const canonical = keys.map((key) => `${key}=${parts[key] ?? ''}`).join('\n');
  return sha256(canonical);
}

/** Writes a file in the same folder first, then renames it, so a reader sees all or nothing. */
export function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Math.random().toString(16).slice(2, 8)}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

const same = (a, b) =>
  process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

/**
 * A selected file must resolve, through every parent folder, to exactly the path it names under the
 * real root: a link, junction or short name anywhere on the way changes the resolved path and is refused.
 * Returns the resolved absolute path.
 */
export function checkInScope(root, rel) {
  if (
    typeof rel !== 'string' ||
    rel === '' ||
    rel.includes('\\') ||
    rel.startsWith('/') ||
    /(^|\/)\.\.?(\/|$)/.test(rel)
  ) {
    throw new QualityError('bad-path', `not a plain relative path: ${String(rel).slice(0, 80)}`);
  }
  let realRoot;
  let real;
  try {
    realRoot = realpathSync.native(root);
    real = realpathSync.native(join(root, rel));
  } catch {
    throw new QualityError('missing-file', `${rel} does not exist`);
  }
  const expected = join(realRoot, ...rel.split('/'));
  if (
    !same(real, expected) ||
    !(real.length > realRoot.length && real.startsWith(realRoot + sep))
  ) {
    throw new QualityError(
      'path-escape',
      `${rel} resolves outside its expected place (link or alias)`,
    );
  }
  return real;
}

/** sha256 and size of one selected file, read after the scope check. */
export function fingerprint(root, rel) {
  const abs = checkInScope(root, rel);
  const bytes = readFileSync(abs);
  return { path: rel, sha256: sha256(bytes), bytes: bytes.length };
}

/** Parses the header lines and FILE blocks of bundle.mjs output. */
export function parseBundle(text) {
  if (!text.startsWith('BUNDLE-STATUS: ok\n')) {
    const first = text.split('\n')[0] ?? '';
    const detail = text.split('\n')[1] ?? '';
    throw new QualityError('input-invalid', `${first} ${detail}`.trim().slice(0, 200));
  }
  const header = {};
  const headEnd = text.indexOf('\n=== FILE ');
  for (const line of text.slice(0, headEnd < 0 ? text.length : headEnd).split('\n')) {
    const m = line.match(/^([A-Za-z0-9]+): (.*)$/);
    if (m) header[m[1]] = m[2];
  }
  const files = [];
  const re =
    /^=== FILE (\S+) (\S+) sha256=([0-9a-f]{64}) bytes=(\d+)\n([\s\S]*?)^=== END FILE \2\n/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    files.push({ label: m[1], name: m[2], sha256: m[3], bytes: Number(m[4]), text: m[5] });
  }
  return { header, files };
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Strict shape check of job.json. A record that fails is malformed and stops any run. */
export function validateJobRecord(job) {
  const bad = (why) => {
    throw new QualityError('malformed-record', why);
  };
  if (!isObject(job)) bad('job.json is not an object');
  const KEYS = [
    'schema',
    'jobId',
    'action',
    'taskId',
    'caseId',
    'inputKind',
    'source',
    'dirty',
    'evidence',
    'declaredMissingObservations',
    'proposal',
    'rubric',
    'reviewerBundleSha256',
    'procedure',
    'checksRun',
    'state',
    'supersedes',
    'createdAt',
  ];
  for (const key of KEYS) if (!(key in job)) bad(`missing field ${key}`);
  const extra = Object.keys(job).filter((key) => !KEYS.includes(key));
  if (extra.length > 0) bad(`unknown field ${extra.join(', ')}`);
  if (job.schema !== SCHEMA) bad('wrong schema');
  if (job.action !== ACTION) bad('unsupported action');
  if (!/^[0-9a-f]{64}$/.test(job.jobId)) bad('jobId is not a sha256');
  if (!/^case-\d{2}$/.test(job.caseId)) bad('caseId');
  if (job.inputKind !== 'synthetic') bad('inputKind');
  if (!Array.isArray(job.evidence) || job.evidence.length === 0) bad('evidence');
  for (const item of job.evidence) {
    if (
      !isObject(item) ||
      typeof item.path !== 'string' ||
      !/^[0-9a-f]{64}$/.test(item.sha256 ?? '')
    ) {
      bad('evidence item');
    }
  }
  if (!Array.isArray(job.dirty)) bad('dirty');
  if (!Array.isArray(job.declaredMissingObservations)) bad('declaredMissingObservations');
  if (!Array.isArray(job.checksRun)) bad('checksRun');
  if (!isObject(job.proposal) || typeof job.proposal.ref !== 'string') bad('proposal');
  if (!isObject(job.procedure) || !isObject(job.rubric) || !isObject(job.source)) bad('procedure');
  if (!/^[0-9a-f]{64}$/.test(job.reviewerBundleSha256)) bad('reviewerBundleSha256');
  if (!isObject(job.state) || !STATUSES.includes(job.state.status)) bad('state.status');
  if (job.state.status === 'failed' && typeof job.state.failure !== 'string') bad('state.failure');
  if (job.supersedes !== null && !/^[0-9a-f]{64}$/.test(job.supersedes)) bad('supersedes');
  return job;
}

/** Recomputes the id from the record itself. A mismatch means the record was altered. */
export function recordIdMatches(job) {
  const p = job.procedure;
  const id = jobIdFor({
    action: job.action,
    caseId: job.caseId,
    proposalRef: job.proposal.ref,
    proposalSha256: job.proposal.sha256,
    reviewerBundleSha256: job.reviewerBundleSha256,
    instructionsSha256: p.instructionsSha256,
    rubricRowSha256: job.rubric.rowSha256,
    claudeVersion: p.claudeVersion,
    bundleScriptSha256: p.bundleScriptSha256,
    runWorkerSha256: p.runWorkerSha256,
    qualityRecordSha256: p.qualityRecordSha256,
    qualityRunSha256: p.qualityRunSha256,
    triageDraftSha256: p.triageDraftSha256,
    supersedes: job.supersedes,
  });
  return id === job.jobId;
}

function resolveJson(value, loc) {
  const parts = loc
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
  let cur = value;
  for (const part of parts) {
    if (cur === null || typeof cur !== 'object' || !(part in cur)) return false;
    cur = cur[part];
  }
  return true;
}

/** Checks references against the bundle's own files. Unknown forms are counted, never guessed. */
export function checkReferences(cells, files) {
  const byName = new Map();
  for (const f of files) {
    byName.set(f.name, f);
    if (f.label === 'original-answer') byName.set('original-answer', f);
    if (f.label === 'rubric-row') byName.set('rubric.md', f);
  }
  const resolved = [];
  const unresolved = [];
  const unchecked = [];
  for (const cell of cells) {
    let current = null;
    for (const raw of cell.replace(/`/g, '').split(/[;,]/)) {
      const token = raw.trim();
      if (!token) continue;
      const m = token.match(/^([A-Za-z0-9._/-]+)?#(.+)$/);
      if (!m) {
        const bare = token.match(/^([A-Za-z0-9._/-]+)\b/);
        if (bare && byName.has(bare[1])) current = bare[1];
        unchecked.push(token);
        continue;
      }
      const name = m[1] ?? current;
      const loc = m[2].trim();
      if (name === 'header') {
        // The bundle's own header lines (for example missingObservations) are not a file.
        unchecked.push(token);
        continue;
      }
      if (!name || !byName.has(name)) {
        unresolved.push(token);
        continue;
      }
      current = name;
      const file = byName.get(name);
      const range = loc.match(/^(\d+)(?:[-–](\d+))?$/);
      if (range) {
        const total = file.text.replace(/\n$/, '').split('\n').length;
        const lo = Number(range[1]);
        const hi = Number(range[2] ?? range[1]);
        // A file may print its own line numbers (an excerpt of a larger file: "44  await expect(...)"). A
        // number beyond the file's own line count then resolves only if every cited number is printed
        // at the start of a line of the file; otherwise it stays unresolved.
        const printed = (n) => new RegExp(`^\\s*${n}\\s`, 'm').test(file.text);
        let inRange = lo >= 1 && hi >= lo && hi <= total;
        if (!inRange && lo >= 1 && hi >= lo && hi - lo < 50) {
          inRange = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).every(printed);
        }
        (inRange ? resolved : unresolved).push(token);
      } else if (name.endsWith('.json')) {
        let value;
        try {
          value = JSON.parse(file.text);
        } catch {
          unchecked.push(token);
          continue;
        }
        (resolveJson(value, loc) ? resolved : unresolved).push(token);
      } else {
        unchecked.push(token);
      }
    }
  }
  const unique = (list) => [...new Set(list)];
  return {
    resolved: unique(resolved),
    unresolved: unique(unresolved),
    unchecked: unique(unchecked),
  };
}

const normVerdict = (cell) => cell.replace(/[*_`]/g, '').trim().toLowerCase();

/**
 * Validates the reviewer's reply against the job. Structure problems make the reply unusable
 * (`ok: false`); unresolved references are reported as warnings for the owner to judge. Whether each
 * causal claim is actually supported by the evidence cannot be decided here: that stays a review.
 */
export function validateFinding(reply, ctx) {
  const problems = [];
  const lines = reply.replace(/\r\n/g, '\n').split('\n');
  const first = lines.find((line) => line.trim() !== '') ?? '';
  const hash = first.match(/^bundleSha256:\s*([0-9a-f]{64})\s*$/);
  if (!hash || hash[1] !== ctx.reviewerBundleSha256)
    problems.push('bundleSha256 header missing or different');
  const rec = lines.find((line) => /^answerRecord:/.test(line));
  if (!rec || rec.replace(/^answerRecord:\s*/, '').trim() !== ctx.answerRecord) {
    problems.push('answerRecord header missing or different');
  }
  const rows = [];
  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => c.trim());
    const num = (cells[0] ?? '').match(/^(\d)\.\s*(.+)$/);
    if (!num || cells.length < 4) continue;
    rows.push({
      n: Number(num[1]),
      name: num[2],
      verdict: normVerdict(cells[1]),
      references: cells[2],
      reason: cells.slice(3).join(' | '),
    });
  }
  const checks = [];
  for (let n = 1; n <= CHECK_NAMES.length; n += 1) {
    const found = rows.filter((row) => row.n === n);
    if (found.length !== 1) {
      problems.push(`check ${n} appears ${found.length} times`);
      continue;
    }
    const row = found[0];
    if (!VERDICTS.includes(row.verdict)) problems.push(`check ${n} has no allowed verdict`);
    if (row.references === '' || row.reason === '')
      problems.push(`check ${n} lacks references or a reason`);
    checks.push(row);
  }
  const overall = reply.match(
    /\*\*Overall\*\*:?\s*\**\s*(supported|not supported|insufficient evidence)\b/i,
  );
  if (!overall) problems.push('no overall verdict');
  if (!/\*\*Not checked\*\*/i.test(reply)) problems.push('no "Not checked" section');
  const referenceCheck = checkReferences(
    checks.map((c) => c.references),
    ctx.files,
  );
  return {
    ok: problems.length === 0,
    problems,
    finding: {
      advisory: true,
      overall: overall ? overall[1].toLowerCase() : null,
      checks: checks.map(({ n, name, verdict, references, reason }) => ({
        n,
        name,
        verdict,
        references,
        reason,
      })),
      referenceCheck,
      warnings:
        referenceCheck.unresolved.length > 0
          ? ['some references do not resolve to the bundle']
          : [],
      causalClaims:
        'not mechanically verified; the owner must check each cause against the cited evidence',
    },
  };
}
