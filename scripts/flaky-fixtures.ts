#!/usr/bin/env node
// Generator for the SYNTHETIC flaky-triage fixtures (Week 4 Task 04). Node built-ins only; runs on
// Node's own type stripping.
//
//   node scripts/flaky-fixtures.ts            write every case (refuses if a case folder exists)
//   node scripts/flaky-fixtures.ts --force    replace the generated case folders (never source/)
//
// It runs the synthetic suite in evidence/fixtures/flaky/source/ with the installed Playwright and
// its native JSON reporter (local only: no browser use, no network, no app, no env/target.ts), then
// replaces the repository path with <repo> and the home folder with <home>, and fails if the user
// name is still present. Sidecar provenance.txt files carry `synthetic: true` and synthetic heads.
// The malformed, empty, missing and unsupported cases are written by this script too, so no
// fixture is edited by hand. Fixtures stay out of evidence/raw/ (real run history).
//
// Exit: 0 all cases written and checked; 1 refused or a check failed.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');
const FIX = join(ROOT, 'evidence', 'fixtures', 'flaky');
const CONFIG = 'evidence/fixtures/flaky/source/playwright.config.ts';
const CLI = join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
const PW_VERSION: string = JSON.parse(
  readFileSync(join(ROOT, 'node_modules', '@playwright', 'test', 'package.json'), 'utf8'),
).version;

const CASE_DIRS = [
  'retry-flaky',
  'cross-run-same',
  'cross-run-changed',
  'cross-run-untracked',
  'cross-run-noprov',
  'skip-partial',
  'same-title',
  'stable',
  'malformed',
  'empty',
  'missing',
  'unsupported',
];

type Stats = { expected: number; unexpected: number; flaky: number; skipped: number };

const fail = (msg: string): never => {
  console.error(`flaky-fixtures: ERROR ${msg}`);
  process.exit(1);
};

// ---------- redaction ----------

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const variants = (p: string) => [...new Set([p.replace(/\//g, '\\'), p.replace(/\\/g, '/')])];
const RULES: [RegExp, string][] = [
  ...variants(ROOT).map((v): [RegExp, string] => [new RegExp(esc(v), 'gi'), '<repo>']),
  ...variants(homedir()).map((v): [RegExp, string] => [new RegExp(esc(v), 'gi'), '<home>']),
];
const USER = userInfo().username;
const USER_RE = new RegExp(`[\\\\/]${esc(USER)}([\\\\/]|$)`, 'i');

function redactDeep(v: unknown): unknown {
  if (typeof v === 'string') return RULES.reduce((s, [re, to]) => s.replace(re, to), v);
  if (Array.isArray(v)) return v.map(redactDeep);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, redactDeep(x)]),
    );
  }
  return v;
}
function assertNoUserPath(v: unknown, where: string): void {
  if (typeof v === 'string') {
    if (USER_RE.test(v)) fail(`${where}: a local user path is still present after redaction`);
  } else if (Array.isArray(v)) v.forEach((x) => assertNoUserPath(x, where));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => assertNoUserPath(x, where));
}

// ---------- running the synthetic suite ----------

const TMP = mkdtempSync(join(tmpdir(), 'flaky-fixtures-'));

function runSuite(
  caseName: string,
  variant: string,
  extra: string[],
  want: Stats,
): Record<string, unknown> {
  const out = join(TMP, `${caseName}-${variant || 'x'}-${extra.length}.json`);
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.APP_ENV;
  delete env.BASE_URL;
  env.FLAKY_FIXTURE_CASE = caseName;
  env.FLAKY_FIXTURE_VARIANT = variant;
  env.PLAYWRIGHT_JSON_OUTPUT_FILE = out;
  const r = spawnSync(
    process.execPath,
    [CLI, 'test', '--config', CONFIG, '--reporter=json', ...extra],
    {
      cwd: ROOT,
      env,
      encoding: 'utf8',
    },
  );
  if (r.status !== 0 && r.status !== 1)
    fail(`${caseName}/${variant}: Playwright exited ${r.status}`);
  if (!existsSync(out)) fail(`${caseName}/${variant}: no JSON report was written`);
  const report = redactDeep(JSON.parse(readFileSync(out, 'utf8'))) as Record<string, unknown>;
  assertNoUserPath(report, `${caseName}/${variant}`);
  const config = report.config as { version?: string };
  if (config?.version !== PW_VERSION)
    fail(`${caseName}/${variant}: config.version ${config?.version} ≠ installed ${PW_VERSION}`);
  for (const k of ['config', 'suites', 'errors', 'stats'])
    if (!(k in report)) fail(`${caseName}/${variant}: no ${k}`);
  const s = report.stats as Stats;
  for (const k of Object.keys(want) as (keyof Stats)[]) {
    if (s[k] !== want[k]) fail(`${caseName}/${variant}: stats.${k} ${s[k]}, expected ${want[k]}`);
  }
  return report;
}

// ---------- writing ----------

const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

function writeFile(rel: string, content: string | Buffer): void {
  const p = join(FIX, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, content);
}

function provenance(
  report: Record<string, unknown>,
  opts: { head: string; status: string[]; command: string },
): string {
  const start = (report.stats as { startTime: string }).startTime;
  return [
    `run_id: synthetic-${start.replace(/[-:]|\.\d+/g, '')}`,
    'synthetic: true',
    `start_utc: ${start}`,
    `command: ${opts.command}`,
    'target_env: none (synthetic; no app, no network)',
    'target_url: none',
    `head: ${opts.head}`,
    'branch: synthetic',
    `node: ${process.version}`,
    `playwright: Version ${PW_VERSION}`,
    '--- git status --short',
    ...opts.status,
    '--- git diff --stat',
    'exit_code: synthetic',
    '',
  ].join('\n');
}

function fixtureNote(caseName: string, what: string, expected: string): string {
  return [
    `SYNTHETIC — practice fixture for scripts/flaky-triage.ts (Week 4 Task 04). Not real run history.`,
    '',
    `Case: ${caseName}`,
    `Generated by: node scripts/flaky-fixtures.ts (never edited by hand)`,
    `What: ${what}`,
    `Expected: ${expected}`,
    '',
  ].join('\n');
}

// ---------- main ----------

const force = process.argv.includes('--force');
const unknownArgs = process.argv.slice(2).filter((a) => a !== '--force');
if (unknownArgs.length) fail(`unknown argument(s): ${unknownArgs.join(' ')}`);
const present = CASE_DIRS.filter((d) => existsSync(join(FIX, d)));
if (present.length && !force)
  fail(`case folders already exist (${present.join(', ')}); pass --force to replace them`);
for (const d of present) rmSync(join(FIX, d), { recursive: true, force: true });

const cmd = (c: string, v: string, extra = '') =>
  `node scripts/flaky-fixtures.ts (FLAKY_FIXTURE_CASE=${c}${v ? ` FLAKY_FIXTURE_VARIANT=${v}` : ''}${extra ? ` ${extra}` : ''})`;
const CLEAN: string[] = [];
const UNTRACKED = ['?? evidence/fixtures/flaky/source/'];

try {
  // retry-flaky
  const retry = runSuite('retry-flaky', '', [], {
    expected: 1,
    unexpected: 0,
    flaky: 1,
    skipped: 0,
  });
  writeFile('retry-flaky/report.json', json(retry));
  writeFile(
    'retry-flaky/provenance.txt',
    provenance(retry, { head: 'synthetic-head-1', status: CLEAN, command: cmd('retry-flaky', '') }),
  );
  writeFile(
    'retry-flaky/FIXTURE.md',
    fixtureNote(
      'retry-flaky',
      'retries 1; one test fails on attempt 0 and passes on attempt 1; one passes outright',
      'exit 0; retry-flaky 1 of 2 eligible executions; 3 attempts across 2 executions',
    ),
  );

  // cross-run pair, reused with four different sidecar setups
  const crossA = runSuite('cross-run', 'a', [], {
    expected: 2,
    unexpected: 0,
    flaky: 0,
    skipped: 0,
  });
  const crossB = runSuite('cross-run', 'b', [], {
    expected: 1,
    unexpected: 1,
    flaky: 0,
    skipped: 0,
  });
  const pairs: [string, string, string, string[] | null, string, string][] = [
    [
      'cross-run-same',
      'synthetic-head-1',
      'synthetic-head-1',
      CLEAN,
      'same synthetic head, clean tree, same line',
      'exit 0; "differs, conditions match where known" (candidate only)',
    ],
    [
      'cross-run-changed',
      'synthetic-head-1',
      'synthetic-head-2',
      CLEAN,
      'different synthetic heads',
      'exit 0; "differs, conditions changed" (head)',
    ],
    [
      'cross-run-untracked',
      'synthetic-head-1',
      'synthetic-head-1',
      UNTRACKED,
      'git status lists the fixture source folder as untracked',
      'exit 0; test code unknown, so "differs, conditions unknown"',
    ],
    [
      'cross-run-noprov',
      '',
      '',
      null,
      'no provenance.txt, so treated as a real (unmarked) input',
      'exit 0 when run on its own; every provenance field unknown; "differs, conditions unknown"; mixed with a synthetic input: exit 1',
    ],
  ];
  for (const [dir, headA, headB, status, what, expected] of pairs) {
    writeFile(`${dir}/run-a/report.json`, json(crossA));
    writeFile(`${dir}/run-b/report.json`, json(crossB));
    if (status) {
      writeFile(
        `${dir}/run-a/provenance.txt`,
        provenance(crossA, { head: headA, status, command: cmd('cross-run', 'a') }),
      );
      writeFile(
        `${dir}/run-b/provenance.txt`,
        provenance(crossB, { head: headB, status, command: cmd('cross-run', 'b') }),
      );
    }
    writeFile(
      `${dir}/FIXTURE.md`,
      fixtureNote(
        dir,
        `variant a passes, variant b fails one test (deliberate switch); ${what}`,
        expected,
      ),
    );
  }

  // skip-partial
  const skipA = runSuite('skip-partial', 'a', [], {
    expected: 1,
    unexpected: 0,
    flaky: 0,
    skipped: 1,
  });
  const skipB = runSuite('skip-partial', 'b', [], {
    expected: 2,
    unexpected: 0,
    flaky: 0,
    skipped: 0,
  });
  writeFile('skip-partial/run-a/report.json', json(skipA));
  writeFile('skip-partial/run-b/report.json', json(skipB));
  writeFile(
    'skip-partial/run-a/provenance.txt',
    provenance(skipA, {
      head: 'synthetic-head-1',
      status: CLEAN,
      command: cmd('skip-partial', 'a'),
    }),
  );
  writeFile(
    'skip-partial/run-b/provenance.txt',
    provenance(skipB, {
      head: 'synthetic-head-1',
      status: CLEAN,
      command: cmd('skip-partial', 'b'),
    }),
  );
  writeFile(
    'skip-partial/FIXTURE.md',
    fixtureNote(
      'skip-partial',
      'one test skipped in run-a only',
      'exit 0; that test listed under skips and not counted as differing; differing 0',
    ),
  );

  // same-title
  const same = runSuite('same-title', '', [], { expected: 3, unexpected: 1, flaky: 0, skipped: 0 });
  writeFile('same-title/report.json', json(same));
  writeFile(
    'same-title/provenance.txt',
    provenance(same, { head: 'synthetic-head-1', status: CLEAN, command: cmd('same-title', '') }),
  );
  writeFile(
    'same-title/FIXTURE.md',
    fixtureNote(
      'same-title',
      'two files × two projects, every test titled "same title"; fails only in same-b under project beta',
      'exit 0; 4 distinct identities, not merged; the failure tied to exactly one',
    ),
  );

  // stable
  const stableA = runSuite('stable', 'a', [], { expected: 1, unexpected: 1, flaky: 0, skipped: 1 });
  const stableB = runSuite('stable', 'b', [], { expected: 1, unexpected: 1, flaky: 0, skipped: 1 });
  const stableAText = json(stableA);
  writeFile('stable/run-a/report.json', stableAText);
  writeFile('stable/run-b/report.json', json(stableB));
  writeFile(
    'stable/run-a/provenance.txt',
    provenance(stableA, { head: 'synthetic-head-1', status: CLEAN, command: cmd('stable', 'a') }),
  );
  writeFile(
    'stable/run-b/provenance.txt',
    provenance(stableB, { head: 'synthetic-head-1', status: CLEAN, command: cmd('stable', 'b') }),
  );
  writeFile(
    'stable/FIXTURE.md',
    fixtureNote(
      'stable',
      'pass, fail and skip, the same in both runs',
      'exit 0; differing 0 of 2; skips counted separately',
    ),
  );

  // malformed
  writeFile('malformed/truncated.json', stableAText.slice(0, Math.floor(stableAText.length / 2)));
  writeFile(
    'malformed/array-root.json',
    json([{ synthetic: true, note: 'top level is an array, not a report object' }]),
  );
  writeFile(
    'malformed/FIXTURE.md',
    fixtureNote(
      'malformed',
      'truncated.json is the first half of stable/run-a; array-root.json has an array at the top level',
      'exit 2 for each; no report written',
    ),
  );

  // empty
  writeFile('empty/report.json', '');
  writeFile(
    'empty/FIXTURE.md',
    fixtureNote('empty', 'report.json is 0 bytes', 'exit 1 (empty); no report written'),
  );

  // missing
  writeFile(
    'missing/FIXTURE.md',
    fixtureNote(
      'missing',
      'this folder has no report.json on purpose',
      'passing missing/report.json gives exit 1 (missing); no report written',
    ),
  );

  // unsupported
  writeFile(
    'unsupported/not-playwright.json',
    json({ synthetic: true, note: 'valid JSON but not a Playwright JSON report', results: [] }),
  );
  const repeat = runSuite('repeat-each', '', [], {
    expected: 2,
    unexpected: 2,
    flaky: 0,
    skipped: 2,
  });
  writeFile('unsupported/repeat-each.json', json(repeat));
  const sharded = runSuite('stable', 'a', ['--shard=1/1'], {
    expected: 1,
    unexpected: 1,
    flaky: 0,
    skipped: 1,
  });
  writeFile('unsupported/sharded.json', json(sharded));
  writeFile(
    'unsupported/FIXTURE.md',
    fixtureNote(
      'unsupported',
      'not-playwright.json lacks config.version, suites and stats; repeat-each.json is a native --repeat-each 2 run; sharded.json is a native --shard=1/1 run',
      'exit 3 for each; no report written',
    ),
  );
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(
  `flaky-fixtures: wrote ${CASE_DIRS.length} case folders under evidence/fixtures/flaky/ (Playwright ${PW_VERSION})`,
);
