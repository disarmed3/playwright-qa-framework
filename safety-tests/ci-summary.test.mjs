// Isolated checks for scripts/ci-summary.mjs (Week 5 Task 04). node:test, no browser, no network, no
// real credential, no application test. Every report, folder and fake login value is built in memory
// or in a temp folder that is removed. `report` runs the reviewed scripts/slack-report.ts in preview
// mode (no .env read, no Slack call) on synthetic native reports. Not part of `npm run test:safety`
// (package.json is CRITICAL); the CI workflow and `node --test safety-tests/ci-summary.test.mjs` run it.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { PROOF_REASON, checkProof, main, readZipEntries } from '../scripts/ci-summary.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/ci-summary.mjs', import.meta.url));
const SHA = 'a'.repeat(40);
const RUN_ID = '20261114T100000Z-abc123';
const RUN_URL = 'https://github.com/example/repo/actions/runs/1';
const FAKE_PASSWORD = 'Fake-Pass-For-Tests-1';

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});
function temp() {
  const dir = mkdtempSync(join(tmpdir(), 'ci-summary-'));
  temps.push(dir);
  return dir;
}

/** A native Playwright JSON report. tests: [{ status, tags, reason, error }] (expected|unexpected|skipped). */
function nativeReport(tests, errors = []) {
  const count = (status) => tests.filter((t) => t.status === status).length;
  return {
    config: { version: '1.61.1', rootDir: '/x/tests', metadata: { actualWorkers: 1 } },
    suites: [
      {
        title: 'a.spec.ts',
        file: 'a.spec.ts',
        specs: tests.map((t, i) => ({
          title: `case ${i}`,
          file: 'a.spec.ts',
          line: i + 1,
          column: 1,
          tags: t.tags ?? [],
          tests: [
            {
              projectName: 'chromium',
              status: t.status,
              annotations: t.reason ? [{ type: 'skip', description: t.reason }] : [],
              results: [
                {
                  status:
                    t.status === 'skipped'
                      ? 'skipped'
                      : t.status === 'expected'
                        ? 'passed'
                        : 'failed',
                  retry: 0,
                  duration: 50,
                  errors: t.error ? [{ message: t.error }] : [],
                },
              ],
            },
          ],
        })),
        suites: [],
      },
    ],
    errors,
    stats: {
      startTime: '2026-11-14T10:00:00.000Z',
      duration: 1234,
      expected: count('expected'),
      skipped: count('skipped'),
      unexpected: count('unexpected'),
      flaky: 0,
    },
  };
}

async function runReport(content, { role = 'smoke', exit = '0', raw } = {}) {
  const dir = temp();
  const file = join(dir, 'report.json');
  if (content !== undefined) writeFileSync(file, raw ?? JSON.stringify(content));
  const out = join(dir, 'summary.md');
  const result = await main([
    'report',
    '--report',
    file,
    '--role',
    role,
    '--run-url',
    RUN_URL,
    '--sha',
    SHA,
    '--run-id',
    RUN_ID,
    '--playwright-exit',
    exit,
    '--html-dir',
    join(dir, 'html'),
    '--traces',
    join(dir, 'test-results'),
    '--out',
    out,
  ]);
  return { ...result, text: existsSync(out) ? readFileSync(out, 'utf8') : '', dir };
}

const SMOKE = [
  { status: 'expected', tags: ['smoke'] },
  { status: 'expected', tags: ['@smoke', 'regression'] },
];

describe('report: status rules', () => {
  test('every smoke test passes: PASS, exit 0, with revision, run link, run id and exit code', async () => {
    const result = await runReport(nativeReport(SMOKE));
    assert.equal(result.code, 0);
    assert.match(result.text, /## CI dev tests: PASS/);
    assert.match(result.text, /Revision aaaaaaa/);
    assert.ok(result.text.includes(RUN_URL));
    assert.ok(result.text.includes(RUN_ID));
    assert.match(result.text, /Playwright exit code: 0/);
    assert.match(result.text, /Pass 2 · Fail 0 · Flaky 0 · Skip 0/);
    assert.match(
      result.text,
      /Paste if the automatic PR comment is unavailable: `CI run aaaaaaa: PASS — /,
    );
    assert.doesNotMatch(result.text, /digest|input sha256|Slack: not contacted/);
  });

  test('a failing test: FAIL, exit 1, the failure is listed', async () => {
    const result = await runReport(
      nativeReport([
        ...SMOKE,
        { status: 'unexpected', tags: ['smoke'], error: 'expected visible' },
      ]),
      { exit: '1' },
    );
    assert.equal(result.code, 1);
    assert.match(result.text, /## CI dev tests: FAIL/);
    assert.match(result.text, /Failures \(1 of 1\)/);
    assert.match(result.text, /expected visible/);
  });

  test('every test skipped: INCOMPLETE, exit 2, never a pass (Playwright itself exits 0 here)', async () => {
    const result = await runReport(
      nativeReport([{ status: 'skipped', tags: ['smoke'], reason: 'r' }]),
    );
    assert.equal(result.code, 2);
    assert.match(result.text, /INCOMPLETE/);
    assert.match(result.text, /not a pass/);
    assert.doesNotMatch(result.text, /: PASS/);
  });

  test('a report with zero tests: INCOMPLETE, exit 2', async () => {
    const result = await runReport(nativeReport([]));
    assert.equal(result.code, 2);
    assert.match(result.text, /INCOMPLETE/);
  });

  test('smoke role, tests executed but none tagged smoke: INCOMPLETE', async () => {
    const result = await runReport(nativeReport([{ status: 'expected', tags: ['regression'] }]));
    assert.equal(result.code, 2);
    assert.match(result.text, /no smoke test was executed/);
  });

  test('smoke role, report without tag data: INCOMPLETE; regression role needs no smoke test', async () => {
    assert.equal((await runReport(nativeReport([{ status: 'expected' }]))).code, 2);
    const regression = await runReport(
      nativeReport([{ status: 'expected', tags: ['regression'] }]),
      {
        role: 'regression',
      },
    );
    assert.equal(regression.code, 0);
  });

  test('a missing report: ERROR, exit 3, visible', async () => {
    const result = await runReport(undefined);
    assert.equal(result.code, 3);
    assert.match(result.text, /## CI dev tests: ERROR/);
    assert.match(result.text, /report is missing/);
  });

  test('a malformed report: ERROR, exit 3', async () => {
    const result = await runReport({}, { raw: '{ not json' });
    assert.equal(result.code, 3);
    assert.match(result.text, /ERROR/);
  });

  test('runner errors in the report: ERROR, exit 3', async () => {
    const result = await runReport(nativeReport(SMOKE, [{ message: 'worker crashed' }]));
    assert.equal(result.code, 3);
    assert.match(result.text, /top-level error/);
  });

  test('the report and the Playwright exit code disagree: ERROR both ways; unrecorded exit: ERROR', async () => {
    assert.equal((await runReport(nativeReport(SMOKE), { exit: '1' })).code, 3);
    const failing = nativeReport([...SMOKE, { status: 'unexpected', tags: ['smoke'] }]);
    assert.equal((await runReport(failing, { exit: '0' })).code, 3);
    assert.equal((await runReport(nativeReport(SMOKE), { exit: '' })).code, 3);
  });
});

describe('report: output safety', () => {
  test('backticks, mentions and markup in a failure message cannot break out of the block', async () => {
    const result = await runReport(
      nativeReport([
        { status: 'expected', tags: ['smoke'] },
        {
          status: 'unexpected',
          tags: ['smoke'],
          error: '```\n@here <img src=x> `code` [x](http://e.invalid)',
        },
      ]),
      { exit: '1' },
    );
    const block = /```text\n([\s\S]*?)\n```\n/.exec(result.text)?.[1] ?? '';
    assert.ok(block.length > 0);
    assert.doesNotMatch(block, /`/);
    assert.doesNotMatch(block, /@here/);
    assert.doesNotMatch(block, /<img/);
    assert.ok(result.text.length <= 3500, `summary is ${result.text.length} characters`);
  });

  test('many failures stay bounded and close the block', async () => {
    const many = Array.from({ length: 40 }, () => ({
      status: 'unexpected',
      tags: ['smoke'],
      error: 'x'.repeat(400),
    }));
    const result = await runReport(
      nativeReport([{ status: 'expected', tags: ['smoke'] }, ...many]),
      {
        exit: '1',
      },
    );
    assert.ok(result.text.length <= 3500);
    assert.equal((result.text.match(/```/g) ?? []).length % 2, 0);
  });

  test('traces on the runner are counted and named as withheld; an HTML report is optional', async () => {
    const dir = temp();
    mkdirSync(join(dir, 'test-results', 'one'), { recursive: true });
    writeFileSync(join(dir, 'test-results', 'one', 'trace.zip'), 'x');
    const out = join(dir, 'summary.md');
    writeFileSync(join(dir, 'report.json'), JSON.stringify(nativeReport(SMOKE)));
    await main([
      'report',
      '--report',
      join(dir, 'report.json'),
      '--role',
      'smoke',
      '--run-url',
      RUN_URL,
      '--sha',
      SHA,
      '--run-id',
      RUN_ID,
      '--playwright-exit',
      '0',
      '--html-dir',
      join(dir, 'html'),
      '--traces',
      join(dir, 'test-results'),
      '--out',
      out,
    ]);
    const text = readFileSync(out, 'utf8');
    assert.match(text, /1 captured on the runner, withheld from upload by design/);
    assert.match(text, /HTML report: not available \(optional\)/);
  });
});

describe('report: the capture line states what is true about the required native JSON', () => {
  const jsonLine = (text) => /^Native JSON: required, (.*?) · HTML report:/m.exec(text)?.[1];

  test('a usable report is "present"', async () => {
    assert.equal(jsonLine((await runReport(nativeReport(SMOKE))).text), 'present');
  });

  test('a valid report with no executed test is still "present" (the problem is the result, not the file)', async () => {
    const result = await runReport(nativeReport([{ status: 'skipped', tags: ['smoke'] }]));
    assert.equal(result.code, 2);
    assert.equal(jsonLine(result.text), 'present');
  });

  test('a missing report says MISSING and never "present"', async () => {
    const result = await runReport(undefined);
    assert.equal(jsonLine(result.text), 'MISSING');
    assert.doesNotMatch(result.text, /required, present/);
  });

  test('a malformed report and a report with runner errors say REJECTED, not "present"', async () => {
    const malformed = await runReport({}, { raw: '{ not json' });
    const runnerError = await runReport(nativeReport(SMOKE, [{ message: 'worker crashed' }]));
    for (const result of [malformed, runnerError]) {
      assert.match(jsonLine(result.text) ?? '', /^present but REJECTED/);
      assert.doesNotMatch(result.text, /required, present ·/);
    }
  });

  test('a withheld HTML report points at the notes; one never produced does not', async () => {
    const plain = await runReport(nativeReport(SMOKE));
    assert.match(plain.text, /HTML report: not available \(optional\): not produced ·/);
    assert.doesNotMatch(plain.text, /see the notes below/);
    const withheld = join(plain.dir, 'withheld.txt');
    writeFileSync(withheld, 'html: withheld (the credential scan matched)\n');
    const out = join(plain.dir, 'again.md');
    await main([
      'report',
      '--report',
      join(plain.dir, 'report.json'),
      '--role',
      'smoke',
      '--run-url',
      RUN_URL,
      '--sha',
      SHA,
      '--run-id',
      RUN_ID,
      '--playwright-exit',
      '0',
      '--html-dir',
      join(plain.dir, 'html'),
      '--traces',
      join(plain.dir, 'test-results'),
      '--withheld',
      withheld,
      '--out',
      out,
    ]);
    const text = readFileSync(out, 'utf8');
    assert.match(text, /withheld or not produced, see the notes below/);
    assert.match(text, /- html: withheld \(the credential scan matched\)/);
  });
});

describe('scrub', () => {
  const values = (dir) => {
    const file = join(dir, 'values.mjs');
    writeFileSync(
      file,
      `export const AUTHOR = { email: 'fake-author@example.invalid', password: '${FAKE_PASSWORD}' };\n`,
    );
    return file;
  };
  function folder({ index = '<html>clean</html>', json = '{"ok":true}' } = {}) {
    const dir = temp();
    mkdirSync(join(dir, 'html', 'data'), { recursive: true });
    writeFileSync(join(dir, 'html', 'index.html'), index);
    writeFileSync(join(dir, 'html', 'data', 'abc.zip'), 'trace archive bytes');
    writeFileSync(join(dir, 'html', 'data', 'shot.png'), 'png bytes');
    writeFileSync(join(dir, 'report.json'), json);
    return dir;
  }
  const scrub = (dir) =>
    main([
      'scrub',
      '--html',
      join(dir, 'html'),
      '--json',
      join(dir, 'report.json'),
      '--withheld',
      join(dir, 'withheld.txt'),
      '--values-module',
      values(dir),
    ]);

  test('a clean report keeps index.html and the JSON, removes trace archives and attachments', async () => {
    const dir = folder();
    const result = await scrub(dir);
    assert.equal(result.code, 0);
    assert.ok(existsSync(join(dir, 'html', 'index.html')));
    assert.ok(!existsSync(join(dir, 'html', 'data', 'abc.zip')));
    assert.ok(!existsSync(join(dir, 'html', 'data', 'shot.png')));
    assert.ok(existsSync(join(dir, 'report.json')));
    assert.match(readFileSync(join(dir, 'withheld.txt'), 'utf8'), /removed 2 file\(s\)/);
  });

  test('a login value in a text file withholds the whole HTML folder; the JSON stays', async () => {
    const dir = folder({ index: `<p>${FAKE_PASSWORD}</p>` });
    const result = await scrub(dir);
    assert.equal(result.code, 0);
    assert.ok(!existsSync(join(dir, 'html')));
    assert.ok(existsSync(join(dir, 'report.json')));
    assert.match(
      readFileSync(join(dir, 'withheld.txt'), 'utf8'),
      /html: withheld \(the credential scan matched\)/,
    );
  });

  test('a login value inside the report data embedded in index.html is found (stored and deflated)', async () => {
    for (const deflate of [false, true]) {
      const zip = makeZip([
        { name: 'report.json', data: Buffer.from(`{"step":"fill ${FAKE_PASSWORD}"}`), deflate },
      ]);
      const dir = folder({
        index: `<script>data:application/zip;base64,${zip.toString('base64')}</script>`,
      });
      await scrub(dir);
      assert.ok(!existsSync(join(dir, 'html')), `deflate=${deflate}`);
    }
  });

  test('clean embedded report data is kept; unreadable embedded data is withheld (fail closed)', async () => {
    const clean = makeZip([
      { name: 'report.json', data: Buffer.from('{"step":"open page"}'), deflate: true },
    ]);
    const keep = folder({ index: `data:application/zip;base64,${clean.toString('base64')}` });
    await scrub(keep);
    assert.ok(existsSync(join(keep, 'html', 'index.html')));
    const bad = folder({
      index: 'data:application/zip;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    await scrub(bad);
    assert.ok(!existsSync(join(bad, 'html')));
    assert.match(readFileSync(join(bad, 'withheld.txt'), 'utf8'), /could not be scanned/);
  });

  test('a session cookie or bearer shape withholds the HTML folder', async () => {
    for (const shape of ['qa_session=abcdef123456', 'Authorization: Bearer abcdefghijklmnop1234']) {
      const dir = folder({ index: `<pre>${shape}</pre>` });
      await scrub(dir);
      assert.ok(!existsSync(join(dir, 'html')), shape);
    }
  });

  test('a login value in the native JSON removes it and fails (the required file is unavailable)', async () => {
    const dir = folder({ json: `{"title":"${FAKE_PASSWORD}"}` });
    const result = await scrub(dir);
    assert.equal(result.code, 1);
    assert.ok(!existsSync(join(dir, 'report.json')));
  });

  test('no output names the matched value', async () => {
    const dir = folder({ index: FAKE_PASSWORD, json: FAKE_PASSWORD });
    const result = await scrub(dir);
    assert.ok(!result.line.includes(FAKE_PASSWORD));
    assert.ok(!readFileSync(join(dir, 'withheld.txt'), 'utf8').includes(FAKE_PASSWORD));
  });

  test('when the scan values cannot be loaded, nothing is kept', async () => {
    const dir = folder();
    const result = await main([
      'scrub',
      '--html',
      join(dir, 'html'),
      '--json',
      join(dir, 'report.json'),
      '--values-module',
      join(dir, 'missing.mjs'),
    ]);
    assert.equal(result.code, 3);
    assert.ok(!existsSync(join(dir, 'html')));
    assert.ok(!existsSync(join(dir, 'report.json')));
  });

  test('a missing HTML report is only noted; a missing JSON fails', async () => {
    const dir = temp();
    writeFileSync(join(dir, 'report.json'), '{}');
    const ok = await main([
      'scrub',
      '--html',
      join(dir, 'html'),
      '--json',
      join(dir, 'report.json'),
      '--withheld',
      join(dir, 'w.txt'),
      '--values-module',
      values(dir),
    ]);
    assert.equal(ok.code, 0);
    assert.match(readFileSync(join(dir, 'w.txt'), 'utf8'), /html: not produced/);
    const missing = await main([
      'scrub',
      '--html',
      join(dir, 'html'),
      '--json',
      join(dir, 'nope.json'),
      '--values-module',
      values(dir),
    ]);
    assert.equal(missing.code, 1);
  });
});

describe('proof', () => {
  const skipped = (reason) =>
    nativeReport([
      { status: 'skipped', reason },
      { status: 'skipped', reason },
    ]);

  test('every test skipped with the exact empty-input reason passes', () => {
    assert.equal(checkProof(JSON.stringify(skipped(PROOF_REASON))).ok, true);
  });

  test('the unset reason, the opt-in reason, a passing test, no test and runner errors all fail', () => {
    for (const reason of [
      'database access unavailable: STUDENT_DATABASE_URL is not set and there is no .env',
      'database access unavailable: opt-in only; set QA_DB=1',
    ]) {
      assert.equal(checkProof(JSON.stringify(skipped(reason))).ok, false, reason);
    }
    assert.equal(checkProof(JSON.stringify(nativeReport([{ status: 'expected' }]))).ok, false);
    assert.equal(checkProof(JSON.stringify(nativeReport([]))).ok, false);
    assert.equal(
      checkProof(
        JSON.stringify(
          nativeReport([{ status: 'skipped', reason: PROOF_REASON }], [{ message: 'x' }]),
        ),
      ).ok,
      false,
    );
    assert.equal(checkProof('nope').ok, false);
  });

  test('the proof command reads a file and exits 0 or 1', async () => {
    const dir = temp();
    writeFileSync(join(dir, 'p.json'), JSON.stringify(skipped(PROOF_REASON)));
    assert.equal((await main(['proof', '--report', join(dir, 'p.json')])).code, 0);
    assert.equal((await main(['proof', '--report', join(dir, 'absent.json')])).code, 1);
  });
});

describe('steps and usage', () => {
  async function steps(object) {
    const dir = temp();
    writeFileSync(join(dir, 's.json'), JSON.stringify(object));
    const result = await main([
      'steps',
      '--steps',
      join(dir, 's.json'),
      '--out',
      join(dir, 'o.md'),
    ]);
    return { ...result, text: readFileSync(join(dir, 'o.md'), 'utf8') };
  }
  const ok = { outcome: 'success', conclusion: 'success' };

  test('all steps passed: exit 0', async () => {
    const result = await steps({ lint: ok, typecheck: ok });
    assert.equal(result.code, 0);
    assert.match(result.text, /Static checks: PASSED/);
  });

  test('a failed step, a step that did not run, and a failure hidden by continue-on-error: exit 1', async () => {
    assert.equal(
      (await steps({ lint: ok, typecheck: { outcome: 'failure', conclusion: 'failure' } })).code,
      1,
    );
    assert.equal(
      (await steps({ lint: ok, safety: { outcome: 'skipped', conclusion: 'skipped' } })).code,
      1,
    );
    const hidden = await steps({ lint: { outcome: 'failure', conclusion: 'success' } });
    assert.equal(hidden.code, 1);
    assert.match(hidden.text, /FAILED/);
  });

  test('entries without an outcome are ignored; an empty list is a failure', async () => {
    assert.equal((await steps({ lint: ok, other: {} })).code, 0);
    assert.equal((await steps({})).code, 1);
  });

  test('usage errors exit 3 and never throw', async () => {
    assert.equal((await main([])).code, 3);
    assert.equal((await main(['bogus'])).code, 3);
    assert.equal((await main(['proof'])).code, 3);
    assert.equal((await main(['report', '--nope', 'x'])).code, 3);
    assert.equal((await main(['report', '--report'])).code, 3);
    assert.equal(
      (
        await main([
          'report',
          '--report',
          'a',
          '--role',
          'smoke',
          '--run-url',
          'http://x',
          '--sha',
          SHA,
          '--run-id',
          RUN_ID,
          '--playwright-exit',
          '0',
          '--html-dir',
          'h',
          '--traces',
          't',
          '--out',
          'o',
        ])
      ).code,
      3,
    );
  });

  test('run as a script, the last stdout line names the command and status', () => {
    const dir = temp();
    writeFileSync(
      join(dir, 'p.json'),
      JSON.stringify(nativeReport([{ status: 'skipped', reason: PROOF_REASON }])),
    );
    const run = spawnSync(process.execPath, [SCRIPT, 'proof', '--report', join(dir, 'p.json')], {
      encoding: 'utf8',
    });
    assert.equal(run.status, 0);
    assert.match(run.stdout.trim(), /^ci-summary: proof ok: /);
  });
});

describe('readZipEntries', () => {
  test('reads stored and deflated entries and refuses a buffer that is not a zip', () => {
    const zip = makeZip([
      { name: 'a.txt', data: Buffer.from('alpha') },
      { name: 'b.txt', data: Buffer.from('beta beta beta'), deflate: true },
    ]);
    const entries = readZipEntries(zip);
    assert.deepEqual(
      entries.map((e) => [e.name, e.data.toString()]),
      [
        ['a.txt', 'alpha'],
        ['b.txt', 'beta beta beta'],
      ],
    );
    assert.throws(() => readZipEntries(Buffer.from('not a zip at all, just text')));
  });
});

/** A minimal zip writer for the fixtures: stored or deflated entries, central directory, no CRC. */
function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const raw = entry.deflate ? deflateRawSync(entry.data) : entry.data;
    const method = entry.deflate ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(raw.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(raw.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    const piece = Buffer.concat([local, name, raw]);
    locals.push(piece);
    centrals.push(Buffer.concat([central, name]));
    offset += piece.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
