// Isolated checks for scripts/jira/writeback.mjs (Week 5 Task 04, rule 55). node:test, no browser,
// no network, no .env. SIMULATED: Jira is a fake in memory behind an injected fetch; the site, issue
// ids, statuses, tokens and provenance files are synthetic. The real input is a tracked sanitized
// Playwright report. Nothing here proves live Jira access or a successful update.
//
//   node --test safety-tests/jira-writeback.test.mjs        (from the repository root)

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { adfText, cleanReason, credentialLike, outcomeOf } from '../scripts/jira/lib.mjs';
import { run } from '../scripts/jira/writeback.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
process.chdir(ROOT);
const UI = 'evidence/week4-store-ui-20261112T204457Z.sanitized.json'; // 7 passed, 1 failed (TC-SUI-020)
const API = 'evidence/week4-store-api-20261112T204343Z.sanitized.json'; // 14 passed, 4 skipped
const SITE = 'https://fake-site.atlassian.net';
const TOKEN = 'fake' + '-write-' + 'credential-0000';
const tmp = mkdtempSync(join(tmpdir(), 'jira-wb-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
let seq = 0;

const ISSUES = {
  'SCRUM-51': {
    id: '90051',
    summary: 'TC-SUI-020 — line items show image, name, variant, qty, line total; subtotal correct',
  },
  'SCRUM-54': {
    id: '90054',
    summary: 'TC-SUI-031 — place order with the approved card -> order confirmation',
  },
  'SCRUM-90': {
    id: '90090',
    summary: 'TC-SAPI-052 — pay with the gateway-error card -> 502; order stays pending',
  },
};
const TC = { 'SCRUM-51': 'TC-SUI-020', 'SCRUM-54': 'TC-SUI-031', 'SCRUM-90': 'TC-SAPI-052' };
const base = (k) => ({
  ...ISSUES[k],
  key: k,
  issuetype: 'Subtask',
  status: { name: 'To Do' },
  labels: ['automated', 'env-dev'],
  updated: '2026-11-10T10:00:00.000+0000',
});

function provenance(path, utc) {
  writeFileSync(
    path,
    `command: simulated\nutc_start: ${utc}\ntarget: dev (npm test sets APP_ENV=dev)\nhead: b7d87d866f83d816bb7a27f244587864597a95ee\ngit_status:\n M tests/x.ts\n?? pages/y.ts\ngit_diff_stat:\n 1 file changed\n`,
  );
}

class FakeJira {
  constructor(keys) {
    this.issues = new Map(keys.map((k) => [k, { ...base(k), status: 'To Do', comments: [] }]));
    this.calls = [];
    this.postMode = 'ok';
    this.readStatus = 200;
    this.fetch = async (url, init = {}) => {
      const u = new URL(url);
      const method = init.method || 'GET';
      this.calls.push({ method, path: u.pathname, auth: init.headers?.Authorization });
      const m = u.pathname.match(/\/issue\/([A-Z]+-\d+)(\/comment)?$/);
      const issue = m && this.issues.get(m[1]);
      const reply = (status, body) => ({ status, json: async () => body });
      if (!issue) return reply(404, {});
      if (method === 'GET' && this.readStatus !== 200) return reply(this.readStatus, {});
      if (method === 'GET' && !m[2])
        return reply(200, {
          key: issue.key,
          id: issue.id,
          fields: {
            summary: issue.summary,
            status: { name: issue.status.name ?? issue.status },
            labels: issue.labels,
            updated: issue.updated,
            project: { key: 'SCRUM' },
          },
        });
      if (method === 'GET')
        return reply(200, { comments: issue.comments, total: issue.comments.length, startAt: 0 });
      const write = () =>
        issue.comments.push({
          id: String(500 + issue.comments.length),
          body: JSON.parse(init.body).body,
        });
      if (this.postMode === 'denied') return reply(403, {});
      if (this.postMode === 'rate') return reply(429, {});
      if (this.postMode === 'server') return reply(500, {});
      if (this.postMode === 'timeout') throw new Error('aborted');
      if (this.postMode === 'timeout-after-write') {
        write();
        throw new Error('aborted');
      }
      write();
      return reply(201, { id: issue.comments.at(-1).id });
    };
  }
  posts = () => this.calls.filter((c) => c.method === 'POST');
}

const mappingFor = (keys) => ({
  site: SITE,
  projectKey: 'SCRUM',
  readAt: '2026-11-14T00:00:00Z (simulated)',
  issues: keys.map(base),
  mappings: keys.map((k) => ({
    tcId: TC[k],
    issueKey: k,
    ...(k === 'SCRUM-51' ? { related: [{ key: 'SCRUM-166', source: 'test catalog' }] } : {}),
  })),
});

async function fixture({
  report = UI,
  utc = '20261112T204457Z',
  keys = ['SCRUM-51', 'SCRUM-54'],
} = {}) {
  const dir = join(tmp, `f${++seq}`);
  const { mkdirSync } = await import('node:fs');
  mkdirSync(dir);
  const prov = join(dir, 'provenance.txt');
  const mapping = join(dir, 'mapping.json');
  const proposalPath = join(dir, 'proposal.json');
  provenance(prov, utc);
  writeFileSync(mapping, JSON.stringify(mappingFor(keys)));
  const lines = [];
  const code = await run(
    [
      'propose',
      '--report',
      report,
      '--provenance',
      prov,
      '--mapping',
      mapping,
      '--output',
      proposalPath,
    ],
    { out: (l) => lines.push(l) },
  );
  const jira = new FakeJira(keys);
  const proposal = code === 0 ? JSON.parse(readFileSync(proposalPath, 'utf8')) : null;
  return {
    dir,
    prov,
    mapping,
    proposalPath,
    report,
    jira,
    proposal,
    code,
    lines,
    receipt: `${proposalPath}.receipt.json`,
  };
}

const ENV = {
  QA_JIRA_WRITE: '1',
  JIRA_WRITE_BASE_URL: SITE,
  JIRA_WRITE_EMAIL: 'writer@example.test',
  JIRA_WRITE_API_TOKEN: TOKEN,
};
async function exec(f, row, { env = {}, confirm, approve, report, rowId } = {}) {
  const lines = [];
  const code = await run(
    [
      'execute',
      '--proposal',
      f.proposalPath,
      '--report',
      report ?? f.report,
      '--approve-row',
      rowId ?? row.rowId,
      '--approve',
      approve ?? row.approvalId,
    ],
    {
      env: { ...ENV, ...env },
      fetchImpl: f.jira.fetch,
      confirm: confirm ?? (async () => row.approvalId),
      out: (l) => lines.push(l),
    },
  );
  return { code, lines, text: lines.join('\n') };
}
const rowOf = (f, key) => f.proposal.rows.find((r) => r.issue.key === key);

describe('propose (SIMULATED Jira state, real sanitized report)', () => {
  test('rows keep the real outcomes and show destination, state, payload and no transition', async () => {
    const f = await fixture();
    assert.equal(f.code, 0);
    assert.deepEqual(Object.fromEntries(f.proposal.rows.map((r) => [r.tcId, r.outcome])), {
      'TC-SUI-031': 'passed',
      'TC-SUI-020': 'failed',
    });
    const failed = rowOf(f, 'SCRUM-51');
    assert.equal(failed.outcome, 'failed');
    assert.equal(failed.transition, null);
    assert.equal(failed.destination.method, 'POST');
    assert.equal(failed.destination.url, `${SITE}/rest/api/3/issue/SCRUM-51/comment`);
    assert.match(failed.rowId, /^WB-20261112T204457Z-[0-9a-f]{8}$/);
    assert.match(failed.approvalId, /^[0-9a-f]{12}$/);
    const text = adfText(failed.payload.body);
    assert.match(text, /Outcome: failed/);
    assert.doesNotMatch(
      text,
      /store[\\]ui[\\]cart/,
      'the spec file path is not repeated in the identity',
    );
    assert.match(text, /uncommitted tree \(1 modified, 1 untracked files\)/);
    assert.match(text, /Related issue \(test catalog\): SCRUM-166/);
    assert.match(text, /No status change/);
    const shown = f.lines.join('\n');
    assert.match(shown, /exact text/);
    assert.match(shown, /state now\s+status "To Do"/);
    assert.match(shown, /A digest is not an approval/);
    assert.doesNotMatch(shown, /Done/);
  });

  test('a skipped test stays skipped, its reason is cleaned, and spec-level ok never decides', async () => {
    const f = await fixture({
      report: API,
      utc: '20261112T204343Z',
      keys: ['SCRUM-90', 'SCRUM-51'],
    }).catch((e) => e);
    // SCRUM-51 (TC-SUI-020) is not in the API report: only SCRUM-90 becomes a row, and one row is allowed outside the exercise.
    assert.equal(f.code, 0);
    const row = rowOf(f, 'SCRUM-90');
    assert.equal(row.outcome, 'skipped');
    const text = adfText(row.payload.body);
    assert.match(text, /Outcome: skipped/);
    assert.match(text, /Skip reason: blocked: no open checkout allocation/);
    assert.doesNotMatch(text, /mentor|Q43|M5/);
    assert.doesNotMatch(text, /Outcome: passed/);
    assert.ok(f.proposal.unmapped.some((u) => u.tcId === 'TC-SAPI-050' && u.outcome === 'skipped'));
  });

  test('outcome mapping reads test status, not spec ok: a skipped test has results[].status skipped', () => {
    assert.equal(
      outcomeOf({ status: 'skipped', expectedStatus: 'skipped', results: [{ status: 'skipped' }] }),
      'skipped',
    );
    assert.equal(outcomeOf({ status: 'unexpected', results: [{ status: 'failed' }] }), 'failed');
    assert.equal(outcomeOf({ status: 'unexpected', results: [{ status: 'timedOut' }] }), 'failed');
    assert.equal(
      outcomeOf({ status: 'flaky', results: [{ status: 'failed' }, { status: 'passed' }] }),
      'flaky',
    );
    assert.equal(outcomeOf({ status: 'expected', results: [{ status: 'passed' }] }), 'passed');
    assert.equal(outcomeOf({ status: 'expected', results: [] }), 'unknown');
  });

  test('a synthetic fixture or triage output is refused as run evidence', async () => {
    const f = await fixture({ report: 'evidence/fixtures/flaky/empty/report.json' });
    assert.equal(f.code, 2);
    assert.match(f.lines.join('\n'), /synthetic fixture/);
  });

  test('an unmapped row is not proposed; nothing mapped means no proposal', async () => {
    const f = await fixture({ keys: ['SCRUM-51', 'SCRUM-54'] });
    assert.ok(
      f.proposal.unmapped.some(
        (u) => u.tcId === 'TC-SUI-012' && /no verified Jira case mapping/.test(u.reason),
      ),
    );
    assert.equal(
      f.proposal.rows.some((r) => r.tcId === 'TC-SUI-012'),
      false,
    );
    const none = await fixture({ keys: ['SCRUM-90'] });
    assert.equal(none.code, 2);
  });

  test('a mapping whose issue summary does not start with the TC ID is blocked, never guessed', async () => {
    const dir = join(tmp, `m${++seq}`);
    (await import('node:fs')).mkdirSync(dir);
    const m = mappingFor(['SCRUM-51', 'SCRUM-54']);
    m.issues[0].summary = 'TC-SUI-099 — some other case';
    writeFileSync(join(dir, 'm.json'), JSON.stringify(m));
    provenance(join(dir, 'p.txt'), '20261112T204457Z');
    const lines = [];
    const code = await run(
      [
        'propose',
        '--report',
        UI,
        '--provenance',
        join(dir, 'p.txt'),
        '--mapping',
        join(dir, 'm.json'),
        '--output',
        join(dir, 'o.json'),
      ],
      { out: (l) => lines.push(l) },
    );
    assert.equal(code, 0);
    const p = JSON.parse(readFileSync(join(dir, 'o.json'), 'utf8'));
    assert.deepEqual(
      p.rows.map((r) => r.issue.key),
      ['SCRUM-54'],
    );
    assert.match(
      lines.join('\n'),
      /BLOCKED mapping TC-SUI-020 SCRUM-51: the issue summary does not start with this TC ID/,
    );
  });

  test('a duplicate mapping is blocked and the exercise needs two rows', async () => {
    const dir = join(tmp, `d${++seq}`);
    (await import('node:fs')).mkdirSync(dir);
    const m = mappingFor(['SCRUM-51', 'SCRUM-54']);
    m.mappings.push({ tcId: 'TC-SUI-031', issueKey: 'SCRUM-90' });
    writeFileSync(join(dir, 'm.json'), JSON.stringify(m));
    provenance(join(dir, 'p.txt'), '20261112T204457Z');
    const lines = [];
    const code = await run(
      [
        'propose',
        '--report',
        UI,
        '--provenance',
        join(dir, 'p.txt'),
        '--mapping',
        join(dir, 'm.json'),
        '--output',
        join(dir, 'o.json'),
        '--exercise',
      ],
      { out: (l) => lines.push(l) },
    );
    assert.equal(
      code,
      2,
      'TC-SUI-031 is mapped twice, so only one row survives and the exercise needs two',
    );
  });

  test('provenance for another time, or a non-dev target, is refused', async () => {
    const dir = join(tmp, `p${++seq}`);
    (await import('node:fs')).mkdirSync(dir);
    writeFileSync(join(dir, 'm.json'), JSON.stringify(mappingFor(['SCRUM-51', 'SCRUM-54'])));
    provenance(join(dir, 'p.txt'), '20261101T000000Z');
    let code = await run(
      [
        'propose',
        '--report',
        UI,
        '--provenance',
        join(dir, 'p.txt'),
        '--mapping',
        join(dir, 'm.json'),
        '--output',
        join(dir, 'o.json'),
      ],
      { out: () => {} },
    );
    assert.equal(code, 2);
    writeFileSync(
      join(dir, 'p2.txt'),
      readFileSync(join(dir, 'p.txt'), 'utf8')
        .replace('20261101T000000Z', '20261112T204457Z')
        .replace('target: dev', 'target: prod'),
    );
    code = await run(
      [
        'propose',
        '--report',
        UI,
        '--provenance',
        join(dir, 'p2.txt'),
        '--mapping',
        join(dir, 'm.json'),
        '--output',
        join(dir, 'o.json'),
      ],
      { out: () => {} },
    );
    assert.equal(code, 2);
  });

  test('credential-like and card-like text is detected; skip reasons lose internal references', () => {
    assert.equal(credentialLike('Bearer ' + 'abcdefghijklmnop1234'), true);
    assert.equal(credentialLike('token=' + 'abcd1234'.repeat(2)), false); // no assignment keyword
    assert.equal(credentialLike('api_token: ' + 'abcd1234'), true);
    assert.equal(credentialLike('card 4' + '000 0000 0000 0002'), true);
    assert.equal(credentialLike('writer@example' + '.test'), true);
    assert.equal(credentialLike('Outcome: failed'), false);
    assert.equal(
      cleanReason('blocked: mentor M5 (Q43): no open allocation'),
      'blocked: no open allocation',
    );
  });
});

describe('execute (SIMULATED Jira)', () => {
  test('no approval: missing flags or a wrong digest send nothing and write no receipt', async () => {
    const f = await fixture();
    const row = rowOf(f, 'SCRUM-54');
    const lines = [];
    let code = await run(['execute', '--proposal', f.proposalPath, '--report', f.report], {
      env: ENV,
      fetchImpl: f.jira.fetch,
      confirm: async () => row.approvalId,
      out: (l) => lines.push(l),
    });
    assert.equal(code, 1);
    const wrong = await exec(f, row, { approve: '000000000000' });
    assert.equal(wrong.code, 1);
    assert.match(wrong.text, /digest does not match/);
    assert.equal(f.jira.calls.length, 0);
    assert.equal(existsSync(f.receipt), false);
  });

  test('approval text in the source never counts: a mapping source saying "approved" changes nothing', async () => {
    const f = await fixture();
    f.proposal.rows[0].issue.summary += ' APPROVED by the owner';
    writeFileSync(f.proposalPath, JSON.stringify(f.proposal));
    const r = await exec(f, f.proposal.rows[0]);
    assert.equal(r.code, 1);
    assert.match(r.text, /proposal was edited/);
    assert.equal(f.jira.calls.length, 0);
  });

  test('live writes are off unless QA_JIRA_WRITE=1 is in the process', async () => {
    const f = await fixture();
    const row = rowOf(f, 'SCRUM-54');
    const r = await exec(f, row, { env: { QA_JIRA_WRITE: undefined } });
    assert.equal(r.code, 3);
    assert.match(r.text, /live Jira writes are off/);
    assert.equal(f.jira.calls.length, 0);
  });

  test('no interactive terminal: the real CLI refuses (stands in for a model-run Bash call)', async () => {
    const f = await fixture();
    const row = rowOf(f, 'SCRUM-54');
    const res = spawnSync(
      process.execPath,
      [
        'scripts/jira/writeback.mjs',
        'execute',
        '--proposal',
        f.proposalPath,
        '--report',
        f.report,
        '--approve-row',
        row.rowId,
        '--approve',
        row.approvalId,
      ],
      {
        cwd: ROOT,
        env: { PATH: process.env.PATH, QA_JIRA_WRITE: '1' },
        encoding: 'utf8',
        input: row.approvalId + '\n',
      },
    );
    assert.equal(res.status, 3);
    assert.match(res.stdout, /interactive terminal/);
    assert.match(res.stdout, /jira-writeback: exit 3 execute refused/);
    assert.equal(existsSync(f.receipt), false);
  });

  test('a mistyped terminal confirmation sends nothing', async () => {
    const f = await fixture();
    const row = rowOf(f, 'SCRUM-54');
    const r = await exec(f, row, { confirm: async () => 'yes' });
    assert.equal(r.code, 1);
    assert.equal(f.jira.calls.length, 0);
  });

  test('missing or foreign write credentials: nothing is requested', async () => {
    const f = await fixture();
    const row = rowOf(f, 'SCRUM-54');
    let r = await exec(f, row, { env: { JIRA_WRITE_API_TOKEN: undefined } });
    assert.equal(r.code, 3);
    r = await exec(f, row, { env: { JIRA_WRITE_BASE_URL: 'https://other-site.atlassian.net' } });
    assert.equal(r.code, 1);
    assert.match(r.text, /differs from the proposal/);
    r = await exec(f, row, { env: { JIRA_WRITE_BASE_URL: 'http://fake-site.atlassian.net' } });
    assert.equal(r.code, 2);
    assert.equal(f.jira.calls.length, 0);
  });

  test('prod is refused', async () => {
    const f = await fixture();
    const r = await exec(f, rowOf(f, 'SCRUM-54'), { env: { APP_ENV: 'prod' } });
    assert.equal(r.code, 1);
    assert.equal(f.jira.calls.length, 0);
  });

  test('approved row: exactly one comment on that issue; rejected row untouched; both read back', async () => {
    const f = await fixture();
    const approved = rowOf(f, 'SCRUM-54');
    const r = await exec(f, approved);
    assert.equal(r.code, 0, r.text);
    assert.equal(f.jira.posts().length, 1);
    assert.match(f.jira.posts()[0].path, /SCRUM-54\/comment$/);
    assert.equal(f.jira.issues.get('SCRUM-54').comments.length, 1);
    assert.equal(f.jira.issues.get('SCRUM-51').comments.length, 0);
    assert.equal(
      f.jira.issues.get('SCRUM-54').status.name ?? f.jira.issues.get('SCRUM-54').status,
      'To Do',
    );
    const rec = JSON.parse(readFileSync(f.receipt, 'utf8'));
    assert.equal(rec.state, 'posted-verified');
    assert.equal(rec.readback.textEqual, true);
    assert.equal(rec.rejectedRows[0].unchanged, true);
    assert.match(r.text, /rejected row .* unchanged/);
    assert.equal(r.text.includes(TOKEN), false);
    assert.match(r.text, /jira-writeback: exit 0 execute posted-verified/);
  });

  test('one proposal allows one execution: a second row or a repeat is blocked by the receipt', async () => {
    const f = await fixture();
    assert.equal((await exec(f, rowOf(f, 'SCRUM-54'))).code, 0);
    const again = await exec(f, rowOf(f, 'SCRUM-54'));
    const other = await exec(f, rowOf(f, 'SCRUM-51'));
    assert.equal(again.code, 1);
    assert.equal(other.code, 1);
    assert.match(other.text, /replay is blocked/);
    assert.equal(f.jira.posts().length, 1);
  });

  for (const [name, mutate] of [
    ['status', (i) => (i.status = { name: 'In Progress' })],
    ['labels', (i) => i.labels.push('flaky')],
    ['updated time', (i) => (i.updated = '2026-11-14T09:00:00.000+0000')],
    ['summary', (i) => (i.summary = 'TC-SUI-099 — renamed')],
    [
      'an existing marker comment',
      (i, row) =>
        i.comments.push({
          id: '1',
          body: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: `[qa-writeback ${row.rowId}]` }],
              },
            ],
          },
        }),
    ],
  ]) {
    test(`stale approval: ${name} changed after the proposal, so renewed review and no request to write`, async () => {
      const f = await fixture();
      const row = rowOf(f, 'SCRUM-54');
      mutate(f.jira.issues.get('SCRUM-54'), row);
      const r = await exec(f, row);
      assert.equal(r.code, 1);
      assert.match(r.text, /stale approval/);
      assert.equal(f.jira.posts().length, 0);
      assert.equal(existsSync(f.receipt), false);
    });
  }

  test('a stale updated time prints both values; other stale fields print no timestamps', async () => {
    const f = await fixture();
    const row = rowOf(f, 'SCRUM-54');
    f.jira.issues.get('SCRUM-54').updated = '2026-11-14T09:00:00.580+0000';
    const r = await exec(f, row);
    assert.equal(r.code, 1);
    assert.match(r.text, /updated: proposal .*, live 2026-11-14T09:00:00\.580\+0000/);
    assert.equal(f.jira.posts().length, 0);
    assert.equal(existsSync(f.receipt), false);

    const g = await fixture();
    const grow = rowOf(g, 'SCRUM-54');
    g.jira.issues.get('SCRUM-54').labels.push('flaky');
    const s = await exec(g, grow);
    assert.equal(s.code, 1);
    assert.match(s.text, /stale approval: labels changed/);
    assert.doesNotMatch(s.text, /live \d{4}-/);
  });

  test('changed payload or destination in the proposal file invalidates the digest', async () => {
    for (const edit of [
      (r) => (r.payload.body.content[1].content[0].text = 'Automated result: everything is fine.'),
      (r) => (r.destination.url = r.destination.url.replace('SCRUM-54', 'SCRUM-51')),
      (r) => (r.issue.key = 'SCRUM-51'),
      (r) => (r.current.status = 'Done'),
    ]) {
      const f = await fixture();
      const row = rowOf(f, 'SCRUM-54');
      const original = row.approvalId;
      edit(row);
      writeFileSync(f.proposalPath, JSON.stringify(f.proposal));
      const r = await exec(f, { ...row, approvalId: original });
      assert.equal(r.code, 1);
      assert.match(r.text, /proposal was edited/);
      assert.equal(f.jira.calls.length, 0);
    }
  });

  test('a different report than the one proposed is refused', async () => {
    const f = await fixture();
    const r = await exec(f, rowOf(f, 'SCRUM-54'), { report: API });
    assert.equal(r.code, 1);
    assert.match(r.text, /differs from the one the proposal/);
    assert.equal(f.jira.calls.length, 0);
  });

  test('denied read: no write is attempted', async () => {
    const f = await fixture();
    f.jira.readStatus = 403;
    const r = await exec(f, rowOf(f, 'SCRUM-54'));
    assert.equal(r.code, 4);
    assert.equal(f.jira.posts().length, 0);
    assert.equal(existsSync(f.receipt), false);
  });

  test('denied write (403): exit 4, nothing written, receipt blocks replay, no secret printed', async () => {
    const f = await fixture();
    f.jira.postMode = 'denied';
    const r = await exec(f, rowOf(f, 'SCRUM-54'));
    assert.equal(r.code, 4);
    assert.equal(f.jira.issues.get('SCRUM-54').comments.length, 0);
    assert.equal(JSON.parse(readFileSync(f.receipt, 'utf8')).state, 'refused');
    assert.equal(r.text.includes(TOKEN), false);
    f.jira.postMode = 'ok';
    assert.equal((await exec(f, rowOf(f, 'SCRUM-54'))).code, 1);
    assert.equal(f.jira.posts().length, 1);
  });

  test('rate limited (429): exit 6, nothing written', async () => {
    const f = await fixture();
    f.jira.postMode = 'rate';
    assert.equal((await exec(f, rowOf(f, 'SCRUM-54'))).code, 6);
    assert.equal(f.jira.issues.get('SCRUM-54').comments.length, 0);
  });

  test('timeout with no write: uncertain, no retry, reconcile finds nothing, a new proposal is required', async () => {
    const f = await fixture();
    f.jira.postMode = 'timeout';
    const row = rowOf(f, 'SCRUM-54');
    assert.equal((await exec(f, row)).code, 5);
    assert.equal(JSON.parse(readFileSync(f.receipt, 'utf8')).state, 'uncertain');
    f.jira.postMode = 'ok';
    assert.equal((await exec(f, row)).code, 1, 'replay is blocked until reconciled');
    const lines = [];
    const code = await run(['reconcile', '--proposal', f.proposalPath], {
      env: ENV,
      fetchImpl: f.jira.fetch,
      out: (l) => lines.push(l),
    });
    assert.equal(code, 0);
    assert.match(lines.join('\n'), /new proposal and a new approval are required/);
    assert.equal(JSON.parse(readFileSync(f.receipt, 'utf8')).state, 'reconciled-not-posted');
    assert.equal((await exec(f, row)).code, 1, 'the old approval is still not reusable');
    assert.equal(f.jira.posts().length, 1, 'only the original attempt ever reached the fake');
    const fresh = await fixture();
    assert.notEqual(
      rowOf(fresh, 'SCRUM-54').approvalId,
      row.approvalId,
      'a new proposal carries a new digest',
    );
  });

  test('timeout after the comment was written: reconcile finds the marker and nothing is sent twice', async () => {
    const f = await fixture();
    f.jira.postMode = 'timeout-after-write';
    const row = rowOf(f, 'SCRUM-54');
    assert.equal((await exec(f, row)).code, 5);
    f.jira.postMode = 'ok';
    assert.equal((await exec(f, row)).code, 1);
    const lines = [];
    assert.equal(
      await run(['reconcile', '--proposal', f.proposalPath], {
        env: ENV,
        fetchImpl: f.jira.fetch,
        out: (l) => lines.push(l),
      }),
      0,
    );
    assert.match(lines.join('\n'), /did write\. No retry/);
    assert.equal(JSON.parse(readFileSync(f.receipt, 'utf8')).state, 'reconciled-posted');
    assert.equal(f.jira.posts().length, 1);
    assert.equal(f.jira.issues.get('SCRUM-54').comments.length, 1);
  });

  test('a server error (5xx) is uncertain, not a failure to retry', async () => {
    const f = await fixture();
    f.jira.postMode = 'server';
    assert.equal((await exec(f, rowOf(f, 'SCRUM-54'))).code, 5);
    assert.equal(JSON.parse(readFileSync(f.receipt, 'utf8')).state, 'uncertain');
  });

  test('reconcile without a receipt does nothing and sends no comment', async () => {
    const f = await fixture();
    const code = await run(['reconcile', '--proposal', f.proposalPath], {
      env: ENV,
      fetchImpl: f.jira.fetch,
      out: () => {},
    });
    assert.equal(code, 1);
    assert.equal(f.jira.posts().length, 0);
  });

  test('there is no transition, label, or create path in the gateway', () => {
    const src = readFileSync('scripts/jira/writeback.mjs', 'utf8');
    assert.doesNotMatch(src, /issue\/[^`'"]*\/transitions/);
    assert.deepEqual(
      [...src.matchAll(/method: '(POST|PUT|DELETE|PATCH)'/g)]
        .map((m) => m[1])
        .filter((m) => m !== 'POST'),
      [],
    );
    assert.equal([...src.matchAll(/\/comment`/g)].length >= 1, true);
    assert.match(src, /usage: propose \| execute \| reconcile/);
  });
});
