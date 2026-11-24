// Isolated checks for scripts/slack-report.ts (Week 5 Task 02). node:test, no browser, no network.
// Slack is simulated: every call goes through an injected fake fetch, credentials are fake, and the
// real .env is never read (readDotEnv is injected). Real inputs are the sanitized Week 4 reports;
// every variant is SYNTHETIC, built in memory and written to a temp folder that is removed after.
//
//   node --test safety-tests/slack-report.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { run } from '../scripts/slack-report.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts', 'slack-report.ts');
const E1 = 'evidence/week4-store-api-20261112T204343Z.sanitized.json';
const E2 = 'evidence/week4-blog-ui-20261112T204413Z.sanitized.json';
const E3 = 'evidence/week4-store-ui-20261112T204457Z.sanitized.json';
// Fake credentials. Token prefixes are assembled so no staged file holds a literal token.
const FAKE_TOKEN = 'xo' + 'xb-' + '0000-FAKE-TEST-ONLY';
const FAKE_CHANNEL = 'CFAKE00001';
const TOKEN_PREFIXES = new RegExp(
  ['xo' + 'x[a-z]-', 'xa' + 'pp-', 'AT' + 'ATT', 'AK' + 'IA'].join('|'),
);

const temps = [];
after(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

function deps(over = {}) {
  const d = {
    calls: [],
    dotEnvReads: 0,
    lines: [],
    fetch: async (url, init) => {
      d.calls.push({ url, init });
      return new globalThis.Response(
        JSON.stringify({
          ok: true,
          team: 'Fake Team',
          team_id: 'T0FAKE',
          user: 'fake-bot',
          bot_id: 'B0FAKE',
        }),
        {
          status: 200,
        },
      );
    },
    env: {},
    readDotEnv: () => {
      d.dotEnvReads += 1;
      return undefined;
    },
    log: (l) => d.lines.push(l),
    root: ROOT,
    ...over,
  };
  return d;
}
const out = (d) => d.lines.join('\n');
const creds = { SLACK_BOT_TOKEN: FAKE_TOKEN, SLACK_CHANNEL: FAKE_CHANNEL };
/** A fake fetch that records the call on `d` and answers with `body`. */
function answer(d, body, status = 200, headers = {}) {
  d.fetch = async (url, init) => {
    d.calls.push({ url, init });
    return new globalThis.Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers,
    });
  };
}

function load(p) {
  return JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
}
function variant(base, mutate) {
  const j = load(base);
  mutate(j);
  const dir = mkdtempSync(join(tmpdir(), 'slack-report-test-'));
  temps.push(dir);
  const p = join(dir, 'variant.json');
  writeFileSync(p, JSON.stringify(j));
  return p;
}
function rowsOf(j) {
  const rows = [];
  const walk = (s) => {
    for (const sp of s.specs ?? [])
      for (const t of sp.tests) rows.push({ spec: sp, test: t, suite: s });
    for (const c of s.suites ?? []) walk(c);
  };
  for (const s of j.suites) walk(s);
  return rows;
}
async function previewDigest(path, extra = []) {
  const d = deps();
  assert.equal(await run([path, '--run-target', 'dev', ...extra], d), 0);
  return /digest: ([0-9a-f]{12})/.exec(out(d))[1];
}

describe('preview and dry-run never contact Slack', () => {
  for (const flag of [[], ['--dry-run']]) {
    test(`E3 ${flag.join(' ') || 'default'}: no fetch, no .env read, even with credentials present`, async () => {
      const d = deps({ env: { ...creds } });
      assert.equal(await run([E3, '--run-target', 'dev', ...flag], d), 0);
      assert.equal(d.calls.length, 0);
      assert.equal(d.dotEnvReads, 0);
      assert.match(out(d), /Slack: not contacted \(preview\)/);
      assert.match(out(d), /slack-report: exit 0 preview FAIL$/);
    });
  }
  test('a fetch that throws is never reached', async () => {
    const d = deps({
      fetch: () => {
        throw new Error('fetch must not run in preview');
      },
    });
    assert.equal(await run([E1, '--run-target', 'dev'], d), 0);
  });
});

describe('verdicts and message content on the real Week 4 reports', () => {
  test('E3: FAIL with counts, scope, source, target, durations and the failure', async () => {
    const d = deps();
    await run([E3, '--run-target', 'dev'], d);
    const o = out(d);
    assert.match(o, /^FAIL · qa-framework · target: dev \(--run-target\)/);
    assert.match(o, /Pass 7 · Fail 1 · Flaky 0 · Skip 0/);
    assert.match(o, /run 20261112T204457Z/);
    assert.match(o, /started 2026-11-12 20:45:01Z/);
    assert.match(o, /8 tests/);
    assert.match(o, /Attempts: 8, of which retried: 0/);
    assert.match(o, /Elapsed: 32\.4 s \(run total, stats\.duration\)/);
    assert.match(o, /Sum of test durations: 29\.9 s \(not elapsed\)/);
    assert.match(o, /Failures \(1 of 1\):/);
    assert.match(o, /TC-SUI-020/);
    assert.match(
      o,
      /Evidence: local-only \(evidence\/week4-store-ui-20261112T204457Z\.sanitized\.json\)/,
    );
    assert.doesNotMatch(o, /[A-Za-z]:\\|\/Users\//);
  });
  test('E1: PASS with 4 skipped and the recorded skip reason', async () => {
    const d = deps();
    await run([E1, '--run-target', 'dev'], d);
    assert.match(out(d), /^PASS ·/);
    assert.match(out(d), /Pass 14 · Fail 0 · Flaky 0 · Skip 4/);
    assert.match(out(d), /Skipped: 4 × blocked: mentor M5/);
  });
  test('source label keeps the full report name (no token rule misfire on a long file name)', async () => {
    const d = deps();
    await run([E1, '--run-target', 'dev'], d);
    assert.match(out(d), /Source: week4-store-api-20261112T204343Z \(run 20261112T204343Z\)/);
    assert.doesNotMatch(out(d), /Source: \[redacted\]/);
  });
  test('E2: PASS, 11 tests', async () => {
    const d = deps();
    await run([E2, '--run-target', 'dev'], d);
    assert.match(out(d), /Pass 11 · Fail 0/);
  });
  test('smoke: not recorded in the real Week 4 reports, never taken from current source', async () => {
    const d = deps();
    await run([E3, '--run-target', 'dev'], d);
    assert.match(out(d), /Smoke: not recorded in this run/);
  });
  test('target: flag, unknown when absent, bad value refused', async () => {
    let d = deps();
    await run([E1], d);
    assert.match(out(d), /target: unknown \(not recorded in the report; pass --run-target\)/);
    d = deps();
    assert.equal(await run([E1, '--run-target', 'staging'], d), 1);
  });
});

describe('invalid or unusable input is an error, never PASS, and cannot be sent', () => {
  const cases = {
    'missing file': () => join(tmpdir(), 'slack-report-does-not-exist.json'),
    'unsupported version': () => variant(E3, (j) => (j.config.version = '2.0.0')),
    'stats mismatch': () => variant(E3, (j) => (j.stats.expected += 1)),
    'top-level errors': () => variant(E3, (j) => j.errors.push({ message: 'boom' })),
    'interrupted result': () =>
      variant(E3, (j) => {
        rowsOf(j)[0].test.results[0].status = 'interrupted';
      }),
    'test without result': () =>
      variant(E3, (j) => {
        rowsOf(j)[0].test.results = [];
      }),
    'zero tests': () =>
      variant(E3, (j) => {
        j.suites = [];
        Object.assign(j.stats, { expected: 0, unexpected: 0, flaky: 0, skipped: 0 });
      }),
    'all skipped': () =>
      variant(E3, (j) => {
        const rows = rowsOf(j);
        for (const r of rows) r.test.status = 'skipped';
        Object.assign(j.stats, { expected: 0, unexpected: 0, flaky: 0, skipped: rows.length });
      }),
  };
  for (const [name, make] of Object.entries(cases)) {
    test(`${name}: exit 2 in preview and in send, fetch never called`, async () => {
      const path = make();
      let d = deps();
      assert.equal(await run([path], d), 2);
      assert.doesNotMatch(out(d), /exit 0/);
      d = deps({ env: { ...creds } });
      assert.equal(await run(['--send', path, '--approve-digest', 'aaaaaaaaaaaa'], d), 2);
      assert.equal(d.calls.length, 0);
    });
  }
  test('text that is not JSON', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slack-report-test-'));
    temps.push(dir);
    writeFileSync(join(dir, 'bad.json'), '{ not json');
    const d = deps();
    assert.equal(await run([join(dir, 'bad.json')], d), 2);
    assert.match(out(d), /invalid_input/);
  });
});

describe('retries, flaky, failures cap and smoke metadata (synthetic variants)', () => {
  test('flaky test: PASS (flaky), attempts counted apart from tests', async () => {
    const p = variant(E2, (j) => {
      const r = rowsOf(j)[0].test;
      r.status = 'flaky';
      r.results = [
        { ...r.results[0], status: 'failed', retry: 0 },
        { ...r.results[0], retry: 1 },
      ];
      j.stats.expected -= 1;
      j.stats.flaky += 1;
    });
    const d = deps();
    await run([p, '--run-target', 'dev'], d);
    assert.match(out(d), /^PASS \(flaky\)/);
    assert.match(out(d), /Flaky 1/);
    assert.match(out(d), /Attempts: 12, of which retried: 1/);
  });
  test('more than ten failures: ten shown, omitted count stated', async () => {
    const p = variant(E3, (j) => {
      const failing = rowsOf(j).find((r) => r.test.status === 'unexpected');
      for (let i = 0; i < 11; i++)
        failing.suite.specs.push(globalThis.structuredClone(failing.spec));
      j.stats.unexpected += 11;
    });
    const d = deps();
    await run([p, '--run-target', 'dev'], d);
    assert.match(out(d), /Failures \(10 of 12\):/);
    assert.match(out(d), /\+2 more not shown/);
    assert.equal(
      out(d)
        .split('\n')
        .filter((l) => /^\d+\. /.test(l)).length,
      10,
    );
  });
  test('smoke tags present (either spelling) give actual counts', async () => {
    const p = variant(E3, (j) => {
      const rows = rowsOf(j);
      rows.find((r) => r.test.status === 'unexpected').spec.tags = ['smoke', 'regression'];
      rows.find((r) => r.test.status === 'expected').spec.tags = ['@smoke'];
    });
    const d = deps();
    await run([p, '--run-target', 'dev'], d);
    assert.match(
      out(d),
      /Smoke: 1 passed · 1 failed · 0 skipped \(of 2, from the report's own tags\)/,
    );
  });
  test('tags recorded but no smoke test is said plainly', async () => {
    const p = variant(E3, (j) => (rowsOf(j)[0].spec.tags = ['regression']));
    const d = deps();
    await run([p, '--run-target', 'dev'], d);
    assert.match(out(d), /Smoke: no smoke tests in this run \(tags are recorded\)/);
  });
  test('hostile error text: mentions, email, token shape and home path are neutralised', async () => {
    const hostile = `boom @channel <!here> <@U123> a.b@x.example.test ${FAKE_TOKEN} C:\\Users\\someone\\repo`;
    const p = variant(E3, (j) => {
      rowsOf(j)
        .find((r) => r.test.status === 'unexpected')
        .test.results.at(-1).errors = [{ message: hostile }];
    });
    const d = deps({ env: { ...creds } });
    await run([p, '--run-target', 'dev'], d);
    const o = out(d);
    assert.doesNotMatch(o, /@channel|<!here>|<@U123>|@x\.example|0000-FAKE|someone/);
    assert.ok(
      o.includes('[redacted]') && o.includes('[email]') && o.includes('[home]'),
      'placeholders',
    );
  });
});

describe('--send: one reviewed request, nothing else', () => {
  test('matching digest: exactly one chat.postMessage with the expected payload', async () => {
    const digest = await previewDigest(E3);
    const d = deps({ env: { ...creds } });
    answer(d, { ok: true, ts: '1.2' });
    assert.equal(
      await run(['--send', E3, '--run-target', 'dev', '--approve-digest', digest], d),
      0,
    );
    assert.equal(d.calls.length, 1);
    const [{ url, init }] = d.calls;
    assert.equal(url, 'https://slack.com/api/chat.postMessage');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, `Bearer ${FAKE_TOKEN}`);
    const body = JSON.parse(init.body);
    assert.equal(body.channel, FAKE_CHANNEL);
    assert.equal(body.parse, 'none');
    assert.equal(body.link_names, false);
    assert.equal(body.unfurl_links, false);
    assert.equal(body.unfurl_media, false);
    assert.ok(body.text.length > 0 && Array.isArray(body.blocks) && body.blocks.length >= 3);
    assert.doesNotMatch(body.text, /<!|<@/);
    assert.match(out(d), /sent: ok · channel \*\*\*\*0001/);
    assert.ok(!out(d).includes(FAKE_TOKEN) && !out(d).includes(FAKE_CHANNEL));
  });
  test('different options change the digest (evidence link)', async () => {
    const a = await previewDigest(E3);
    const b = await previewDigest(E3, ['--evidence-url', 'https://example.test/e']);
    assert.notEqual(a, b);
  });
  test('wrong digest: exit 1, no credentials read, no request', async () => {
    const d = deps({ env: { ...creds } });
    assert.equal(
      await run(['--send', E3, '--run-target', 'dev', '--approve-digest', '000000000000'], d),
      1,
    );
    assert.equal(d.calls.length, 0);
    assert.equal(d.dotEnvReads, 0);
  });
  test('missing or malformed digest, and mode conflicts, are refused', async () => {
    for (const argv of [
      ['--send', E3],
      ['--send', E3, '--approve-digest', 'xyz'],
      ['--send', E3, '--dry-run', '--approve-digest', 'aaaaaaaaaaaa'],
      ['--send', E3, '--check-connection', '--approve-digest', 'aaaaaaaaaaaa'],
      [E3, '--approve-digest', 'aaaaaaaaaaaa'],
      ['--check-connection', E3],
      [],
    ]) {
      const d = deps({ env: { ...creds } });
      assert.equal(await run(argv, d), 1, argv.join(' '));
      assert.equal(d.calls.length, 0);
    }
  });
  test('missing credentials: exit 3, names only, no request', async () => {
    const digest = await previewDigest(E3);
    const d = deps();
    assert.equal(
      await run(['--send', E3, '--run-target', 'dev', '--approve-digest', digest], d),
      3,
    );
    assert.match(out(d), /SLACK_BOT_TOKEN, SLACK_CHANNEL/);
    assert.equal(d.calls.length, 0);
  });
  test('process values win over .env; empty counts as unset; other .env keys are never used', async () => {
    const digest = await previewDigest(E3);
    const d = deps({
      env: { SLACK_BOT_TOKEN: FAKE_TOKEN, SLACK_CHANNEL: '' },
      readDotEnv: () =>
        'JIRA_API_TOKEN=must-not-be-used\nSLACK_BOT_TOKEN=from-file\nSLACK_CHANNEL=CFILE12345\n',
    });
    await run(['--send', E3, '--run-target', 'dev', '--approve-digest', digest], d);
    assert.equal(d.calls.length, 1);
    assert.equal(d.calls[0].init.headers.Authorization, `Bearer ${FAKE_TOKEN}`);
    assert.equal(JSON.parse(d.calls[0].init.body).channel, 'CFILE12345');
    assert.ok(!JSON.stringify(d.calls).includes('must-not-be-used'));
  });
  const failures = [
    ['ok:false', { ok: false, error: 'channel_not_found' }, 200, {}, 4, /channel_not_found/],
    ['HTTP 429', '{}', 429, { 'retry-after': '30' }, 6, /wait 30 s; nothing was retried/],
    ['HTTP 502', 'bad', 502, {}, 5, /may or may not have been posted/],
    ['unreadable answer', '<html>', 200, {}, 5, /may or may not/],
  ];
  for (const [name, body, status, headers, code, re] of failures) {
    test(`${name}: exit ${code} after exactly one request, no retry`, async () => {
      const digest = await previewDigest(E3);
      const d = deps({ env: { ...creds } });
      answer(d, body, status, headers);
      assert.equal(
        await run(['--send', E3, '--run-target', 'dev', '--approve-digest', digest], d),
        code,
      );
      assert.equal(d.calls.length, 1);
      assert.match(out(d), re);
      assert.ok(!out(d).includes(FAKE_TOKEN));
    });
  }
  test('network error: exit 5 after exactly one attempt', async () => {
    const digest = await previewDigest(E3);
    const d = deps({ env: { ...creds } });
    let n = 0;
    d.fetch = async () => {
      n += 1;
      throw new Error('down');
    };
    assert.equal(
      await run(['--send', E3, '--run-target', 'dev', '--approve-digest', digest], d),
      5,
    );
    assert.equal(n, 1);
    assert.match(out(d), /may or may not have been posted/);
  });
});

describe('--check-connection: auth.test only', () => {
  test('success: one auth.test, names printed, no message and no channel', async () => {
    const d = deps({ env: { SLACK_BOT_TOKEN: FAKE_TOKEN } });
    assert.equal(await run(['--check-connection'], d), 0);
    assert.equal(d.calls.length, 1);
    assert.equal(d.calls[0].url, 'https://slack.com/api/auth.test');
    assert.equal(d.calls[0].init.body, '{}');
    assert.match(
      out(d),
      /connection: ok · workspace Fake Team \(T0FAKE\) · bot fake-bot \(B0FAKE\)/,
    );
    assert.ok(!out(d).includes(FAKE_TOKEN));
  });
  test('authenticated without bot_id: blocker, exit 4, not called verified', async () => {
    const d = deps({ env: { SLACK_BOT_TOKEN: FAKE_TOKEN } });
    answer(d, { ok: true, team: 'Fake Team', team_id: 'T0FAKE', user: 'a-person' });
    assert.equal(await run(['--check-connection'], d), 4);
    assert.equal(d.calls.length, 1);
    assert.match(out(d), /BLOCKER: the token authenticates but is not a bot token/);
    assert.doesNotMatch(out(d), /connection: ok/);
    assert.match(out(d), /exit 4 check not_a_bot_token$/);
  });
  test('odd ids are hidden, not printed', async () => {
    const d = deps({ env: { SLACK_BOT_TOKEN: FAKE_TOKEN } });
    answer(d, {
      ok: true,
      team: 'Fake Team',
      team_id: 'bad id <!here>',
      user: 'fake-bot',
      bot_id: 'also bad',
    });
    assert.equal(await run(['--check-connection'], d), 0);
    assert.match(out(d), /\(unknown\) · bot fake-bot \(unknown\)/);
  });
  test('ok:false, then missing token', async () => {
    let d = deps({ env: { SLACK_BOT_TOKEN: FAKE_TOKEN } });
    answer(d, { ok: false, error: 'invalid_auth' });
    assert.equal(await run(['--check-connection'], d), 4);
    assert.match(out(d), /invalid_auth/);
    d = deps();
    assert.equal(await run(['--check-connection'], d), 3);
    assert.equal(d.calls.length, 0);
  });
});

describe('--evidence-url', () => {
  test('https link is shown; http and embedded credentials are refused', async () => {
    let d = deps();
    await run([E3, '--run-target', 'dev', '--evidence-url', 'https://example.test/evidence/e3'], d);
    assert.match(out(d), /Evidence: https:\/\/example\.test\/evidence\/e3/);
    for (const url of ['http://example.test/x', 'https://user:pw@example.test/x', 'not a url']) {
      d = deps();
      assert.equal(await run([E3, '--evidence-url', url], d), 1, url);
    }
  });
});

describe('the script itself', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  test('names only the Slack API address and no literal token prefix', () => {
    const urls = src.match(/https?:\/\/[^\s'"`)]+/g) ?? [];
    assert.deepEqual([...new Set(urls)], ['https://slack.com/api/']);
    assert.doesNotMatch(src, TOKEN_PREFIXES);
  });
  test('command line: preview works with a minimal environment; a bad call is a usage error', () => {
    const env = {};
    for (const k of ['SystemRoot', 'PATH'])
      if (process.env[k] !== undefined) env[k] = process.env[k];
    let r = spawnSync(process.execPath, [SCRIPT, E3, '--run-target', 'dev'], {
      cwd: ROOT,
      env,
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout.trim().split('\n').at(-1), /^slack-report: exit 0 preview FAIL$/);
    r = spawnSync(process.execPath, [SCRIPT], { cwd: ROOT, env, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stdout.trim().split('\n').at(-1), /^slack-report: exit 1 preview usage$/);
  });
});

after(() => {
  for (const d of temps) assert.equal(existsSync(d), false, 'temp folder left behind');
});
