// Isolated checks for scripts/jira/traceability.mjs (Week 5 Task 04, rule 55). node:test, no browser,
// no network, no .env, no Jira. SIMULATED: the Jira snapshot, the test list and the catalog below are
// synthetic, written to a temp folder. The one real input is the repository's own spec file, read as
// syntax, to show the declaration parser on actual code.
//
//   node --test safety-tests/jira-traceability.test.mjs        (from the repository root)

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  analyse,
  declarations,
  deferredIds,
  readCatalog,
  readList,
  run,
  stripNpmBanner,
} from '../scripts/jira/traceability.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
process.chdir(ROOT);
const tmp = mkdtempSync(join(tmpdir(), 'jira-trace-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

const SPEC = `
import { test } from '@playwright/test';
import { runIfEnv } from '../env/runIfEnv';
test.describe('dev block', () => {
  runIfEnv(test, ['dev']);
  test('TC-A-001 one', async () => {});
  test('TC-A-002 two', async () => {});
});
test.describe('both block', () => {
  runIfEnv(test, ['prod', 'dev']);
  test('TC-A-003 three', async () => {});
  test.describe('nested', () => {
    runIfEnv(test, ['dev']);
    test('TC-A-004 four', async () => {});
  });
});
test.describe('computed block', () => {
  runIfEnv(test, ENVS);
  test('TC-A-005 five', async () => {});
});
test.describe('no declaration', () => {
  test('TC-A-006 six', async () => {});
});
`;

describe('declarations (syntax only)', () => {
  const d = declarations(SPEC);
  test('literal lists are read, sorted, and nested blocks use their own list', () => {
    assert.equal(d.get('TC-A-001 one'), 'dev');
    assert.equal(d.get('TC-A-003 three'), 'dev,prod');
    assert.equal(d.get('TC-A-004 four'), 'dev');
  });
  test('a non-literal list is unknown, a missing declaration is undeclared', () => {
    assert.equal(d.get('TC-A-005 five'), 'unknown');
    assert.equal(d.get('TC-A-006 six'), 'undeclared');
  });
  test('the real cart spec declares dev only for TC-SUI-020', () => {
    const text = readFileSync('tests/store/ui/cart.spec.ts', 'utf8');
    const real = declarations(text, 'tests/store/ui/cart.spec.ts');
    const title = [...real.keys()].find((t) => t.startsWith('TC-SUI-020'));
    assert.equal(real.get(title), 'dev');
  });
});

const T = (n, file = 'a.spec.ts') => ({
  file,
  title: `TC-A-00${n} t`,
  tcId: `TC-A-00${n}`,
  identity: `${file} > TC-A-00${n} t [chromium]`,
});
const J = (key, n, labels) => ({
  key,
  summary: `TC-A-00${n} — case`,
  issuetype: 'Subtask',
  status: 'To Do',
  labels,
});
const envOf = (t) =>
  ({
    'TC-A-001': 'dev',
    'TC-A-002': 'dev',
    'TC-A-003': 'dev',
    'TC-A-004': 'dev',
    'TC-A-005': 'unknown',
    'TC-A-006': 'dev,prod',
  })[t.tcId] ?? 'dev';

describe('analyse (SIMULATED snapshot)', () => {
  const catalog = new Map([
    ['TC-A-001', { file: 'c.md' }],
    ['TC-A-002', { file: 'c.md' }],
    ['TC-A-003', { file: 'c.md' }],
    ['TC-A-004', { file: 'c.md' }],
    ['TC-A-006', { file: 'c.md' }],
    ['TC-A-007', { file: 'c.md' }],
    ['TC-A-008', { file: 'c.md', manual: true }],
    ['TC-A-010', { file: 'c.md' }],
  ]);
  const snapshot = {
    issues: [
      J('S-1', 1, ['automated', 'env-dev']),
      J('S-2', 2, ['automated']), // missing
      J('S-3', 3, ['env-dev', 'env-prod']), // multiple (and the code says dev,prod)
      J('S-4', 4, ['env-prod']), // mismatch with dev
      J('S-5', 5, ['env-dev']), // unknown declaration
      J('S-6', 6, []), // empty labels, code says dev,prod
      J('S-7', 7, ['env-dev']), // case without a test
      J('S-8', 8, ['env-dev']), // manual
      J('S-9', 1, ['env-dev']), // duplicate of TC-A-001
      { key: 'S-0', summary: 'Subtask 2.1', issuetype: 'Subtask', labels: [] }, // outside the suite
    ],
  };
  const tests = [
    T(1),
    T(2),
    T(3),
    T(4),
    T(5),
    T(6),
    { file: 'a.spec.ts', title: 'no id', tcId: null, identity: 'a.spec.ts > no id [chromium]' },
    T(9),
  ];
  const r = analyse({
    snapshot,
    tests,
    catalog,
    envOf: (t) => ({ ...{ 'TC-A-003': 'dev,prod' }, ...{} })[t.tcId] ?? envOf(t),
  });
  const finding = (k) => r.audit.filter((a) => a.key === k).map((a) => a.finding);

  test('each env-label finding is reported separately, including empty labels', () => {
    assert.deepEqual(finding('S-1'), ['ok']);
    assert.deepEqual(finding('S-2'), ['missing label']);
    assert.deepEqual(finding('S-3'), ['multiple labels']);
    assert.deepEqual(finding('S-4'), ['code/label mismatch']);
    assert.deepEqual(finding('S-5'), ['unknown declaration']);
    assert.deepEqual(finding('S-6'), ['missing label']);
    assert.deepEqual(finding('S-9'), ['ok']);
  });
  test('issues outside the audited suite are reported apart, not dropped', () => {
    assert.deepEqual(
      r.outsideScope.map((x) => x.key),
      ['S-0'],
    );
  });
  test('tests without a case, cases without a test, manual, duplicates and unknown stay separate', () => {
    assert.deepEqual(r.testsWithoutCase.map((x) => x.tcId ?? 'none').sort(), ['TC-A-009', 'none']);
    assert.deepEqual(
      r.casesWithoutTest.map((x) => x.key),
      ['S-7'],
    );
    assert.deepEqual(
      r.manual.map((x) => x.key),
      ['S-8'],
    );
    assert.ok(r.duplicates.some((d) => d.tcId === 'TC-A-001' && d.keys.length === 2));
    assert.ok(r.unknown.some((u) => u.tcId === 'TC-A-005' && /not in the catalog/.test(u.what)));
    assert.ok(
      r.unknown.some((u) => u.tcId === 'TC-A-010' && /neither a test nor a Jira case/.test(u.what)),
    );
    assert.ok(r.unknown.some((u) => u.tcId === 'TC-A-009'));
  });
  test('label corrections are proposals only, and an unknown declaration gets none', () => {
    const keys = r.proposals.map((p) => p.key).sort();
    assert.deepEqual(keys, ['S-2', 'S-3', 'S-4', 'S-6']);
    assert.deepEqual(r.proposals.find((p) => p.key === 'S-4').proposed, ['env-dev']);
    assert.equal(
      r.proposals.some((p) => p.key === 'S-5'),
      false,
    );
  });
  test('a prod-allowlisted TC with a dev-only declaration is flagged', () => {
    const x = analyse({
      snapshot: { issues: [J('S-1', 1, ['env-dev'])] },
      tests: [T(1)],
      catalog,
      envOf: () => 'dev',
      allowlist: [{ tc: 'TC-A-001' }],
    });
    assert.equal(x.audit[0].finding, 'prod-allowlisted but declared dev only');
  });
});

describe('run (SIMULATED files)', () => {
  function layout(complete) {
    const root = join(tmp, `r${Math.random().toString(16).slice(2)}`);
    mkdirSync(join(root, 'tests'), { recursive: true });
    mkdirSync(join(root, 'vault', 'sources', 'test-catalog'), { recursive: true });
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'tests', 'a.spec.ts'), SPEC);
    writeFileSync(join(root, 'scripts', 'prod-smoke-allowlist.json'), '{"approved":[]}');
    writeFileSync(
      join(root, 'vault', 'sources', 'test-catalog', 'c.md'),
      '| ID | Case |\n| --- | --- |\n| **TC-A-001** | one |\n| **TC-A-008** | intentionally manual case |\n',
    );
    const snap = join(root, 'snap.json');
    writeFileSync(
      snap,
      JSON.stringify({
        site: 'https://fake.atlassian.net',
        projectKey: 'S',
        readAt: 'simulated',
        route: 'simulated read-only reads',
        queries: [{ jql: 'project = S AND issuetype = Subtask', pages: 2, complete }],
        issues: [J('S-1', 1, ['env-dev'])],
      }),
    );
    const list = join(root, 'list.json');
    writeFileSync(
      list,
      JSON.stringify({
        suites: [
          {
            title: 'a.spec.ts',
            file: 'a.spec.ts',
            specs: [],
            suites: [
              {
                title: 'dev block',
                file: 'a.spec.ts',
                specs: [
                  {
                    title: 'TC-A-001 one',
                    file: 'a.spec.ts',
                    tests: [{ projectName: 'chromium' }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    return { root, snap, list };
  }
  test('a complete read produces the report, shows the queries and filter, and exits 0', () => {
    const f = layout(true);
    const lines = [];
    const code = run(['--snapshot', f.snap, '--list', f.list], {
      root: f.root,
      out: (l) => lines.push(l),
    });
    const text = lines.join('\n');
    assert.equal(code, 0);
    assert.match(text, /query `project = S AND issuetype = Subtask` — 2 page\(s\), complete/);
    assert.match(text, /client filter/);
    assert.match(text, /Environment labels \(1 mapped cases\)/);
    assert.match(text, /traceability: exit 0 report/);
  });
  test('incomplete paging is a failure, not a partial report', () => {
    const f = layout(false);
    const lines = [];
    const code = run(['--snapshot', f.snap, '--list', f.list], {
      root: f.root,
      out: (l) => lines.push(l),
    });
    assert.equal(code, 2);
    assert.match(lines.join('\n'), /INCOMPLETE ACCESS/);
    assert.doesNotMatch(lines.join('\n'), /Environment labels/);
  });
  test('the catalog reader sees TC rows and the manual marker', () => {
    const f = layout(true);
    const c = readCatalog(f.root);
    assert.equal(c.get('TC-A-008').manual, true);
    assert.equal(c.get('TC-A-001').manual, false);
  });
  test('the script has no network, no .env and no Jira write path', () => {
    const src = readFileSync('scripts/jira/traceability.mjs', 'utf8');
    assert.doesNotMatch(src, /\bfetch\(|node:http|node:https|process\.env|\.env['"`]/);
    assert.doesNotMatch(src, /method: '(POST|PUT|DELETE|PATCH)'/);
  });
  test('a case whose catalog row lives outside the scoped files is found through the full catalog, not called unknown', () => {
    const scoped = new Map([['TC-A-001', { file: 'ui.md' }]]);
    const full = new Map([
      ['TC-A-001', { file: 'ui.md' }],
      ['TC-B-001', { file: 'api.md' }],
    ]);
    const snapshot = {
      issues: [{ key: 'S-1', summary: 'TC-B-001 — x', issuetype: 'Subtask', labels: ['env-dev'] }],
    };
    const tests = [
      {
        file: 'a.spec.ts',
        title: 'TC-B-001 t',
        tcId: 'TC-B-001',
        identity: 'a.spec.ts > TC-B-001 t [chromium]',
      },
    ];
    const r = analyse({ snapshot, tests, catalog: scoped, fullCatalog: full, envOf: () => 'dev' });
    assert.equal(
      r.unknown.some((u) => u.tcId === 'TC-B-001'),
      false,
    );
    assert.equal(
      analyse({ snapshot, tests, catalog: scoped, envOf: () => 'dev' }).unknown.some(
        (u) => u.tcId === 'TC-B-001',
      ),
      true,
    );
  });
});

describe('fixes after the first live run (SIMULATED inputs; the catalog text is real)', () => {
  test('the npm banner before the JSON is dropped, any other text before it is not', () => {
    assert.equal(
      stripNpmBanner('\n> qa-framework@0.1.0 test:list\n> cross-env x\n\n{"a":1}').trim(),
      '{"a":1}',
    );
    const dir = mkdtempSync(join(tmpdir(), 'jira-list-'));
    const ok = join(dir, 'ok.json');
    writeFileSync(ok, '> banner\n\n' + JSON.stringify({ suites: [] }));
    assert.deepEqual(readList(ok), []);
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, 'warning: something\n' + JSON.stringify({ suites: [] }));
    assert.throws(() => readList(bad), /not valid JSON/);
    rmSync(dir, { recursive: true, force: true });
  });

  test('a suite titled with the spec file path (either slash) is not repeated in the test identity', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jira-list-'));
    const p = join(dir, 'l.json');
    const file = 'store/ui/cart.spec.ts';
    const spec = { title: 'TC-SUI-020 x', file, tests: [{ projectName: 'chromium' }] };
    const inner = { title: 'store UI cart (dev only)', specs: [spec] };
    const windowsTitle = ['store', 'ui', 'cart.spec.ts'].join(String.fromCharCode(92));
    const backslash = { title: windowsTitle, file, suites: [inner] };
    writeFileSync(p, JSON.stringify({ suites: [{ title: file, file, suites: [backslash] }] }));
    const [t] = readList(p);
    assert.equal(
      t.identity,
      'store/ui/cart.spec.ts > store UI cart (dev only) > TC-SUI-020 x [chromium]',
    );
    rmSync(dir, { recursive: true, force: true });
  });

  test('the deferred list is read from catalog text, ranges included, and a removal is honoured', () => {
    const ids = deferredIds(
      '- Deferred after 2026-11-08 (not in the baseline): TC-SUI-010, 014, 015, 001 to 003,\n  040 and 051.\n- Added: TC-SUI-014 was taken out of the deferred list by the owner.',
    );
    assert.deepEqual([...ids].sort(), [
      'TC-SUI-001',
      'TC-SUI-002',
      'TC-SUI-003',
      'TC-SUI-010',
      'TC-SUI-015',
      'TC-SUI-040',
      'TC-SUI-051',
    ]);
  });

  test('the real store UI catalog: deferred rows and rowless deferred ids, 014 not deferred, scope kept', () => {
    const c = readCatalog(ROOT, ['store-ui.md']);
    assert.equal(c.get('TC-SUI-010').deferred, true);
    assert.equal(c.get('TC-SUI-040').rowless, true);
    assert.equal(c.get('TC-SUI-050').deferred, true);
    assert.equal(c.get('TC-SUI-014').deferred ?? false, false);
    assert.equal(c.has('TC-API-010'), false, 'the catalog is limited to the named file');
    assert.deepEqual(c.scope, ['store-ui.md']);
  });

  test('a deferred case without a test is its own finding: not missing coverage, not manual, not unknown', () => {
    const catalog = new Map([
      ['TC-A-001', { file: 'c.md', deferred: true }],
      ['TC-A-002', { file: 'c.md', deferred: true, rowless: true }],
    ]);
    const snapshot = {
      issues: [
        { key: 'S-1', summary: 'TC-A-001 — x', issuetype: 'Subtask', labels: ['env-dev'] },
        { key: 'S-2', summary: 'TC-A-002 — y', issuetype: 'Subtask', labels: ['env-dev'] },
      ],
    };
    const r = analyse({ snapshot, tests: [], catalog, envOf: () => 'dev' });
    assert.deepEqual(r.deferred.map((d) => d.key).sort(), ['S-1', 'S-2']);
    assert.equal(r.casesWithoutTest.length, 0);
    assert.equal(r.manual.length, 0);
    assert.equal(r.unknown.length, 0);
  });

  test('a deferred catalog id with no Jira case in the snapshot is deferred, not unknown', () => {
    const catalog = new Map([['TC-A-003', { file: 'c.md', deferred: true, rowless: true }]]);
    const r = analyse({ snapshot: { issues: [] }, tests: [], catalog, envOf: () => 'dev' });
    assert.deepEqual(
      r.deferred.map((d) => [d.tcId, d.key]),
      [['TC-A-003', null]],
    );
    assert.equal(r.unknown.length, 0);
  });
});
