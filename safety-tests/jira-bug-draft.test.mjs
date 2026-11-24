// Isolated checks for scripts/jira/report-bug.mjs (Week 5 Task 04, rule 55). node:test, no browser,
// no network, no .env, no Jira. The reports are the tracked sanitized Week 4 reports (real run
// evidence); the provenance files and the duplicate-search results are SIMULATED (synthetic).
// Nothing is ever created in Jira by this script.
//
//   node --test safety-tests/jira-bug-draft.test.mjs        (from the repository root)

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { catalogRelated, errorKind, run } from '../scripts/jira/report-bug.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
process.chdir(ROOT);
const tmp = mkdtempSync(join(tmpdir(), 'jira-bug-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

const R1 = {
  path: 'evidence/week4-store-ui-20261108T194122Z.sanitized.json',
  utc: '20261108T194122Z',
};
const R2 = {
  path: 'evidence/week4-store-ui-20261108T202049Z.sanitized.json',
  utc: '20261108T202049Z',
};
const R3 = {
  path: 'evidence/week4-store-ui-20261112T204457Z.sanitized.json',
  utc: '20261112T204457Z',
};
const API = {
  path: 'evidence/week4-store-api-20261112T204343Z.sanitized.json',
  utc: '20261112T204343Z',
};
const API_OLD = {
  path: 'evidence/week4-store-api-20261107T191145Z.sanitized.json',
  utc: '20261107T191145Z',
};

function prov(r) {
  const p = join(tmp, `${r.utc}.txt`);
  writeFileSync(
    p,
    `utc_start: ${r.utc}\ntarget: dev (simulated provenance)\nhead: b7d87d866f83d816bb7a27f244587864597a95ee\ngit_status:\ngit_diff_stat:\n`,
  );
  return p;
}
function emptyRoot() {
  const root = join(tmp, `root${Math.random().toString(16).slice(2)}`);
  mkdirSync(join(root, 'vault', 'sources', 'test-catalog'), { recursive: true });
  writeFileSync(
    join(root, 'vault', 'sources', 'test-catalog', 'c.md'),
    '| ID | Case | Expected |\n| --- | --- | --- |\n| **TC-SUI-020** | cart line | the line shows an image |\n',
  );
  return root;
}
const dupesFile = (queries) => {
  const p = join(tmp, `d${Math.random().toString(16).slice(2)}.json`);
  writeFileSync(p, JSON.stringify({ queries }));
  return p;
};
function go(tc, runs, { dupes, root, mapping } = {}) {
  const lines = [];
  const args = [
    '--tc',
    tc,
    '--reports',
    runs.map((r) => r.path).join(','),
    '--provenance',
    runs.map(prov).join(','),
  ];
  if (dupes) args.push('--dupes', dupes);
  if (mapping) args.push('--mapping', mapping);
  const code = run(args, { root: root ?? ROOT, out: (l) => lines.push(l) });
  return { code, text: lines.join('\n') };
}
const CLEAN = [
  {
    jql: 'project = SCRUM AND text ~ "cart"',
    complete: true,
    issues: [
      { key: 'SCRUM-999', summary: 'Unrelated reporting widget colour', status: { name: 'To Do' } },
    ],
  },
];

describe('classification keeps real outcomes', () => {
  test('a skipped test is never a defect', () => {
    const r = go('TC-SAPI-052', [API]);
    assert.equal(r.code, 0);
    assert.match(r.text, /TC-SAPI-052: not-a-defect/);
    assert.match(r.text, /skipped/);
    assert.match(r.text, /no draft/);
  });
  test('a passed test is not reported', () => {
    assert.match(go('TC-SUI-031', [R3]).text, /TC-SUI-031: no-failure/);
  });
  test('a single failing run is a signal, not a supported defect', () => {
    const r = go('TC-SUI-020', [R3]);
    assert.match(r.text, /insufficient/);
    assert.match(r.text, /one failing run is a signal/);
  });
  test('error kinds: network and timeout are environment, locators are test, assertions need a judgement', () => {
    assert.equal(errorKind('Error: connect ECONNREFUSED 127.0.0.1').kind, 'environment');
    assert.equal(errorKind('Test timeout of 30000ms exceeded.').kind, 'environment-or-test');
    assert.equal(
      errorKind('Error: strict mode violation: locator resolved to 2 elements').kind,
      'test',
    );
    assert.equal(errorKind('Error: expect(locator).toBeVisible() failed').kind, 'assertion');
    assert.equal(errorKind('stock allocation missing').kind, 'data');
    assert.equal(errorKind(null).kind, 'undetermined');
  });
});

describe('the real TC-SUI-020 evidence', () => {
  test('three failing runs and a catalog-recorded bug give "possible duplicate" and no draft', () => {
    const d = dupesFile(CLEAN);
    const r = go('TC-SUI-020', [R1, R2, R3], { dupes: d });
    assert.equal(r.code, 0);
    assert.match(r.text, /TC-SUI-020: possible-duplicate/);
    assert.match(r.text, /duplicate candidate SCRUM-166/);
    assert.match(r.text, /classification: assertion/);
    assert.match(r.text, /no draft/);
    assert.doesNotMatch(r.text, /DRAFT \(for the owner/);
  });
  test('the catalog ties SCRUM-166 to TC-SUI-020 as a bug', () => {
    assert.ok(catalogRelated(ROOT, 'TC-SUI-020').includes('SCRUM-166'));
  });
  test('without the duplicate search there is no draft either', () => {
    const r = go('TC-SUI-020', [R1, R2, R3], { root: emptyRoot() });
    assert.match(r.text, /duplicate-check-missing/);
    assert.match(r.text, /no draft/);
  });
  test('an incomplete duplicate search is the same as none', () => {
    const d = dupesFile([{ ...CLEAN[0], complete: false }]);
    assert.match(
      go('TC-SUI-020', [R1, R2, R3], { dupes: d, root: emptyRoot() }).text,
      /duplicate-check-missing/,
    );
  });
});

describe('a draft only for a supported, undisputed defect (SIMULATED clean catalog and search)', () => {
  test('three identical assertion failures, a complete search and no candidate print a preview draft, filing nothing', () => {
    const d = dupesFile(CLEAN);
    const mapping = join(tmp, 'mapping.json');
    writeFileSync(mapping, JSON.stringify({ projectKey: 'SCRUM', mappings: [] }));
    const r = go('TC-SUI-020', [R1, R2, R3], { dupes: d, root: emptyRoot(), mapping });
    assert.match(r.text, /TC-SUI-020: draft/);
    assert.match(r.text, /DRAFT \(for the owner; filing is not enabled\)/);
    assert.match(r.text, /project SCRUM; type Task/);
    assert.match(r.text, /Bug type was not verified/);
    assert.match(r.text, /Expected \(test catalog, verbatim\): the line shows an image/);
    assert.match(r.text, /PREVIEW ONLY — nothing is created or sent/);
  });
  test('the script has no network or write path at all', () => {
    const src = readFileSync('scripts/jira/report-bug.mjs', 'utf8');
    assert.doesNotMatch(src, /\bfetch\(|node:http|node:https|process\.env|createJiraIssue/);
  });
  test('runs of one test that passed once and were skipped once keep both outcomes and report no failure', () => {
    const r = go('TC-SAPI-050', [API_OLD, API]);
    assert.match(r.text, /TC-SAPI-050: no-failure/);
    assert.match(r.text, /passed/);
    assert.match(r.text, /skipped/);
  });
  test('missing arguments and unequal report/provenance lists are refused', () => {
    assert.equal(run([], { out: () => {} }), 1);
    assert.equal(
      run(['--tc', 'TC-X-1', '--reports', 'a,b', '--provenance', 'a'], { out: () => {} }),
      1,
    );
  });
});
