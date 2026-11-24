// Isolated checks for scripts/triage/triage-run.mjs (Week 4 Task 05, rule 80).
// node:test, no browser, no network, no worker: every call uses --inputs-only, which stops before
// `claude -p` is started and records nothing. Two kinds of check:
//   - the EXISTING synthetic inputs (Task 03 case bundles, Task 04 flaky fixtures), read only;
//   - temporary projects (the three scripts copied into a temp folder) for links, redaction, labels
//     and manifests, so nothing under evidence/ is created or changed. No real run.json is read.
// Run: node --test safety-tests/triage-run.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/triage/triage-run.mjs');
const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

const listing = (dir) => (existsSync(dir) ? readdirSync(dir).sort().join('\n') : '(absent)');
const RECORD_DIRS = ['evidence/raw/week4/triage', 'evidence/triage'].map((d) => join(ROOT, d));
const before = RECORD_DIRS.map(listing);

function run(root, ...args) {
  const r = spawnSync(process.execPath, [join(root, 'scripts/triage/triage-run.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { code: r.status, out: r.stdout ?? '' };
}
const status = (out) => (out.match(/^TRIAGE-STATUS: (.+)$/m) ?? [])[1] ?? '';
const last = (out) => out.trim().split('\n').pop();

describe('existing synthetic inputs (read only)', () => {
  for (const n of ['01', '02', '03', '04', '05', '06']) {
    test(`case-${n} bundle keeps its ID, synthetic label and source version`, () => {
      const { code, out } = run(
        ROOT,
        '--inputs-only',
        `evidence/agent-quality/fixtures/case-${n}/case.json`,
      );
      assert.equal(code, 0, out);
      assert.match(out, new RegExp(`^inputId: case-${n}$`, 'm'));
      assert.match(out, /^inputKind: case-bundle$/m);
      assert.match(out, /^label: synthetic$/m);
      assert.match(out, /^sourceVersion: v1$/m);
      assert.match(out, /^signatureClues: off/m);
      assert.doesNotMatch(out, /=== FILE (rubric|original-answer)/);
      assert.doesNotMatch(out, /Supplied review checklist|rubric-map/);
    });
  }

  test('case-02 declares missing observations and is accepted, not an input error', () => {
    const { code, out } = run(
      ROOT,
      '--inputs-only',
      'evidence/agent-quality/fixtures/case-02/case.json',
    );
    assert.equal(code, 0);
    assert.match(out, /^missingObservations:$/m);
    assert.match(out, /trace or network log of the payment request/);
  });

  for (const [path, id] of [
    ['evidence/fixtures/flaky/retry-flaky/report.json', 'flaky-retry-flaky'],
    ['evidence/fixtures/flaky/stable/run-a/report.json', 'flaky-stable-run-a'],
  ]) {
    test(`${id} is read as synthetic Playwright JSON`, () => {
      const { code, out } = run(ROOT, '--inputs-only', path);
      assert.equal(code, 0, out);
      assert.match(out, new RegExp(`^inputId: ${id}$`, 'm'));
      assert.match(out, /^inputKind: playwright-json$/m);
      assert.match(out, /^label: synthetic$/m);
      assert.match(out, /SYNTHETIC practice input/);
    });
  }

  const errors = [
    ['evidence/fixtures/flaky/empty/report.json', 'empty'],
    ['evidence/fixtures/flaky/malformed/truncated.json', 'malformed'],
    ['evidence/fixtures/flaky/malformed/array-root.json', 'malformed'],
    ['evidence/fixtures/flaky/unsupported/sharded.json', 'unsupported'],
    ['evidence/fixtures/flaky/unsupported/repeat-each.json', 'unsupported'],
    ['evidence/fixtures/flaky/unsupported/not-playwright.json', 'unsupported'],
    ['evidence/fixtures/flaky/missing/report.json', 'missing-file'],
    ['evidence/agent-quality/fixtures/case-99/case.json', 'missing-file'],
    ['evidence/agent-quality/fixtures/case-03', 'out-of-scope'],
    ['evidence/agent-quality/rubric.md', 'out-of-scope'],
    ['evidence/agent-quality/error-signatures.md', 'out-of-scope'],
    ['evidence/agent-quality/scorecard.md', 'out-of-scope'],
    ['.env', 'refused-name'],
    ['evidence/fixtures/flaky/.env.json', 'refused-name'],
    ['.auth/user.json', 'refused-name'],
    ['../outside.json', 'path-escape'],
    ['evidence/./fixtures/flaky/stable/run-a/report.json', 'path-escape'],
    ['/etc/report.json', 'absolute-path'],
    ['C:/report.json', 'unsafe-path'],
    ['evidence\\fixtures\\flaky\\stable\\run-a\\report.json', 'unsafe-path'],
    ['//server/share/report.json', 'absolute-path'],
    ['evidence/fixtures/flaky/stable/run-a/report.json; echo x', 'unsafe-path'],
  ];
  for (const [path, code] of errors) {
    test(`input error ${code}: ${path}`, () => {
      const r = run(ROOT, '--inputs-only', path);
      assert.equal(r.code, 1, r.out);
      assert.equal(status(r.out), `input-error ${code}`);
      assert.match(r.out, /No worker started; nothing was diagnosed or recorded\./);
      assert.equal(last(r.out), `triage-run: exit 1 input-error ${code}`);
    });
  }

  test('usage errors: no argument, two arguments, an unknown option', () => {
    for (const args of [[], ['a.json', 'b.json'], ['--clues', 'x.json']]) {
      const r = run(ROOT, ...args);
      assert.equal(r.code, 1);
      assert.equal(status(r.out), 'input-error usage');
    }
  });

  test('--inputs-only recorded nothing under evidence/', () => {
    assert.deepEqual(RECORD_DIRS.map(listing), before);
  });
});

/** A temp project with the three scripts; returns its root. */
function project() {
  const root = mkdtempSync(join(tmpdir(), 'triage-run-test-'));
  temps.push(root);
  for (const file of [
    'scripts/triage/triage-run.mjs',
    'scripts/agent-quality/bundle.mjs',
    'scripts/flaky-triage.ts',
  ]) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    copyFileSync(join(ROOT, file), join(root, file));
  }
  return root;
}
const fixture = (name) => readFileSync(join(ROOT, 'evidence/fixtures/flaky', name), 'utf8');
function place(root, dir, report, provenance) {
  mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, dir, dir.includes('/raw/') ? 'run.json' : 'report.json'), report);
  if (provenance !== undefined) writeFileSync(join(root, dir, 'provenance.txt'), provenance);
}
/** The retry fixture with its first error message replaced. */
function withMessage(message) {
  const report = JSON.parse(fixture('retry-flaky/report.json'));
  const walk = (suites) => {
    for (const s of suites ?? []) {
      for (const spec of s.specs ?? [])
        for (const t of spec.tests)
          for (const r of t.results)
            if (r.errors?.length) {
              r.errors[0].message = message;
              if (r.error) r.error.message = message;
            }
      walk(s.suites);
    }
  };
  walk(report.suites);
  return JSON.stringify(report);
}

describe('temporary projects', () => {
  test('a linked folder inside the flaky scope is refused', (t) => {
    const root = project();
    const outside = mkdtempSync(join(tmpdir(), 'triage-outside-'));
    temps.push(outside);
    writeFileSync(join(outside, 'report.json'), fixture('stable/run-a/report.json'));
    mkdirSync(join(root, 'evidence/fixtures/flaky'), { recursive: true });
    try {
      symlinkSync(outside, join(root, 'evidence/fixtures/flaky/linked'), 'junction');
    } catch (error) {
      t.skip(`cannot create a link here: ${error.code}`);
      return;
    }
    const r = run(root, '--inputs-only', 'evidence/fixtures/flaky/linked/report.json');
    assert.equal(r.code, 1, r.out);
    assert.match(status(r.out), /^input-error (link-not-allowed|path-escape)$/);
  });

  test('error text is redacted: addresses, cookies, tokens, local paths', () => {
    const root = project();
    const message = [
      'Error: failed at https://dev.example.test/cart?id=42',
      'cookie: cart_id=abc123secret',
      'token=zzz999',
      `${root}/tests/x.spec.ts`,
    ].join('\n');
    place(
      root,
      'evidence/fixtures/flaky/redact',
      withMessage(message),
      fixture('retry-flaky/provenance.txt'),
    );
    const r = run(root, '--inputs-only', 'evidence/fixtures/flaky/redact/report.json');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /<url>/);
    assert.match(r.out, /cookie: <redacted>/);
    assert.doesNotMatch(r.out, /dev\.example\.test|abc123secret|zzz999/);
    assert.match(r.out, /<repo>\/tests\/x\.spec\.ts/);
  });

  test('secret-like text that redaction cannot remove refuses the input', () => {
    const root = project();
    place(
      root,
      'evidence/fixtures/flaky/secret',
      withMessage(`Error: header ${'Bear' + 'er'} abcdefghijklmnop1234`),
      fixture('retry-flaky/provenance.txt'),
    );
    const r = run(root, '--inputs-only', 'evidence/fixtures/flaky/secret/report.json');
    assert.equal(status(r.out), 'input-error secret-like-text');
    assert.doesNotMatch(r.out, /abcdefghijklmnop1234/);
  });

  test('a real-scope report needs provenance and a real label; its text is not printed', () => {
    const root = project();
    const report = fixture('stable/run-a/report.json');
    place(root, 'evidence/raw/week4/store-ui/20990101T000000Z', report);
    let r = run(root, '--inputs-only', 'evidence/raw/week4/store-ui/20990101T000000Z/run.json');
    assert.equal(status(r.out), 'input-error missing-provenance');

    place(
      root,
      'evidence/raw/week4/store-ui/20990101T000001Z',
      report,
      fixture('stable/run-a/provenance.txt'),
    );
    r = run(root, '--inputs-only', 'evidence/raw/week4/store-ui/20990101T000001Z/run.json');
    assert.equal(status(r.out), 'input-error label-mismatch');

    place(
      root,
      'evidence/raw/week4/store-ui/20990101T000002Z',
      report,
      'run_id: x\nsynthetic: false\ntarget_env: dev\n',
    );
    r = run(root, '--inputs-only', 'evidence/raw/week4/store-ui/20990101T000002Z/run.json');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^label: real$/m);
    assert.match(r.out, /^inputId: real-store-ui-20990101T000002Z$/m);
    assert.doesNotMatch(r.out, /selected text/);
  });

  // Added 2026-11-10: fields after the git blocks (exit_code, end_utc) used to be dropped.
  test('provenance fields after the git blocks reach the summary; git status is read', () => {
    const root = project();
    const prov = [
      'run_id: synthetic-test',
      'synthetic: true',
      'target_env: none',
      '--- git status --short',
      ' M some/file.ts',
      '--- git diff --stat',
      ' some/file.ts | 2 +-',
      'exit_code: 7',
      'end_utc: 2099-01-01T00:00:00Z',
      '',
    ].join('\n');
    place(root, 'evidence/fixtures/flaky/prov', fixture('retry-flaky/report.json'), prov);
    const r = run(root, '--inputs-only', 'evidence/fixtures/flaky/prov/report.json');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /exit_code=7 git_status=dirty/);
  });

  test('the existing retry fixture now shows its recorded exit_code', () => {
    const r = run(ROOT, '--inputs-only', 'evidence/fixtures/flaky/retry-flaky/report.json');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /exit_code=synthetic git_status=clean/);
  });

  test('a synthetic-scope report whose provenance is not synthetic is refused', () => {
    const root = project();
    place(
      root,
      'evidence/fixtures/flaky/notsyn',
      fixture('stable/run-a/report.json'),
      'synthetic: false\n',
    );
    const r = run(root, '--inputs-only', 'evidence/fixtures/flaky/notsyn/report.json');
    assert.equal(status(r.out), 'input-error label-mismatch');
  });

  const manifest = {
    caseId: 'case-01',
    inputKind: 'synthetic',
    sourceVersion: 'v1',
    sourceDate: '2026-11-08',
    requirementPath: 'requirement.md',
    evidencePaths: ['run-summary.json'],
    missingObservations: [],
  };
  function caseProject(m) {
    const root = project();
    const dir = join(root, 'evidence/agent-quality/fixtures/case-01');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'case.json'), typeof m === 'string' ? m : JSON.stringify(m));
    writeFileSync(join(dir, 'requirement.md'), '# Requirement\n\nSynthetic practice input.\n');
    writeFileSync(join(dir, 'run-summary.json'), '{ "synthetic": true }\n');
    return root;
  }
  for (const [name, m, code] of [
    ['an expected-answer field', { ...manifest, expectedClass: 'locator' }, 'unknown-field'],
    ['a missing field', { ...manifest, missingObservations: undefined }, 'missing-field'],
    ['a malformed manifest', '{ "caseId": ', 'malformed-manifest'],
    ['an unresolved evidence path', { ...manifest, evidencePaths: ['absent.txt'] }, 'missing-file'],
    ['a path outside the case folder', { ...manifest, evidencePaths: ['../x.txt'] }, 'bad-path'],
  ]) {
    test(`case bundle with ${name} is an input error (${code})`, () => {
      const r = run(
        caseProject(m),
        '--inputs-only',
        'evidence/agent-quality/fixtures/case-01/case.json',
      );
      assert.equal(r.code, 1, r.out);
      assert.equal(status(r.out), `input-error ${code}`);
    });
  }
});

describe('worker configuration and command', () => {
  const argsBlock = (file) => {
    const text = readFileSync(join(ROOT, file), 'utf8');
    const m = text.match(/const args = \[([\s\S]*?)\];/);
    assert.ok(m, `${file} has an args list`);
    return m[1].replace(/\s+/g, ' ').trim();
  };
  test('the worker flags equal those of scripts/agent-quality/run-worker.mjs', () => {
    assert.equal(
      argsBlock('scripts/triage/triage-run.mjs'),
      argsBlock('scripts/agent-quality/run-worker.mjs'),
    );
    assert.match(
      argsBlock('scripts/triage/triage-run.mjs'),
      /'--tools', '', '--strict-mcp-config', '--setting-sources', ''/,
    );
  });
  test('the router never names the checklist, scorecard, answers or signature table as a read', () => {
    const text = readFileSync(SCRIPT, 'utf8');
    for (const name of ['rubric.md', 'rubric-map.json', 'scorecard.md', 'agent-quality/answers']) {
      assert.ok(!text.includes(`'${name}`) && !text.includes(`/${name}'`), name);
    }
    assert.doesNotMatch(text, /readFileSync\([^)]*error-signatures/);
  });
  // Added 2026-11-10 after case-05's next check proposed reading a session file.
  test('the router instructions forbid proposing to read secrets or login state', () => {
    const text = readFileSync(join(ROOT, 'scripts/triage/instructions/router.md'), 'utf8');
    assert.match(text, /Never propose that anyone opens, reads or copies secrets or login state/);
    assert.match(text, /storage-state files/);
  });
  test('the command is typed by the owner and pre-approves only the router script', () => {
    const text = readFileSync(join(ROOT, '.claude/commands/triage-run.md'), 'utf8');
    assert.match(text, /^disable-model-invocation: true$/m);
    assert.match(text, /^allowed-tools: Bash\(node scripts\/triage\/triage-run\.mjs:\*\)$/m);
  });
});

// Added 2026-11-10 (Week 4 Task 05b, rule 80 "Fleet round"): the --fleet mode, through
// --inputs-only only (no worker, nothing recorded). The checks above stay unchanged.
describe('fleet round (inputs only)', () => {
  const C03 = 'evidence/agent-quality/fixtures/case-03/case.json';
  const C01 = 'evidence/agent-quality/fixtures/case-01/case.json';
  const RF = 'evidence/fixtures/flaky/retry-flaky/report.json';
  const REAL = 'evidence/raw/week4/store-api/20261107T191145Z/run.json';
  const fleet = (...tokens) => `--fleet ${tokens.join(' ')}`;
  const approved = fleet(`test-repair=${C03}`, `flaky-results=${RF}`, `bug-report=${C01}`);
  const fleetBefore = RECORD_DIRS.map(listing);

  test('the approved round builds all three inputs with their IDs, versions and hashes', () => {
    const { code, out } = run(ROOT, '--inputs-only', approved);
    assert.equal(code, 0, out);
    assert.equal(last(out), 'triage-run: exit 0 fleet-inputs-only ok');
    assert.match(out, /^role: test-repair\n {2}question: Is a test-side repair supported/m);
    assert.match(out, /inputId: case-03 · case-bundle · synthetic · v1 \(2026-11-08\)/);
    assert.match(out, /inputSha256: 0f9d09f8\S+ \(bundleSha256 from bundle\.mjs\)/);
    assert.match(out, /inputId: flaky-retry-flaky · playwright-json · synthetic/);
    assert.match(out, /inputSha256: 0d018def/);
    assert.match(out, /inputId: case-01 · case-bundle · synthetic · v1 \(2026-11-08\)/);
    assert.match(out, /inputSha256: df7bf1ad\S+ \(bundleSha256 from bundle\.mjs\)/);
    assert.doesNotMatch(
      out,
      /Supplied review checklist|rubric-map|=== FILE (rubric|original-answer)/,
    );
  });

  test('token order does not matter; roles come out in fixed order', () => {
    const { code, out } = run(
      ROOT,
      '--inputs-only',
      fleet(`bug-report=${C01}`, `test-repair=${C03}`, `flaky-results=${RF}`),
    );
    assert.equal(code, 0, out);
    assert.ok(out.indexOf('role: test-repair') < out.indexOf('role: bug-report'));
  });

  for (const [name, arg, code] of [
    ['a missing role', fleet(`test-repair=${C03}`, `flaky-results=${RF}`), 'fleet-missing-role'],
    [
      'a duplicate role',
      fleet(`test-repair=${C03}`, `test-repair=${C01}`, `flaky-results=${RF}`, `bug-report=${C01}`),
      'fleet-duplicate-role',
    ],
    [
      'an unknown role',
      fleet(`test-repair=${C03}`, `flaky-results=${RF}`, `bug-report=${C01}`, `extra=${C01}`),
      'fleet-unknown-role',
    ],
    [
      'the same input for two roles',
      fleet(`test-repair=${C01}`, `flaky-results=${RF}`, `bug-report=${C01}`),
      'fleet-duplicate-input',
    ],
    [
      'a token without a role',
      fleet(C03, `flaky-results=${RF}`, `bug-report=${C01}`),
      'fleet-token',
    ],
    [
      'a double space',
      `--fleet test-repair=${C03}  flaky-results=${RF} bug-report=${C01}`,
      'usage',
    ],
    [
      'a "=" inside a path',
      fleet(`test-repair=${C03}=x`, `flaky-results=${RF}`, `bug-report=${C01}`),
      'unsafe-path',
    ],
    [
      'a real run.json',
      fleet(`test-repair=${C03}`, `flaky-results=${REAL}`, `bug-report=${C01}`),
      'fleet-real-input',
    ],
    [
      'a report for a bundle role',
      fleet(
        `test-repair=${RF}`,
        `flaky-results=${RF.replace('retry-flaky/report', 'stable/run-a/report')}`,
        `bug-report=${C01}`,
      ),
      'fleet-wrong-kind',
    ],
    [
      'a bundle for the report role',
      fleet(
        `test-repair=${C03}`,
        `flaky-results=evidence/agent-quality/fixtures/case-02/case.json`,
        `bug-report=${C01}`,
      ),
      'fleet-wrong-kind',
    ],
    [
      'one missing input file',
      fleet(
        `test-repair=${C03}`,
        `flaky-results=${RF}`,
        'bug-report=evidence/agent-quality/fixtures/case-99/case.json',
      ),
      'missing-file',
    ],
    [
      'the checklist as input',
      fleet(
        `test-repair=${C03}`,
        `flaky-results=${RF}`,
        'bug-report=evidence/agent-quality/rubric.md',
      ),
      'out-of-scope',
    ],
  ]) {
    test(`fleet input error ${code}: ${name} stops the whole round`, () => {
      const r = run(ROOT, '--inputs-only', arg);
      assert.equal(r.code, 1, r.out);
      assert.equal(status(r.out), `input-error ${code}`);
      assert.match(r.out, /No worker started; nothing was diagnosed or recorded\./);
    });
  }

  test('a fleet string without the exact prefix is still a usage or path error', () => {
    assert.equal(status(run(ROOT, `--fleetx test-repair=${C03}`).out), 'input-error usage');
    assert.equal(status(run(ROOT, '--fleet').out), 'input-error usage');
    assert.equal(
      status(run(ROOT, '--inputs-only', `--fleetx ${C03}`).out),
      'input-error unsafe-path',
    );
  });

  test('single-input mode still refuses a space or "=" in its one path', () => {
    assert.equal(
      status(run(ROOT, '--inputs-only', `${C03} ${C01}`).out),
      'input-error unsafe-path',
    );
    assert.equal(
      status(run(ROOT, '--inputs-only', `test-repair=${C03}`).out),
      'input-error unsafe-path',
    );
  });

  test('the fleet reuses the one worker: a single args list in the router', () => {
    const text = readFileSync(SCRIPT, 'utf8');
    assert.equal(text.match(/const args = \[/g)?.length, 1);
    assert.match(text, /runWorker\(it\.prompt, it\.text, it\.dir\)/);
  });

  test('the worker is blocked on slash commands as well as tools and MCP servers', () => {
    const text = readFileSync(SCRIPT, 'utf8');
    assert.match(text, /event\.slash_commands/);
    assert.match(text, /state\.blocked = 'init lists slash commands'/);
  });

  test('the router never writes a triage-report.md; the proposed one is marked NOT REVIEWED', () => {
    const text = readFileSync(SCRIPT, 'utf8');
    assert.doesNotMatch(text, /'triage-report\.md'/);
    assert.match(text, /triage-report\.proposed\.md/);
    assert.match(text, /PROPOSED, NOT REVIEWED/);
  });

  test('the three role instructions keep the limits and the reply contract', () => {
    for (const file of ['test-repair.md', 'flaky-results.md', 'bug-report.md']) {
      const text = readFileSync(join(ROOT, 'scripts/triage/instructions', file), 'utf8');
      assert.match(
        text,
        /Never propose that anyone opens, reads or copies secrets or login state/,
        file,
      );
      assert.match(text, /never say or imply that you did|never say or\s+imply that you did/, file);
      assert.match(text, /TRIAGE-STATUS: input-error/, file);
      assert.match(text, /unclassified — needs evidence/, file);
      assert.match(text, /target: … \| purpose: … \| possible effects: … \| NOT EXECUTED/, file);
      assert.match(text, /\*\*Missing evidence\*\*/, file);
    }
    const bug = readFileSync(join(ROOT, 'scripts/triage/instructions/bug-report.md'), 'utf8');
    assert.match(bug, /SIMULATED/);
    assert.match(bug, /never file/i);
  });

  test('the command names the fleet form and still pre-approves only the router', () => {
    const text = readFileSync(join(ROOT, '.claude/commands/triage-run.md'), 'utf8');
    assert.match(text, /^argument-hint: .*--fleet test-repair=/m);
    assert.match(text, /^allowed-tools: Bash\(node scripts\/triage\/triage-run\.mjs:\*\)$/m);
  });

  test('fleet --inputs-only recorded nothing under evidence/', () => {
    assert.deepEqual(RECORD_DIRS.map(listing), fleetBefore);
  });
});

// Added 2026-11-10 after the fleet review (owner-approved follow-ups A and B).
describe('fleet review follow-ups', () => {
  const gateDirs = () =>
    readdirSync(tmpdir())
      .filter((name) => name.startsWith('triage-gate-'))
      .sort();

  test('a report refused as secret-like leaves no gate folder behind', () => {
    const root = project();
    place(
      root,
      'evidence/fixtures/flaky/secret',
      withMessage(`Error: header ${'Bear' + 'er'} abcdefghijklmnop1234`),
      fixture('retry-flaky/provenance.txt'),
    );
    const before = gateDirs();
    const r = run(root, '--inputs-only', 'evidence/fixtures/flaky/secret/report.json');
    assert.equal(status(r.out), 'input-error secret-like-text');
    assert.deepEqual(gateDirs(), before);
  });

  test('an accepted report leaves no gate folder behind in --inputs-only', () => {
    const before = gateDirs();
    const r = run(ROOT, '--inputs-only', 'evidence/fixtures/flaky/retry-flaky/report.json');
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(gateDirs(), before);
  });

  test('the flaky-results instructions explain the bare [expected] line', () => {
    const text = readFileSync(join(ROOT, 'scripts/triage/instructions/flaky-results.md'), 'utf8');
    assert.match(
      text,
      /For a test marked `\[expected\]`, the summary does not list passed attempts/,
    );
  });
});
