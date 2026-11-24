// Isolated checks for scripts/triage/triage-draft.mjs (Week 5, rule 80 "Saved-report draft").
// node:test, no browser, no network, no model: every worker call goes to a FAKE caller injected through
// main(argv, { spawn, killTree, ... }); the real `claude` is never started. Reports are the existing
// synthetic fixtures (read only) or temporary copies built in a temp folder that is removed afterwards.
// No file under evidence/raw/ is read; records go to a temp output folder.
// Run: node --test safety-tests/triage-draft.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
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
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { after, describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/triage/triage-draft.mjs');
const { main, redact, cleanEnv, classifyWorker, tcIds } = await import(pathToFileURL(SCRIPT).href);

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});
const RAW_REPO = join(ROOT, 'evidence/raw/week5/triage-draft');
const rawBefore = existsSync(RAW_REPO) ? readdirSync(RAW_REPO).join() : '(absent)';

const read = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const FIX = 'evidence/fixtures/flaky';
const STABLE = `${FIX}/stable/run-a/report.json`; // 1 pass, 1 fail, 1 skip
const SKIP_PARTIAL = `${FIX}/skip-partial/run-a/report.json`; // 1 pass, 1 skip (clean)
const RETRY = `${FIX}/retry-flaky/report.json`; // flaky + pass

function tempRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'triage-draft-test-'));
  temps.push(dir);
  return dir;
}
function put(root, rel, content) {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof content === 'string' ? content : `${JSON.stringify(content)}\n`);
  return rel;
}
function tests(report) {
  const out = [];
  (function walk(suites) {
    for (const s of suites) {
      for (const sp of s.specs ?? []) out.push(...sp.tests);
      walk(s.suites ?? []);
    }
  })(report.suites);
  return out;
}
/** Recomputes stats from the tests so a mutated report stays self-consistent. */
function restat(report) {
  const stats = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 };
  for (const t of tests(report)) stats[t.status] += 1;
  Object.assign(report.stats, stats);
  return report;
}

// ---------- fake caller ----------
const INIT = {
  type: 'system',
  subtype: 'init',
  session_id: 'fake-session',
  tools: [],
  mcp_servers: [],
  slash_commands: [],
  model: 'fake-model',
  claude_code_version: '0.0.0-fake',
  apiKeySource: 'none',
};
const ASSISTANT = {
  type: 'assistant',
  message: { content: [{ type: 'text', text: 'FAKE DRAFT' }] },
};
const RESULT = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 1,
  result: 'FAKE DRAFT TEXT',
  session_id: 'fake-session',
};
const OK = [INIT, ASSISTANT, RESULT];

function fakeCaller(scenario = { events: OK }) {
  const calls = [];
  const kills = [];
  const spawn = (cmd, args, opts) => {
    const child = new EventEmitter();
    child.pid = 40000 + calls.length;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    const call = { cmd, args, opts, input: '', killed: 0 };
    calls.push(call);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      child.stdout.end();
      setTimeout(() => child.emit('close', 0), 5);
    };
    child.kill = () => {
      call.killed += 1;
      close();
    };
    child.stdin = {
      end(input) {
        call.input = input;
        scenario.onStart?.(call);
        if (scenario.hang) return;
        for (const event of scenario.events) {
          if (closed) break;
          child.stdout.write(`${JSON.stringify(event)}\n`);
        }
        if (scenario.stderr) child.stderr.write(scenario.stderr);
        close();
      },
    };
    return child;
  };
  const killTree = (child) => {
    kills.push(child.pid);
    child.kill();
  };
  return { spawn, killTree, calls, kills };
}

let tick = 0;
function run(root, argv, caller, extra = {}) {
  return main(argv, {
    root,
    outRoot: root,
    spawn: caller.spawn,
    killTree: caller.killTree,
    now: () => new Date(Date.UTC(2026, 10, 14, 12, 0, (tick += 1))),
    env: { PATH: 'fake-path' },
    ...extra,
  });
}
/** A temp project holding one fixture-style report (plus optional provenance.txt). */
function project(report, { provenance } = {}) {
  const root = tempRoot();
  const rel = put(root, 'evidence/fixtures/flaky/case/report.json', report);
  if (provenance) put(root, 'evidence/fixtures/flaky/case/provenance.txt', provenance);
  return { root, rel };
}
const textOf = (r) => r.out.join('\n');
const records = (root) => {
  const dir = join(root, 'evidence/raw/week5/triage-draft');
  return existsSync(dir) ? readdirSync(dir) : [];
};

describe('clean valid runs skip the model', () => {
  test('pass plus skip only: table printed, no call, exit 0', async () => {
    const { root, rel } = project(read(SKIP_PARTIAL));
    const caller = fakeCaller();
    const r = await run(root, [rel], caller);
    assert.equal(r.code, 0);
    assert.equal(r.status, 'clean-skipped');
    assert.equal(caller.calls.length, 0);
    assert.match(textOf(r), /MODEL CALL SKIPPED/);
    assert.match(textOf(r), /\| skipped \|/);
    assert.match(textOf(r), /skips preserved: 1/);
    const [dir] = records(root);
    const summary = JSON.parse(
      readFileSync(join(root, 'evidence/raw/week5/triage-draft', dir, 'summary.json'), 'utf8'),
    );
    assert.equal(summary.modelCall, 'skipped');
  });

  test('a clean run with no provenance is still valid, and says unverified', async () => {
    const { root, rel } = project(read(SKIP_PARTIAL));
    const r = await run(root, [rel], fakeCaller());
    assert.equal(r.code, 0);
    assert.match(textOf(r), /provenance: unverified/);
  });

  test('--inputs-only prints the table and records nothing', async () => {
    const { root, rel } = project(read(RETRY));
    const caller = fakeCaller();
    const r = await run(root, ['--inputs-only', rel], caller);
    assert.equal(r.code, 0);
    assert.match(textOf(r), /a model call WOULD be made/);
    assert.equal(caller.calls.length, 0);
    assert.deepEqual(records(root), []);
  });
});

describe('failure or instability makes exactly one bounded call', () => {
  test('failure: one call, flags as the router, text-only worker input', async () => {
    const { root, rel } = project(read(STABLE));
    const caller = fakeCaller();
    const r = await run(root, [rel], caller, {
      env: {
        PATH: 'p',
        ANTHROPIC_API_KEY: 'sk-fake-1',
        SLACK_BOT_TOKEN: 'fake-2',
        MY_SECRET: 'fake-3',
      },
    });
    assert.equal(r.code, 0, textOf(r));
    assert.equal(caller.calls.length, 1);
    const call = caller.calls[0];
    assert.equal(call.cmd, 'claude');
    assert.deepEqual(call.args.slice(0, 11), [
      '-p',
      '--tools',
      '',
      '--strict-mcp-config',
      '--setting-sources',
      '',
      '--disable-slash-commands',
      '--no-session-persistence',
      '--output-format',
      'stream-json',
      '--verbose',
    ]);
    for (const banned of [
      '--bare',
      '--dangerously-skip-permissions',
      '--fallback-model',
      '--model',
    ])
      assert.ok(!call.args.includes(banned), banned);
    assert.match(call.input, /^TRIAGE-INPUT: ok/);
    assert.match(call.input, /1 unexpected|\[unexpected\]/);
    assert.match(call.input, /signatureClues: off/);
    assert.ok(!/playbook/i.test(call.input));
    assert.equal((call.input.match(/error-signatures/g) ?? []).length, 1); // only the clues-off header
    assert.deepEqual(Object.keys(call.opts.env), ['PATH']);
    const all = [textOf(r), call.input].join('\n');
    for (const value of ['sk-fake-1', 'fake-2', 'fake-3']) assert.ok(!all.includes(value));
    assert.match(textOf(r), /ANALYST DRAFT \(model text, NOT REVIEWED\)/);
    assert.match(textOf(r), /RESULTS TABLE/);
    const dir = join(root, 'evidence/raw/week5/triage-draft', records(root)[0]);
    assert.deepEqual(readdirSync(dir).sort(), [
      'reply.md',
      'results-table.md',
      'selected-text.txt',
      'stream.jsonl',
      'summary.json',
    ]);
    const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
    assert.deepEqual(summary.envVarsRemoved, ['ANTHROPIC_API_KEY', 'MY_SECRET', 'SLACK_BOT_TOKEN']);
    assert.equal(summary.modelCall, 'made');
    assert.equal(summary.toolUses, 0);
  });

  test('flaky status calls the model', async () => {
    const { root, rel } = project(read(RETRY));
    const caller = fakeCaller();
    const r = await run(root, [rel], caller);
    assert.equal(r.code, 0);
    assert.equal(caller.calls.length, 1);
    assert.match(textOf(r), /flaky test/);
    assert.match(textOf(r), /failed, passed \(retry 1\)/);
  });

  test('a retried attempt calls the model even when the status says expected', async () => {
    const report = read(RETRY);
    for (const t of tests(report)) t.status = 'expected';
    restat(report);
    const { root, rel } = project(report);
    const caller = fakeCaller();
    const r = await run(root, [rel], caller);
    assert.equal(r.code, 0);
    assert.equal(caller.calls.length, 1);
    assert.match(textOf(r), /retried attempt/);
  });
});

describe('invalid or missing evidence is an error, never zero failures', () => {
  const cases = {
    missing: () => ({ rel: 'evidence/fixtures/flaky/nowhere/report.json', root: tempRoot() }),
    malformed: () => project('{"config": '),
    'array root': () => project([]),
    empty: () => project({}),
    'not playwright': () => project({ hello: 'world' }),
    'unsupported major': () => {
      const r = read(SKIP_PARTIAL);
      r.config.version = '2.0.0';
      return project(r);
    },
    'top-level error': () => {
      const r = read(SKIP_PARTIAL);
      r.errors = [{ message: 'global setup failed' }];
      return project(r);
    },
    interrupted: () => {
      const r = read(STABLE);
      tests(r)[1].results[0].status = 'interrupted';
      return project(r);
    },
    'test without result': () => {
      const r = read(SKIP_PARTIAL);
      tests(r)[1].results = [];
      return project(r);
    },
    'stats mismatch': () => {
      const r = read(SKIP_PARTIAL);
      r.stats.expected += 3;
      return project(r);
    },
    'all skipped': () => {
      const r = read(STABLE);
      for (const t of tests(r)) {
        t.status = 'skipped';
        for (const res of t.results) res.status = 'skipped';
      }
      return project(restat(r));
    },
    'zero tests': () => {
      const r = read(SKIP_PARTIAL);
      r.suites = [];
      return project(restat(r));
    },
    'no duration': () => {
      const r = read(SKIP_PARTIAL);
      delete r.stats.duration;
      return project(r);
    },
    'no start time': () => {
      const r = read(SKIP_PARTIAL);
      delete r.stats.startTime;
      return project(r);
    },
  };
  for (const [name, make] of Object.entries(cases)) {
    test(`${name}: exit 1, unavailable, no call, no record`, async () => {
      const { root, rel } = make();
      const caller = fakeCaller();
      const r = await run(root, [rel], caller);
      assert.equal(r.code, 1, textOf(r));
      assert.match(textOf(r), /TRIAGE-DRAFT-STATUS: unavailable/);
      assert.match(textOf(r), /not a clean run and not zero failures/);
      assert.ok(!/MODEL CALL SKIPPED|clean valid run/.test(textOf(r)));
      assert.equal(caller.calls.length, 0);
      assert.deepEqual(records(root), []);
    });
  }

  test('the real fixtures for empty, malformed and unsupported reports are refused too', async () => {
    for (const rel of [
      `${FIX}/empty/report.json`,
      `${FIX}/malformed/truncated.json`,
      `${FIX}/malformed/array-root.json`,
      `${FIX}/unsupported/not-playwright.json`,
      `${FIX}/unsupported/repeat-each.json`,
      `${FIX}/unsupported/sharded.json`,
    ]) {
      const r = await run(tempRoot(), ['--inputs-only', rel], fakeCaller(), { root: ROOT });
      assert.equal(r.code, 1, rel);
    }
  });
});

describe('path and scope checks run before anything is read', () => {
  const bad = [
    ['package.json', 'out-of-scope'],
    ['evidence/week4-checks.md', 'out-of-scope'],
    ['evidence/raw/week4/store-ui/20261112T204457Z/run.json', 'out-of-scope'],
    ['.env', 'refused-name'],
    ['evidence/fixtures/flaky/.env.json', 'refused-name'],
    ['evidence/fixtures/flaky/../../../package.json', 'path-escape'],
    ['/etc/passwd', 'absolute-path'],
    ['evidence\\fixtures\\x.json', 'unsafe-path'],
  ];
  for (const [input, code] of bad) {
    test(`${input} -> ${code}`, async () => {
      const caller = fakeCaller();
      const r = await run(tempRoot(), [input], caller);
      assert.equal(r.code, 1);
      assert.match(textOf(r), new RegExp(`unavailable ${code}`));
      assert.equal(caller.calls.length, 0);
    });
  }

  test('a link in the path is refused', async (t) => {
    const root = tempRoot();
    put(root, 'real/a/report.json', read(SKIP_PARTIAL));
    mkdirSync(join(root, 'evidence/fixtures'), { recursive: true });
    try {
      symlinkSync(join(root, 'real'), join(root, 'evidence/fixtures/flaky'), 'junction');
    } catch {
      t.skip('links are not available here');
      return;
    }
    const r = await run(root, ['evidence/fixtures/flaky/a/report.json'], fakeCaller());
    assert.equal(r.code, 1);
    assert.match(textOf(r), /link-not-allowed/);
  });

  test('usage errors: no path, two paths, unknown option, double space', async () => {
    for (const argv of [[], ['a', 'b'], ['--nope'], ['evidence/x.json  --inputs-only']]) {
      const r = await run(tempRoot(), argv, fakeCaller());
      assert.equal(r.code, 1);
      assert.match(textOf(r), /unavailable usage/);
    }
  });

  test('a secret-like text in the report refuses the input', async () => {
    const report = read(STABLE);
    tests(report)[1].results[0].error = { message: `Bear${'er'} abcdefghijklmnop expired` };
    tests(report)[1].results[0].errors = [{ message: `Bear${'er'} abcdefghijklmnop expired` }];
    const { root, rel } = project(report);
    const caller = fakeCaller();
    const r = await run(root, [rel], caller);
    assert.equal(r.code, 1);
    assert.match(textOf(r), /redacted|secret-like-text|unavailable/);
    assert.equal(caller.calls.length, 0);
  });
});

describe('provenance: only the six fields, only the matching run', () => {
  const E3 = 'evidence/week4-store-ui-20261112T204457Z.sanitized.json';
  const PROV = 'evidence/raw/week4/store-ui/20261112T204457Z/provenance.txt';
  const provText = [
    'run_id: 20261112T204457Z',
    'target_env: dev',
    `head: ${'ab12cd34'.repeat(5)}`,
    'command: npx playwright test --reporter=json',
    'note: hunter2-not-a-real-value',
    '--- git status --short',
    ' M scripts/private-looking-name.ts',
    '--- git diff --stat',
    'exit_code: 1',
    'end_utc: 2026-11-12T20:45:34Z',
  ].join('\n');
  function e3Project(prov = provText, provRel = PROV) {
    const root = tempRoot();
    put(root, E3, readFileSync(join(ROOT, E3), 'utf8'));
    if (prov !== null) put(root, provRel, prov);
    return root;
  }

  test('a sanitized copy without provenance is unverified, not an error', async () => {
    const r = await run(e3Project(null), ['--inputs-only', E3], fakeCaller());
    assert.equal(r.code, 0);
    assert.match(textOf(r), /provenance: unverified/);
  });

  test('matching provenance: six fields only reach the worker', async () => {
    const root = e3Project();
    const caller = fakeCaller();
    const r = await run(root, [E3, '--provenance', PROV], caller);
    assert.equal(r.code, 0, textOf(r));
    const sent = caller.calls[0].input;
    assert.match(sent, /provenanceStatus: provided/);
    assert.match(sent, /target_env=dev/);
    assert.match(sent, /exit_code=1/);
    assert.match(sent, /end_utc=2026-11-12T20:45:34Z/);
    for (const leaked of ['hunter2', 'private-looking-name', 'npx playwright', 'command:'])
      assert.ok(!sent.includes(leaked), leaked);
    assert.match(sent, /head=ab12cd34ab12/);
  });

  test('the table is the same eight tests, with unknown TC IDs left unknown', async () => {
    const r = await run(e3Project(null), ['--inputs-only', E3], fakeCaller());
    const rows = textOf(r)
      .split('\n')
      .filter((l) => /^\| \d+ \|/.test(l));
    assert.equal(rows.length, 8);
    assert.match(rows[1], /TC-SUI-020/);
    assert.match(rows[1], /\| unexpected \| failed \|/);
    assert.match(rows[6], /store\/ui\/coupons\.spec\.ts:64 .*\| TC-SAPI-032 \|/);
  });

  test('provenance outside the accepted folders, wrong area, or another run is refused', async () => {
    const cases = [
      ['evidence/week5-checks.md', 'provenance-out-of-scope'],
      ['evidence/raw/week4/store-api/20261112T204457Z/provenance.txt', 'provenance-mismatch'],
      ['evidence/raw/week4/store-ui/20261108T194122Z/provenance.txt', 'provenance-mismatch'],
      ['.env', 'refused-name'],
    ];
    for (const [prov, code] of cases) {
      const root = e3Project();
      const caller = fakeCaller();
      const r = await run(root, [E3, '--provenance', prov], caller);
      assert.equal(r.code, 1, prov);
      assert.match(textOf(r), new RegExp(code), prov);
      assert.equal(caller.calls.length, 0);
    }
  });

  test('the real capture format (target, exit, utc_end, no run_id) is read and the run id comes from the folder', async () => {
    const real = [
      'command: npx playwright test tests/store/ui --trace=on',
      'utc_start: 2026-11-12T20:45:01Z',
      'target: dev (npm test sets APP_ENV=dev; address from env/target.ts)',
      'shell: bash',
      `head: ${'b7d87d86'.repeat(5)}`,
      'node: v24.20.0',
      'git_status:',
      'git_diff_stat:',
      'exit: 1',
      'utc_end: 2026-11-12T20:45:33Z',
    ].join('\n');
    const caller = fakeCaller();
    const r = await run(e3Project(real), [E3, '--provenance', PROV], caller);
    assert.equal(r.code, 0, textOf(r));
    assert.match(textOf(r), /provenance: provided/);
    const sent = caller.calls[0].input;
    assert.match(sent, /run_id=store-ui\/20261112T204457Z \(from the folder name\)/);
    assert.match(
      sent,
      /target_env=dev \(npm test sets APP_ENV=dev; address from env\/target\.ts\)/,
    );
    assert.match(sent, /exit_code=1/);
    assert.match(sent, /end_utc=2026-11-12T20:45:33Z/);
    for (const leaked of ['npx playwright', 'utc_start', 'shell', 'v24.20.0'])
      assert.ok(!sent.includes(leaked), leaked);
  });

  test('a target value that holds an address is not passed on', async () => {
    const real = provText.replace('target_env: dev', 'target: dev https://example.test/app');
    const r = await run(e3Project(real), ['--inputs-only', E3, '--provenance', PROV], fakeCaller());
    assert.match(textOf(r), /required field\(s\) missing or unreadable: target_env/);
  });

  test('the analyst gets up to six error lines (locator, expectation, timeout); the table keeps one', async () => {
    const caller = fakeCaller();
    const r = await run(e3Project(null), [E3], caller);
    assert.equal(r.code, 0, textOf(r));
    const sent = caller.calls[0].input;
    assert.match(
      sent,
      /error: Error: expect\(locator\)\.toBeVisible\(\) failed \/ Locator: getByTestId\('cart-row'\)/,
    );
    assert.match(sent, /Expected: visible \/ Timeout: 5000ms \/ Error: element\(s\) not found/);
    // The report's own error location reaches the analyst, with no machine path.
    assert.match(sent, /\n {4}at: <repo>\/tests\/store\/ui\/cart\.spec\.ts:70:39\n/);
    assert.ok(!/at: [A-Za-z]:|\\\\/.test(sent.split('\n').find((l) => /^\s+at: /.test(l))));
    assert.match(sent, /error text is cut to its first 6 lines/);
    assert.ok(!/error text is redacted/.test(sent));
    const errorLine = sent.split('\n').find((l) => /^\s+error: /.test(l));
    assert.ok(errorLine.split(' / ').length <= 6);
    const row = textOf(r)
      .split('\n')
      .find((l) => /^\| 2 \|/.test(l));
    assert.match(row, /\| Error: expect\(locator\)\.toBeVisible\(\) failed \|$/);
  });

  test('a run_id that names a different run is refused', async () => {
    const root = e3Project(provText.replace('20261112T204457Z', '20261108T194122Z'));
    const r = await run(root, [E3, '--provenance', PROV], fakeCaller());
    assert.equal(r.code, 1);
    assert.match(textOf(r), /provenance-mismatch/);
  });

  test('missing required fields make it unverified, never provided', async () => {
    const root = e3Project('run_id: 20261112T204457Z\nnote: x\n');
    const r = await run(root, ['--inputs-only', E3, '--provenance', PROV], fakeCaller());
    assert.equal(r.code, 0);
    assert.match(textOf(r), /provenance: unverified — required field\(s\) missing/);
  });

  test('a fixture cannot take --provenance', async () => {
    const { root, rel } = project(read(SKIP_PARTIAL));
    const r = await run(root, [rel, '--provenance', PROV], fakeCaller());
    assert.equal(r.code, 1);
    assert.match(textOf(r), /unavailable usage/);
  });
});

describe('the worker is accepted only when it is verifiably the no-tool route', () => {
  async function attempt(events, extra = {}) {
    const { root, rel } = project(read(STABLE));
    const caller = fakeCaller({ events, ...extra.scenario });
    const r = await run(root, [rel], caller, extra.deps);
    return { r, caller, root };
  }

  test('an init event that lists a tool is BLOCKED and the owned process is killed', async () => {
    const { r, caller } = await attempt([{ ...INIT, tools: ['Read'] }, ASSISTANT, RESULT]);
    assert.equal(r.code, 2);
    assert.match(r.status, /blocked: init lists tools/);
    assert.equal(caller.calls.length, 1);
    assert.deepEqual(caller.kills, [40000]);
    assert.ok(!/ANALYST DRAFT/.test(textOf(r)));
  });

  test('MCP servers, slash commands and an API-key route are BLOCKED', async () => {
    for (const [patch, text] of [
      [{ mcp_servers: [{ name: 'x' }] }, /tools or MCP/],
      [{ slash_commands: ['help'] }, /slash commands/],
      [{ apiKeySource: 'user' }, /API-key route/],
    ]) {
      const { r } = await attempt([{ ...INIT, ...patch }, ASSISTANT, RESULT]);
      assert.equal(r.code, 2);
      assert.match(r.status, text);
    }
  });

  test('a missing tool list is not trusted', async () => {
    const init = { ...INIT };
    delete init.tools;
    const { r } = await attempt([init, ASSISTANT, RESULT]);
    assert.equal(r.code, 2);
  });

  test('a tool_use event is BLOCKED', async () => {
    const use = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write' }] } };
    const { r } = await attempt([INIT, use, RESULT]);
    assert.equal(r.code, 2);
    assert.match(r.status, /attempted a tool call/);
  });

  test('more than 8 turns is BLOCKED', async () => {
    const turns = Array.from({ length: 9 }, () => ASSISTANT);
    const { r, caller } = await attempt([INIT, ...turns, RESULT]);
    assert.equal(r.code, 2);
    assert.match(r.status, /turn cap/);
    assert.equal(caller.calls.length, 1);
  });

  test('a result that reports more turns than allowed is BLOCKED', async () => {
    const { r } = await attempt([INIT, ASSISTANT, { ...RESULT, num_turns: 9 }]);
    assert.equal(r.code, 2);
  });

  test('a hung worker is stopped at the deadline: only its own pid, once, no retry', async () => {
    const { r, caller } = await attempt([], { scenario: { hang: true }, deps: { timeoutMs: 40 } });
    assert.equal(r.code, 2);
    assert.match(r.status, /timeout/);
    assert.deepEqual(caller.kills, [40000]);
    assert.equal(caller.calls.length, 1);
  });

  test('an output without a recognised envelope is unavailable, not a draft', async () => {
    for (const events of [
      [INIT],
      [INIT, ASSISTANT],
      [INIT, ASSISTANT, { type: 'result', result: 'x' }],
    ]) {
      const { r, caller } = await attempt(events);
      assert.equal(r.code, 3);
      assert.match(r.status, /envelope not recognised/);
      assert.equal(caller.calls.length, 1);
    }
  });

  test('a worker error and a rate limit are unavailable, with no automatic retry', async () => {
    const err = { ...RESULT, is_error: true, subtype: 'error_during_execution', result: 'boom' };
    const limit = { ...RESULT, is_error: true, subtype: 'success', result: 'Usage limit reached' };
    for (const [res, text] of [
      [err, /worker error/],
      [limit, /limit/],
    ]) {
      const { r, caller, root } = await attempt([INIT, ASSISTANT, res]);
      assert.equal(r.code, 3);
      assert.match(r.status, text);
      assert.equal(caller.calls.length, 1);
      const dir = join(root, 'evidence/raw/week5/triage-draft', records(root)[0]);
      assert.ok(!existsSync(join(dir, 'reply.md')));
    }
  });

  test('a failed new attempt never shows an earlier draft as fresh success', async () => {
    const { root, rel } = project(read(STABLE));
    const base = join(root, 'evidence/raw/week5/triage-draft');
    const good = await run(root, [rel], fakeCaller());
    assert.equal(good.code, 0);
    const [first] = records(root);
    const firstReply = readFileSync(join(base, first, 'reply.md'), 'utf8');
    const failing = [
      INIT,
      ASSISTANT,
      { ...RESULT, is_error: true, subtype: 'error_during_execution', result: 'boom' },
    ];
    const bad = await run(root, [rel], fakeCaller({ events: failing }));
    assert.equal(bad.code, 3);
    assert.ok(!/ANALYST DRAFT/.test(textOf(bad)));
    assert.ok(!textOf(bad).includes('FAKE DRAFT TEXT'));
    assert.match(textOf(bad), /unavailable: worker error/);
    const folders = records(root);
    assert.equal(folders.length, 2);
    const second = folders.find((n) => n !== first);
    assert.ok(!existsSync(join(base, second, 'reply.md')));
    assert.equal(readFileSync(join(base, first, 'reply.md'), 'utf8'), firstReply);
    const status = (n) => JSON.parse(readFileSync(join(base, n, 'summary.json'), 'utf8')).status;
    assert.equal(status(first), 'draft recorded');
    assert.match(status(second), /^unavailable: worker error/);
  });

  test('an existing record folder is never overwritten and no call is made', async () => {
    const { root, rel } = project(read(STABLE));
    const fixed = { now: () => new Date(Date.UTC(2026, 10, 14, 13, 0, 0)) };
    const base = join(root, 'evidence/raw/week5/triage-draft');
    const first = await run(root, [rel], fakeCaller(), fixed);
    assert.equal(first.code, 0);
    const [name] = records(root);
    const before = readFileSync(join(base, name, 'reply.md'), 'utf8');
    const caller = fakeCaller();
    const again = await run(root, [rel], caller, fixed);
    assert.equal(again.code, 4);
    assert.match(again.status, /record-exists/);
    assert.equal(caller.calls.length, 0);
    assert.equal(readFileSync(join(base, name, 'reply.md'), 'utf8'), before);
    assert.equal(records(root).length, 1);
  });

  test('an empty reply is unavailable', async () => {
    const { r } = await attempt([INIT, ASSISTANT, { ...RESULT, result: '  ' }]);
    assert.equal(r.code, 3);
  });

  test('classifyWorker trusts nothing without an init event', () => {
    assert.equal(classifyWorker({ init: null, result: RESULT, blocked: null }).code, 2);
  });

  test('cleanEnv removes API-key, provider and credential-looking names, keeps the rest', () => {
    const { env, removed } = cleanEnv({
      PATH: 'p',
      SystemRoot: 'r',
      CLAUDE_CODE_OAUTH_TOKEN: 'subscription-route',
      ANTHROPIC_API_KEY: 'a',
      ANTHROPIC_AUTH_TOKEN: 'b',
      CLAUDE_CODE_USE_BEDROCK: '1',
      SLACK_CHANNEL: 'c',
      DATABASE_URI: 'd',
      GH_TOKEN: 'e',
      SOME_PASSWORD: 'f',
    });
    assert.deepEqual(Object.keys(env).sort(), ['CLAUDE_CODE_OAUTH_TOKEN', 'PATH', 'SystemRoot']);
    assert.equal(removed.length, 7);
  });
});

describe('probe: tools listed, refused write', () => {
  test('a worker that leaves no file passes; one that writes is BLOCKED', async () => {
    const ok = await run(tempRoot(), ['--probe'], fakeCaller());
    assert.equal(ok.code, 0);
    assert.match(textOf(ok), /file left in the worker folder: none/);
    const writer = fakeCaller({
      events: OK,
      onStart: (call) => writeFileSync(join(call.opts.cwd, 'probe-refused.txt'), 'test'),
    });
    const bad = await run(tempRoot(), ['--probe'], writer);
    assert.equal(bad.code, 2);
    assert.match(bad.status, /probe file was written/);
  });
  test('--probe takes no input', async () => {
    const r = await run(tempRoot(), ['--probe', 'x.json'], fakeCaller());
    assert.equal(r.code, 1);
  });
});

describe('table: TC IDs come from the title only', () => {
  test('known, repeated, several and unknown', () => {
    assert.equal(tcIds('TC-SUI-020 the cart'), 'TC-SUI-020');
    assert.equal(tcIds('cart TC-SUI-020 and TC-SUI-020 again'), 'TC-SUI-020');
    assert.equal(tcIds('TC-SUI-020 then TC-SAPI-032'), 'TC-SUI-020 / TC-SAPI-032');
    assert.equal(tcIds('always fails'), 'unknown');
    assert.equal(tcIds('tc-sui-020 lower case'), 'unknown');
    assert.equal(tcIds('TC-20 malformed'), 'unknown');
  });
  test('a title without an ID stays unknown even though the file name suggests one', async () => {
    const report = read(STABLE);
    for (const spec of report.suites[0].specs ?? [])
      spec.file = 'tests/store/ui/TC-SUI-099.spec.ts';
    const { root, rel } = project(report);
    const r = await run(root, ['--inputs-only', rel], fakeCaller());
    const rows = textOf(r)
      .split('\n')
      .filter((l) => /^\| \d+ \|/.test(l));
    assert.equal(rows.length, 3);
    for (const row of rows) assert.match(row, /\| unknown \|/);
  });
  test('skips and attempts are preserved in the table', async () => {
    const { root, rel } = project(read(RETRY));
    const r = await run(root, ['--inputs-only', rel], fakeCaller());
    assert.match(textOf(r), /failed, passed \(retry 1\)/);
  });
});

describe('parity with the existing scripts', () => {
  const read2 = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
  const between = (src, start, end) => {
    const i = src.indexOf(start);
    assert.ok(i >= 0, start);
    return src.slice(i, src.indexOf(end, i) + end.length);
  };
  test('redact is the router function, byte for byte', () => {
    const a = between(read2('scripts/triage/triage-run.mjs'), 'function redact(', '\n}\n');
    const b = between(read2('scripts/triage/triage-draft.mjs'), 'function redact(', '\n}\n');
    assert.equal(b, a);
    assert.equal(
      redact(`token: abc123 at ${ROOT.replace(/[\\/]+$/, '')}`),
      'token: <redacted> at <repo>',
    );
  });
  test('the worker flag list is the router list', () => {
    const flags = (src) =>
      between(src, "const args = [\n    '-p',", "'--system-prompt',\n    prompt,\n  ];").replace(
        /\s+/g,
        '',
      );
    assert.equal(
      flags(read2('scripts/triage/triage-draft.mjs')),
      flags(read2('scripts/triage/triage-run.mjs')),
    );
  });
  test('the secret markers are the router markers', () => {
    const m = (src) => between(src, 'const SECRET_MARKERS = [', '\n];');
    assert.equal(
      m(read2('scripts/triage/triage-draft.mjs')),
      m(read2('scripts/triage/triage-run.mjs')),
    );
  });
  test('valid and invalid reports get the same verdict as scripts/slack-report.ts', () => {
    const variants = {
      valid: read(STABLE),
      cleanSkipPlusPass: read(SKIP_PARTIAL),
      interrupted: (() => {
        const r = read(STABLE);
        tests(r)[1].results[0].status = 'interrupted';
        return r;
      })(),
      allSkipped: (() => {
        const r = read(STABLE);
        for (const t of tests(r)) {
          t.status = 'skipped';
          for (const res of t.results) res.status = 'skipped';
        }
        return restat(r);
      })(),
      statsMismatch: (() => {
        const r = read(SKIP_PARTIAL);
        r.stats.expected += 3;
        return r;
      })(),
      unsupportedMajor: (() => {
        const r = read(SKIP_PARTIAL);
        r.config.version = '2.0.0';
        return r;
      })(),
    };
    const verdicts = Object.entries(variants).map(([name, report]) => {
      const root = tempRoot();
      const rel = put(root, 'report.json', report);
      const slack = spawnSync(
        process.execPath,
        [
          join(ROOT, 'scripts/slack-report.ts'),
          join(root, rel),
          '--dry-run',
          '--run-target',
          'dev',
        ],
        { cwd: ROOT, encoding: 'utf8' },
      );
      assert.ok([0, 2].includes(slack.status), `${name}: slack exit ${slack.status}`);
      return [name, report, slack.status === 0 ? 'valid' : 'invalid'];
    });
    return Promise.all(
      verdicts.map(async ([name, report, slack]) => {
        const { root, rel } = project(report);
        const r = await run(root, ['--inputs-only', rel], fakeCaller());
        assert.equal(r.code === 0 ? 'valid' : 'invalid', slack, name);
      }),
    );
  });
});

describe('nothing leaves the temp folders', () => {
  test('no record was written under the repository by this file', () => {
    const after = existsSync(RAW_REPO) ? readdirSync(RAW_REPO).join() : '(absent)';
    assert.equal(after, rawBefore);
  });
  test('the command and wrapper never read error-signatures or run.json', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    assert.ok(!/readFileSync\([^)]*error-signatures/.test(src));
    assert.ok(
      !/run\.json/.test(src.replace(/\/\/.*$/gm, '').replace(/'[^']*run\.json[^']*'/g, '')),
    );
  });
  test('the CLI exits 1 with no call on an out-of-scope path', () => {
    const r = spawnSync(process.execPath, [SCRIPT, 'package.json'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /triage-draft: exit 1 unavailable out-of-scope/);
  });
});
