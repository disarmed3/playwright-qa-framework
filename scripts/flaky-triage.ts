#!/usr/bin/env node
// Flaky triage for native Playwright JSON reports (Week 4 Task 04). Node built-ins only; runs on
// Node's own type stripping (`process.features.typescript`), so only erasable TypeScript is used.
//
//   node scripts/flaky-triage.ts <report.json> [<report.json> ...] [--out <dir>]
//
// Two detection paths that never share a count:
//   1. Within a run: an execution whose native `test.status` is 'flaky' (failed, then passed on a
//      retry). Measurable only for executions whose project had retries > 0.
//   2. Across runs: one identity's native `test.status` differs between the runs that contain it.
//      A flaky result is its own value ('flaky'), never folded into a pass.
// Identity = projectId + spec.file + title path without the top-level file suite. Nothing is
// merged by title. line:column is a signal (code moved), never part of the key.
// Different results under changed or unknown conditions are not proof of nondeterminism; the
// script never assigns a cause and only lists evidence to inspect.
//
// Provenance: a `provenance.txt` next to a report is read (key: value lines, `--- git status
// --short` and `--- git diff --stat` blocks). Missing fields are reported as unknown by name.
// `synthetic: true` marks a practice fixture; synthetic and real inputs never mix in one call.
//
// Output: <out>/<UTC>/flaky-report.md and inputs.json, default out evidence/raw/week4/flaky-triage
// (git-ignored). Written to a temporary folder and renamed only on success; nothing on error.
// The last stdout line is always `flaky-triage: exit <n> report: <path>` or `... error: <kind>`.
//
// Exit: 0 report written (findings are informational); 1 input or usage error; 2 malformed JSON;
// 3 unsupported report; 4 internal failure (crash, stats mismatch, output not writable).

import type { JSONReport, JSONReportSuite, JSONReportTest } from '@playwright/test/reporter';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');
const DEFAULT_OUT = join(ROOT, 'evidence', 'raw', 'week4', 'flaky-triage');
const SUPPORTED_MAJOR = 1;

type Kind =
  | 'usage'
  | 'missing'
  | 'unreadable'
  | 'directory'
  | 'empty'
  | 'duplicate-path'
  | 'duplicate-content'
  | 'mixed-synthetic'
  | 'malformed'
  | 'unsupported'
  | 'stats-mismatch'
  | 'output'
  | 'internal';

const EXIT: Record<Kind, number> = {
  usage: 1,
  missing: 1,
  unreadable: 1,
  directory: 1,
  empty: 1,
  'duplicate-path': 1,
  'duplicate-content': 1,
  'mixed-synthetic': 1,
  malformed: 2,
  unsupported: 3,
  'stats-mismatch': 4,
  output: 4,
  internal: 4,
};

class TriageError extends Error {
  kind: Kind;
  where: string;
  constructor(kind: Kind, where: string, reason: string) {
    super(reason);
    this.kind = kind;
    this.where = where;
  }
}

// ---------- redaction ----------

const slashVariants = (p: string): string[] => {
  const back = p.replace(/\//g, '\\');
  const fwd = p.replace(/\\/g, '/');
  return [...new Set([back, fwd])];
};
const REDACTIONS: [string, string][] = [
  ...slashVariants(ROOT).map((v): [string, string] => [v, '<repo>']),
  ...slashVariants(homedir()).map((v): [string, string] => [v, '<home>']),
];
function redact(text: string): string {
  let out = text;
  for (const [from, to] of REDACTIONS) {
    if (!from) continue;
    const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, to);
  }
  return out;
}
const shown = (p: string): string => {
  const rel = relative(process.cwd(), p);
  return redact(rel && !rel.startsWith('..') ? rel.replace(/\\/g, '/') : p);
};

// ---------- arguments ----------

type Args = { inputs: string[]; out: string };
function parseArgs(argv: string[]): Args {
  const inputs: string[] = [];
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') {
      const v = argv[++i];
      if (!v) throw new TriageError('usage', '--out', 'needs a directory');
      out = resolve(v);
    } else if (a.startsWith('--out=')) {
      const v = a.slice('--out='.length);
      if (!v) throw new TriageError('usage', '--out', 'needs a directory');
      out = resolve(v);
    } else if (a.startsWith('-')) {
      throw new TriageError('usage', a, 'unknown option');
    } else {
      inputs.push(a);
    }
  }
  if (inputs.length === 0) {
    throw new TriageError(
      'usage',
      '(no input)',
      'give one or more local Playwright JSON report paths: node scripts/flaky-triage.ts <report.json> [...] [--out <dir>]',
    );
  }
  return { inputs, out };
}

// ---------- provenance ----------

type Provenance = {
  found: boolean;
  path: string;
  fields: Record<string, string>;
  status: string[] | null; // null = no git status block
  diffStat: string[] | null;
};

function readProvenance(reportPath: string): Provenance {
  const p = join(dirname(reportPath), 'provenance.txt');
  const prov: Provenance = { found: false, path: p, fields: {}, status: null, diffStat: null };
  if (!existsSync(p)) return prov;
  prov.found = true;
  let section: 'none' | 'status' | 'diff' = 'none';
  for (const raw of readFileSync(p, 'utf8').replace(/\r/g, '').split('\n')) {
    if (raw === '--- git status --short') {
      section = 'status';
      prov.status = [];
      continue;
    }
    if (raw === '--- git diff --stat') {
      section = 'diff';
      prov.diffStat = [];
      continue;
    }
    const kv = /^([a-z_]+):\s?(.*)$/.exec(raw);
    if (kv) {
      section = 'none';
      prov.fields[kv[1]] = kv[2].trim();
      continue;
    }
    if (!raw.trim()) continue;
    if (section === 'status') prov.status!.push(raw);
    else if (section === 'diff') prov.diffStat!.push(raw);
  }
  return prov;
}
const firstToken = (v: string | undefined): string | undefined =>
  v ? v.trim().split(/\s+/)[0] : undefined;

// ---------- input loading ----------

type Run = {
  index: number;
  path: string;
  bytes: number;
  sha256: string;
  report: JSONReport;
  prov: Provenance;
  synthetic: boolean;
  label: string;
  testDirRel: string | null;
};

function loadInput(input: string, index: number): Run {
  const path = resolve(input);
  const where = shown(path);
  if (!existsSync(path)) throw new TriageError('missing', where, 'file does not exist');
  let st;
  try {
    st = statSync(path);
  } catch {
    throw new TriageError('unreadable', where, 'cannot stat the file');
  }
  if (st.isDirectory())
    throw new TriageError('directory', where, 'is a directory; give a report file');
  let buf: Buffer;
  try {
    buf = readFileSync(path);
  } catch {
    throw new TriageError('unreadable', where, 'cannot read the file');
  }
  if (buf.length === 0) throw new TriageError('empty', where, 'file is empty (0 bytes)');
  let parsed: unknown;
  try {
    parsed = JSON.parse(buf.toString('utf8'));
  } catch (e) {
    throw new TriageError(
      'malformed',
      where,
      `not valid JSON (${(e as Error).message.split('\n')[0]})`,
    );
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TriageError('malformed', where, 'top level is not a JSON object');
  }
  const report = checkSupported(parsed as Record<string, unknown>, where);
  const prov = readProvenance(path);
  const runLabel = prov.fields.run_id || dirname(path).split(/[\\/]/).pop() || `run-${index + 1}`;
  return {
    index,
    path,
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
    report,
    prov,
    synthetic: prov.fields.synthetic === 'true',
    label: runLabel,
    testDirRel: testDirRelative(report),
  };
}

function checkSupported(r: Record<string, unknown>, where: string): JSONReport {
  const config = r.config as Record<string, unknown> | undefined;
  const missing: string[] = [];
  if (!config || typeof config !== 'object') missing.push('config');
  else if (typeof config.version !== 'string') missing.push('config.version');
  if (!Array.isArray(r.suites)) missing.push('suites');
  if (!r.stats || typeof r.stats !== 'object') missing.push('stats');
  if (!Array.isArray(r.errors)) missing.push('errors');
  if (missing.length) {
    throw new TriageError(
      'unsupported',
      where,
      `not a Playwright JSON report (missing ${missing.join(', ')})`,
    );
  }
  const report = r as unknown as JSONReport;
  const major = Number(String(report.config.version).split('.')[0]);
  if (major !== SUPPORTED_MAJOR) {
    throw new TriageError(
      'unsupported',
      where,
      `Playwright ${report.config.version}; only major ${SUPPORTED_MAJOR} is supported`,
    );
  }
  if (!Array.isArray(report.config.projects)) {
    throw new TriageError('unsupported', where, 'config.projects is missing');
  }
  if (report.config.shard !== null && report.config.shard !== undefined) {
    throw new TriageError(
      'unsupported',
      where,
      'sharded report (config.shard is set); merge-reports output is not supported',
    );
  }
  const repeat = report.config.projects.find((p) => (p.repeatEach ?? 1) > 1);
  if (repeat) {
    throw new TriageError(
      'unsupported',
      where,
      `--repeat-each run (project "${repeat.name}" repeatEach ${repeat.repeatEach})`,
    );
  }
  for (const { spec } of walkSpecs(report.suites)) {
    const seen = new Set<string>();
    for (const t of spec.tests) {
      if (seen.has(t.projectId)) {
        throw new TriageError(
          'unsupported',
          where,
          `same project twice in one spec (repeat-each): ${spec.file} › ${spec.title}`,
        );
      }
      seen.add(t.projectId);
    }
  }
  return report;
}

function* walkSpecs(
  suites: JSONReportSuite[],
  titles: string[] = [],
  depth = 0,
): Generator<{ spec: JSONReportSuite['specs'][number]; titles: string[] }> {
  for (const s of suites) {
    // Depth 0 is the file suite; its title is the OS-specific path, so it is not part of the key.
    const path = depth === 0 ? [] : [...titles, s.title];
    for (const spec of s.specs ?? []) yield { spec, titles: path };
    yield* walkSpecs(s.suites ?? [], path, depth + 1);
  }
}

function testDirRelative(report: JSONReport): string | null {
  const root = String(report.config.rootDir ?? '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
  if (!root) return null;
  if (root.startsWith('<repo>/')) return root.slice('<repo>/'.length);
  const repo = ROOT.replace(/\\/g, '/');
  if (root.toLowerCase().startsWith(repo.toLowerCase() + '/')) return root.slice(repo.length + 1);
  return null;
}

// ---------- executions ----------

type Execution = {
  run: Run;
  key: string;
  display: string;
  specId: string;
  file: string;
  location: string;
  projectName: string;
  retries: number | null;
  test: JSONReportTest;
};

function executions(run: Run): Execution[] {
  const projects = new Map(run.report.config.projects.map((p) => [p.id, p]));
  const out: Execution[] = [];
  for (const { spec, titles } of walkSpecs(run.report.suites)) {
    const file = spec.file.replace(/\\/g, '/');
    const titlePath = [...titles, spec.title];
    for (const t of spec.tests) {
      const proj = projects.get(t.projectId);
      out.push({
        run,
        key: JSON.stringify([t.projectId, file, ...titlePath]),
        display: `[${t.projectName}] ${file} › ${titlePath.join(' › ')}`,
        specId: spec.id,
        file,
        location: `${file}:${spec.line}:${spec.column}`,
        projectName: t.projectName,
        retries: proj ? proj.retries : null,
        test: t,
      });
    }
  }
  return out;
}

function checkStats(run: Run, execs: Execution[]): void {
  const count = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 };
  for (const e of execs) count[e.test.status]++;
  const s = run.report.stats;
  const bad = (Object.keys(count) as (keyof typeof count)[]).filter((k) => count[k] !== s[k]);
  if (bad.length) {
    throw new TriageError(
      'stats-mismatch',
      shown(run.path),
      `counted tests differ from native stats: ${bad.map((k) => `${k} ${count[k]} vs ${s[k]}`).join(', ')}`,
    );
  }
  const flakyWithoutRetries = execs.find(
    (e) => e.test.status === 'flaky' && !(e.retries && e.retries > 0),
  );
  if (flakyWithoutRetries) {
    throw new TriageError(
      'stats-mismatch',
      shown(run.path),
      `flaky status without retries: ${flakyWithoutRetries.display}`,
    );
  }
}

// ---------- run conditions ----------

type Cond = { value: string | null }; // null = unknown

function scopeOf(run: Run): Cond {
  const argv = (run.report.config as { argv?: unknown }).argv;
  if (!Array.isArray(argv)) return { value: null };
  const i = argv.indexOf('test');
  const rest = (i >= 0 ? argv.slice(i + 1) : []).map(String);
  const parts: string[] = [];
  const valued = ['--grep', '-g', '--grep-invert', '--project', '--config', '-c'];
  for (let k = 0; k < rest.length; k++) {
    const a = rest[k];
    if (valued.includes(a)) {
      if (a !== '--config' && a !== '-c') parts.push(`${a} ${rest[k + 1] ?? ''}`.trim());
      k++;
    } else if (/^--(grep|grep-invert|project)=/.test(a)) parts.push(a);
    else if (a === '--last-failed' || a.startsWith('--only-changed')) parts.push(a);
    else if (!a.startsWith('-')) parts.push(a.replace(/\\/g, '/'));
  }
  return { value: parts.length ? parts.join(' ') : '(all)' };
}

function runConditions(run: Run): Record<string, Cond> {
  const f = run.prov.fields;
  const projects = run.report.config.projects;
  return {
    head: { value: f.head ?? null },
    'uncommitted tracked changes': {
      value:
        run.prov.status === null
          ? null
          : run.prov.status.some((l) => !l.startsWith('??'))
            ? 'yes'
            : 'no',
    },
    target_env: { value: firstToken(f.target_env) ?? null },
    target_url: { value: firstToken(f.target_url) ?? null },
    'playwright version': { value: run.report.config.version ?? null },
    projects: {
      value: projects
        .map((p) => p.name)
        .sort()
        .join(', '),
    },
    retries: {
      value: projects
        .map((p) => `${p.name}=${p.retries}`)
        .sort()
        .join(', '),
    },
    workers: {
      value: run.report.config.workers === undefined ? null : String(run.report.config.workers),
    },
    scope: scopeOf(run),
  };
}

// Test code state for one execution: is the spec file untracked or modified in that run's tree?
function codeState(e: Execution): 'clean' | 'modified' | 'untracked' | 'unknown' {
  const { run } = e;
  if (run.prov.status === null || run.testDirRel === null) return 'unknown';
  const repoPath = `${run.testDirRel}/${e.file}`;
  for (const line of run.prov.status) {
    const p = line.slice(3).trim().replace(/\\/g, '/').replace(/^"|"$/g, '');
    if (!p) continue;
    const hit = p.endsWith('/') ? repoPath.startsWith(p) : repoPath === p;
    if (hit) return line.startsWith('??') ? 'untracked' : 'modified';
  }
  return 'clean';
}

// ---------- comparison ----------

type Group = { key: string; display: string; execs: Execution[] };
type FieldState = { field: string; state: 'match' | 'differs' | 'unknown'; detail: string };

function compare(group: Group, totalRuns: number) {
  const ran = group.execs.filter((e) => e.test.status !== 'skipped');
  const skipped = group.execs.filter((e) => e.test.status === 'skipped');
  const compared = `compared in ${ran.length} of ${totalRuns} runs`;
  if (group.execs.length < 2)
    return { label: 'single run', compared, fields: [] as FieldState[], ran, skipped };
  if (ran.length < 2)
    return {
      label: 'skipped in some or all runs',
      compared,
      fields: [] as FieldState[],
      ran,
      skipped,
    };
  const statuses = new Set(ran.map((e) => e.test.status));
  const fields: FieldState[] = [];
  const conds = ran.map((e) => runConditions(e.run));
  for (const name of Object.keys(conds[0])) {
    const vals = conds.map((c) => c[name].value);
    const unknownIn = ran.filter((_, i) => vals[i] === null).map((e) => e.run.label);
    if (unknownIn.length)
      fields.push({ field: name, state: 'unknown', detail: `unknown in ${unknownIn.join(', ')}` });
    else if (new Set(vals).size > 1)
      fields.push({ field: name, state: 'differs', detail: vals.join(' → ') });
    else fields.push({ field: name, state: 'match', detail: String(vals[0]) });
  }
  const states = ran.map(codeState);
  if (states.some((s) => s !== 'clean')) {
    fields.push({
      field: 'test code',
      state: 'unknown',
      detail: ran.map((e, i) => `${e.run.label}: ${states[i]}`).join(', '),
    });
  } else fields.push({ field: 'test code', state: 'match', detail: 'clean in every compared run' });
  const locs = ran.map((e) => e.location);
  fields.push(
    new Set(locs).size > 1
      ? {
          field: 'test location',
          state: 'differs',
          detail: locs.join(' → ') + ' (test code changed)',
        }
      : { field: 'test location', state: 'match', detail: locs[0] },
  );
  let label: string;
  if (statuses.size === 1) label = 'consistent';
  else if (fields.some((f) => f.state === 'differs')) label = 'differs, conditions changed';
  else if (fields.some((f) => f.state === 'unknown')) label = 'differs, conditions unknown';
  else label = 'differs, conditions match where known';
  return { label, compared, fields, ran, skipped };
}

// ---------- report ----------

const LABEL_ORDER = [
  'differs, conditions match where known',
  'differs, conditions changed',
  'differs, conditions unknown',
  'consistent',
  'skipped in some or all runs',
  'single run',
];
const md = (s: string): string => redact(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

// ESC built from its code so the source holds no control character (eslint no-control-regex).
const ANSI_COLOUR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

function firstErrorLine(e: Execution): string {
  for (const r of e.test.results) {
    const m = r.errors?.[0]?.message ?? r.error?.message;
    if (m) {
      // Strip ANSI colour codes; keep one line.
      const line =
        m
          .replace(ANSI_COLOUR, '')
          .split('\n')
          .find((l) => l.trim()) ?? '';
      return line.length > 300 ? line.slice(0, 300) + '…' : line;
    }
  }
  return '';
}

function inspectList(e: Execution): string[] {
  const items: string[] = [];
  for (const r of e.test.results) {
    if (r.errorLocation) {
      items.push(
        `attempt ${r.retry}: error at ${r.errorLocation.file.replace(/\\/g, '/')}:${r.errorLocation.line}`,
      );
    }
    for (const a of r.attachments ?? []) {
      if (a.path) items.push(`attempt ${r.retry}: ${a.name} → ${a.path} (local; not opened)`);
    }
  }
  return items;
}

function build(runs: Run[]) {
  const all: Execution[] = [];
  for (const run of runs) {
    const ex = executions(run);
    checkStats(run, ex);
    all.push(...ex);
  }
  const groups = new Map<string, Group>();
  for (const e of all) {
    const g = groups.get(e.key) ?? { key: e.key, display: e.display, execs: [] };
    g.execs.push(e);
    groups.set(e.key, g);
  }
  const results = [...groups.values()].map((g) => ({ g, c: compare(g, runs.length) }));
  const M = all.length;
  const A = all.reduce((n, e) => n + e.test.results.length, 0);
  const S = all.filter((e) => e.test.status === 'skipped').length;
  const eligible = all.filter(
    (e) => e.test.status !== 'skipped' && e.retries !== null && e.retries > 0,
  );
  const F = all.filter((e) => e.test.status === 'flaky').length;
  const K = results.filter((r) => r.c.ran.length >= 2).length;
  const D = results.filter((r) => r.c.label.startsWith('differs')).length;
  const retryLine =
    eligible.length === 0
      ? 'not measurable (no non-skipped execution had retries > 0)'
      : `${F} of ${eligible.length} non-skipped executions with retries > 0`;
  const counts = [
    `runs: ${runs.length}`,
    `identities: ${groups.size} distinct (project + file + title path)`,
    `executions: ${M} (identity × run)`,
    `attempts: ${A} across ${M} executions`,
    `skipped executions: ${S} of ${M}`,
    `retry-flaky executions: ${retryLine}`,
    `compared identities: ${K} (non-skipped in ≥2 runs)`,
    `differing identities: ${D} of ${K}`,
    'stats cross-check: pass (every run matches its native stats)',
  ];
  return { all, groups, results, counts, eligible, F };
}

function render(runs: Run[], b: ReturnType<typeof build>, written: string): string {
  const synthetic = runs.every((r) => r.synthetic);
  const L: string[] = [];
  L.push(`# ${synthetic ? 'SYNTHETIC — not real run history — ' : ''}Flaky triage report`);
  L.push('');
  L.push(
    `- Tool: \`scripts/flaky-triage.ts\`; report schema Playwright ${[...new Set(runs.map((r) => r.report.config.version))].join(', ')}`,
  );
  L.push(`- Written (UTC): ${written}`);
  L.push('- Exit: 0 (findings are informational; no cause is assigned)');
  L.push('');
  L.push('## Inputs');
  L.push('');
  L.push(
    '| # | Path | SHA-256 | Bytes | Report start | Provenance start | Head | Uncommitted tracked | Target env | Target URL | Approval | Scope | Retries | Workers | Synthetic |',
  );
  L.push(
    '| - | ---- | ------- | ----- | ------------ | ---------------- | ---- | ------------------- | ---------- | ---------- | -------- | ----- | ------- | ------- | --------- |',
  );
  for (const r of runs) {
    const c = runConditions(r);
    const f = r.prov.fields;
    const u = (v: string | null | undefined) =>
      v === null || v === undefined || v === '' ? 'unknown' : v;
    L.push(
      `| ${r.index + 1} | ${md(shown(r.path))} | \`${r.sha256.slice(0, 8)}…${r.sha256.slice(-8)}\` | ${r.bytes} | ${md(r.report.stats.startTime)} | ${md(u(f.start_utc))} | ${md(u(f.head))} | ${u(c['uncommitted tracked changes'].value)} | ${md(u(c.target_env.value))} | ${md(u(c.target_url.value))} | ${md(f.approval || 'not recorded')} | ${md(u(c.scope.value))} | ${md(u(c.retries.value))} | ${u(c.workers.value)} | ${r.synthetic ? 'yes' : 'no'} |`,
    );
  }
  const unknownFields = runs.flatMap((r) => {
    if (!r.prov.found)
      return [`${r.label}: no provenance.txt (head, branch, target, approval, git status unknown)`];
    const need = ['start_utc', 'head', 'branch', 'target_env', 'target_url', 'approval'];
    const miss = need.filter((k) => !r.prov.fields[k]);
    if (r.prov.status === null) miss.push('git status');
    return miss.length ? [`${r.label}: unknown ${miss.join(', ')}`] : [];
  });
  L.push('');
  L.push(
    unknownFields.length
      ? `Unknown provenance fields: ${unknownFields.map(md).join('; ')}.`
      : 'Unknown provenance fields: none.',
  );
  L.push('');
  L.push('## Counts');
  L.push('');
  for (const c of b.counts) L.push(`- ${c}`);
  L.push('');
  L.push('## Within-run retry results (path 1)');
  L.push('');
  if (b.eligible.length === 0) {
    L.push(
      '**Not measurable:** no non-skipped execution had retries > 0. This is not "zero flaky tests".',
    );
  } else if (b.F === 0) {
    L.push(`None observed in ${b.eligible.length} eligible executions.`);
  } else {
    L.push('| Run | Identity | Attempts (retry: status, ms) |');
    L.push('| --- | -------- | ---------------------------- |');
    for (const e of b.all.filter((x) => x.test.status === 'flaky')) {
      const att = e.test.results
        .map((r) => `${r.retry}: ${r.status ?? 'unknown'}, ${Math.round(r.duration)}`)
        .join('; ');
      L.push(`| ${md(e.run.label)} | ${md(e.display)} | ${md(att)} |`);
    }
  }
  L.push('');
  L.push('## Across-run results (path 2)');
  L.push('');
  L.push(
    'Native `test.status` per run. "Differs" is not proof of nondeterminism; check the conditions first.',
  );
  for (const label of LABEL_ORDER) {
    const rows = b.results.filter((r) => r.c.label === label);
    if (!rows.length) continue;
    L.push('');
    L.push(`### ${label} (${rows.length})`);
    for (const { g, c } of rows) {
      L.push('');
      L.push(`- ${md(g.display)} — ${c.compared}`);
      L.push(
        `  - native id: ${g.execs.map((e) => `${md(e.run.label)} \`${e.specId}\``).join(', ')}`,
      );
      L.push(
        `  - status: ${g.execs.map((e) => `${md(e.run.label)} **${e.test.status}** (${e.test.results.length} attempt${e.test.results.length === 1 ? '' : 's'})`).join(', ')}`,
      );
      for (const f of c.fields.filter((x) => x.state !== 'match'))
        L.push(`  - ${f.field}: ${f.state} — ${md(f.detail)}`);
      if (label.startsWith('differs')) {
        const errs = [
          ...new Set(c.ran.map((e) => `${e.run.label}: ${firstErrorLine(e) || 'no error text'}`)),
        ];
        for (const er of errs) L.push(`  - error (first line): ${md(er)}`);
        const locs = c.ran.flatMap((e) => inspectList(e).map((x) => `${e.run.label} ${x}`));
        for (const x of locs) L.push(`  - inspect: ${md(x)}`);
        L.push(
          '  - inspect: the provenance `git status` and `git diff --stat` blocks of each run listed above',
        );
      } else if (label === 'consistent' && c.ran.some((e) => e.test.status !== 'expected')) {
        const errLocs = new Set(
          c.ran.map((e) =>
            e.test.results
              .map((r) =>
                r.errorLocation ? `${r.errorLocation.line}:${r.errorLocation.column}` : '',
              )
              .join(','),
          ),
        );
        if (errLocs.size > 1)
          L.push(
            `  - note: error location changed between runs (${md([...errLocs].join(' → '))}); information only`,
          );
      }
    }
  }
  L.push('');
  L.push('## Skips');
  L.push('');
  const skips = b.all.filter((e) => e.test.status === 'skipped');
  if (!skips.length) L.push('None.');
  for (const e of skips) {
    const reason =
      [...e.test.annotations, ...e.test.results.flatMap((r) => r.annotations ?? [])]
        .filter((a) => a.type === 'skip')
        .map((a) => a.description ?? '(no reason given)')[0] ?? '(no skip annotation)';
    L.push(`- ${md(e.run.label)}: ${md(e.display)} — ${md(reason)}`);
  }
  L.push('');
  L.push('## Limits');
  L.push('');
  const lim: string[] = [];
  if (b.eligible.length === 0)
    lim.push('Retries were 0 for every non-skipped execution, so path 1 cannot detect anything.');
  if (unknownFields.length)
    lim.push(
      'Some provenance fields are unknown (listed under Inputs); unknown never counts as a match.',
    );
  const untracked = b.all.filter((e) => codeState(e) === 'untracked').length;
  if (untracked)
    lim.push(
      `${untracked} executions ran from untracked test code; its content per run is unknown.`,
    );
  const scopes = new Set(runs.map((r) => scopeOf(r).value));
  if (scopes.size > 1)
    lim.push(
      'Runs had different scopes (filters); identities not in every run are compared only where present.',
    );
  if (runs.some((r) => r.report.errors.length))
    lim.push('At least one report has top-level errors; see the report itself.');
  lim.push(
    'No cause is assigned. Error text above is the first line only; traces and error-context files are listed, not opened.',
  );
  for (const l of lim) L.push(`- ${l}`);
  L.push('');
  return L.join('\n');
}

function stdoutSummary(runs: Run[], b: ReturnType<typeof build>): string[] {
  const out: string[] = [];
  if (runs.every((r) => r.synthetic)) out.push('flaky-triage: SYNTHETIC — not real run history');
  for (const r of runs) {
    out.push(
      `input ${r.index + 1}: ${shown(r.path)} (${r.label}, head ${r.prov.fields.head ?? 'unknown'}, synthetic ${r.synthetic ? 'yes' : 'no'})`,
    );
  }
  out.push(...b.counts);
  for (const label of LABEL_ORDER) {
    for (const { g, c } of b.results.filter((r) => r.c.label === label)) {
      out.push(
        `label ${label}: ${g.display} (${c.compared}; ${g.execs.map((e) => e.test.status).join(' / ')})`,
      );
    }
  }
  return out;
}

// ---------- output ----------

function utcStamp(d = new Date()): string {
  return d.toISOString().replace(/[-:]|\.\d+/g, '');
}

function writeOutput(outParent: string, runs: Run[], report: string, written: string): string {
  try {
    mkdirSync(outParent, { recursive: true });
  } catch (e) {
    throw new TriageError(
      'output',
      shown(outParent),
      `cannot create the output folder (${(e as NodeJS.ErrnoException).code ?? 'error'})`,
    );
  }
  let name = written;
  for (let n = 2; existsSync(join(outParent, name)); n++) name = `${written}-${n}`;
  const final = join(outParent, name);
  const temp = join(outParent, `.${name}.partial-${process.pid}`);
  try {
    mkdirSync(temp);
    writeFileSync(join(temp, 'flaky-report.md'), report);
    const manifest = runs.map((r) => ({
      path: shown(r.path),
      bytes: r.bytes,
      sha256: r.sha256,
      provenance: r.prov.found ? shown(r.prov.path) : null,
      synthetic: r.synthetic,
    }));
    writeFileSync(join(temp, 'inputs.json'), JSON.stringify(manifest, null, 2) + '\n');
    renameSync(temp, final);
  } catch (e) {
    try {
      rmSync(temp, { recursive: true, force: true });
    } catch {
      // nothing else to clean up
    }
    throw new TriageError(
      'output',
      shown(outParent),
      `cannot write the report (${(e as NodeJS.ErrnoException).code ?? 'error'})`,
    );
  }
  return join(final, 'flaky-report.md');
}

// ---------- main ----------

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const seenPaths = new Map<string, string>();
  for (const i of args.inputs) {
    const key = resolve(i).toLowerCase();
    if (seenPaths.has(key))
      throw new TriageError('duplicate-path', shown(resolve(i)), 'the same path was given twice');
    seenPaths.set(key, i);
  }
  const runs = args.inputs.map(loadInput);
  const bySha = new Map<string, Run>();
  for (const r of runs) {
    const prev = bySha.get(r.sha256);
    if (prev)
      throw new TriageError(
        'duplicate-content',
        shown(r.path),
        `identical content to ${shown(prev.path)} (same SHA-256)`,
      );
    bySha.set(r.sha256, r);
  }
  const syn = runs.filter((r) => r.synthetic);
  if (syn.length && syn.length !== runs.length) {
    throw new TriageError(
      'mixed-synthetic',
      runs
        .filter((r) => !r.synthetic)
        .map((r) => shown(r.path))
        .join(', '),
      'synthetic fixtures and real reports cannot be triaged together',
    );
  }
  const b = build(runs);
  const written = utcStamp();
  const reportPath = writeOutput(args.out, runs, render(runs, b, written), written);
  for (const line of stdoutSummary(runs, b)) console.log(redact(line));
  console.log(`flaky-triage: exit 0 report: ${shown(reportPath)}`);
  return 0;
}

let code: number;
try {
  code = main();
} catch (e) {
  const err =
    e instanceof TriageError
      ? e
      : new TriageError('internal', '(script)', (e as Error)?.stack?.split('\n')[0] ?? String(e));
  console.error(redact(`flaky-triage: ERROR ${err.kind}: ${err.where}: ${err.message}`));
  code = EXIT[err.kind];
  console.log(`flaky-triage: exit ${code} error: ${err.kind}`);
}
process.exitCode = code;
