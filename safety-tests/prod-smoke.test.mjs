// Isolated checks for the optional manual production smoke job (Week 5, optional check): the selection
// gate scripts/prod-smoke-select.mjs, the prod target of scripts/ci-summary.mjs and the policy of
// .github/workflows/prod-smoke.yml. node:test, no browser, no network, no production request, no
// application test. Fixtures are strings written to temp folders that are removed. The workflow is read as
// text only. Not part of `npm run test:safety` (package.json is CRITICAL); run it with
// `node --test safety-tests/prod-smoke.test.mjs`.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { main as summary } from '../scripts/ci-summary.mjs';
import { main as select } from '../scripts/prod-smoke-select.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const SELECT_SCRIPT = join(REPO, 'scripts', 'prod-smoke-select.mjs');
const PROD_URL = 'https://ai-orchestration-courses.com';
const SHA = 'a'.repeat(40);
const RUN_ID = '20261114T100000Z-abc123';
const RUN_URL = 'https://github.com/example/repo/actions/runs/1';

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'prod-smoke-'));
  temps.push(dir);
  return dir;
};

const GOOD_SPEC = `import { expect, test } from '@playwright/test';
import { runIfEnv } from '../../env/runIfEnv';
test.describe('guest read (prod ok)', () => {
  runIfEnv(test, ['prod']);
  test('the home page loads for a guest', { tag: '@prod-smoke' }, async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\\//);
  });
});
`;
const entry = (over = {}) => ({
  file: 'tests/prod/home.spec.ts',
  title: 'the home page loads for a guest',
  approvedBy: 'owner',
  approvedOn: '2026-11-14',
  source: 'conversation 2026-11-14',
  readOnlyBasis: 'a guest GET of one page',
  ...over,
});

/** A temp project root with the given spec files and allowlist; returns its paths. */
function fixture({
  specs = { 'tests/prod/home.spec.ts': GOOD_SPEC },
  approved = [entry()],
  raw,
} = {}) {
  const root = temp();
  for (const [file, text] of Object.entries(specs)) {
    mkdirSync(join(root, dirname(file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  const allowlist = join(root, 'allowlist.json');
  writeFileSync(allowlist, raw ?? JSON.stringify({ version: 1, approved }));
  return { root, allowlist, out: join(root, 'args.txt'), gh: join(root, 'gh-output.txt') };
}
const run = (f, env = {}) =>
  select(
    ['--root', f.root, '--allowlist', f.allowlist, '--out', f.out, '--github-output', f.gh],
    env,
  );

describe('selection gate: nothing is approved today', () => {
  test('the shipped allowlist is empty and valid', () => {
    const list = JSON.parse(
      readFileSync(join(REPO, 'scripts', 'prod-smoke-allowlist.json'), 'utf8'),
    );
    assert.equal(list.version, 1);
    assert.deepEqual(list.approved, []);
  });

  test('with the shipped allowlist the gate stops (exit 2), names the prod target, and writes no arguments', async () => {
    const out = join(temp(), 'args.txt');
    const result = await select(['--out', out], {});
    assert.equal(result.code, 2);
    assert.ok(result.out.some((line) => line.includes(`target: prod (${PROD_URL})`)));
    assert.ok(result.out.includes('prod-smoke-select: exit 2 none-approved'));
    assert.ok(!existsSync(out));
  });

  test('a tag is not eligibility: a spec tagged for prod but absent from the allowlist selects nothing', async () => {
    const f = fixture({ approved: [] });
    const result = await run(f);
    assert.equal(result.code, 2);
    assert.ok(!existsSync(f.out));
    assert.equal(readFileSync(f.gh, 'utf8'), 'count=0\n');
  });

  test('run as a script with the shipped list: exit 2 and the last line says none-approved', () => {
    const env = { ...process.env };
    delete env.BASE_URL;
    delete env.LOCAL_SANDBOX_DIR;
    const run2 = spawnSync(
      process.execPath,
      ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', SELECT_SCRIPT],
      { encoding: 'utf8', env },
    );
    assert.equal(run2.status, 2);
    assert.match(
      run2.stdout.trim().split('\n').at(-1),
      /^prod-smoke-select: exit 2 none-approved$/,
    );
  });
});

describe('selection gate: an approved, read-only entry is selected', () => {
  test('one valid entry: exit 0, the file and an escaped --grep are written, count=1', async () => {
    const f = fixture({ approved: [entry({ title: 'the home page loads for a guest' })] });
    const result = await run(f);
    assert.equal(result.code, 0);
    assert.deepEqual(readFileSync(f.out, 'utf8').trim().split('\n'), [
      'tests/prod/home.spec.ts',
      '--grep',
      '(the home page loads for a guest)',
    ]);
    assert.equal(readFileSync(f.gh, 'utf8'), 'count=1\n');
  });

  test('regular-expression characters in a title are escaped', async () => {
    const title = 'a (b) [c] d.e+f';
    const spec = GOOD_SPEC.replace('the home page loads for a guest', title);
    const f = fixture({ specs: { 'tests/prod/home.spec.ts': spec }, approved: [entry({ title })] });
    assert.equal((await run(f)).code, 0);
    assert.ok(readFileSync(f.out, 'utf8').includes('(a \\(b\\) \\[c\\] d\\.e\\+f)'));
  });
});

describe('selection gate: every unsafe or malformed entry is refused (exit 3)', () => {
  const refuse = async (f, pattern, env = {}) => {
    const result = await run(f, env);
    assert.equal(result.code, 3, result.out.join(' | '));
    assert.match(result.out.join('\n'), pattern);
    assert.ok(!existsSync(f.out), 'no arguments are written');
  };

  test('a spec that does not declare prod would skip: refused', async () => {
    const dev = GOOD_SPEC.replace("['prod']", "['dev']");
    await refuse(fixture({ specs: { 'tests/prod/home.spec.ts': dev } }), /would skip/);
  });

  test('credentials, a guard, or a write name anywhere in the file: refused', async () => {
    for (const [extra, pattern] of [
      ["import { AUTHOR } from '../support/users';", /uses credentials/],
      ["import { x } from '../support/users';", /uses credentials/],
      ['envGuard(() => 1);', /not read-only/],
      ['api.post("/x");', /not read-only/],
      ['cart.addToCart(1, 1);', /not read-only/],
      ['await createArticle(1);', /not read-only/],
    ]) {
      const spec = `${GOOD_SPEC}\n${extra}\n`;
      await refuse(fixture({ specs: { 'tests/prod/home.spec.ts': spec } }), pattern);
    }
  });

  test('a title that is not in the file, a missing file, a symlink-free regular-file rule, and bad paths: refused', async () => {
    await refuse(fixture({ approved: [entry({ title: 'not in the spec' })] }), /title is not in/);
    await refuse(
      fixture({ approved: [entry({ file: 'tests/prod/missing.spec.ts' })] }),
      /not a regular file/,
    );
    for (const file of [
      '../x.spec.ts',
      'tests/../x.spec.ts',
      'tests/prod/home.ts',
      '/etc/x.spec.ts',
      'tests\\prod\\home.spec.ts',
    ]) {
      await refuse(fixture({ approved: [entry({ file })] }), /"file" must be a tests/);
    }
  });

  test('a missing field, a blank field, a bad date, a control character and a duplicate: refused', async () => {
    for (const field of ['file', 'title', 'approvedBy', 'approvedOn', 'source', 'readOnlyBasis']) {
      const bad = entry();
      delete bad[field];
      await refuse(fixture({ approved: [bad] }), new RegExp(`"${field}"`));
    }
    await refuse(fixture({ approved: [entry({ readOnlyBasis: '   ' })] }), /"readOnlyBasis"/);
    await refuse(fixture({ approved: [entry({ approvedOn: '14/11/2026' })] }), /YYYY-MM-DD/);
    await refuse(
      fixture({ approved: [entry({ title: 'the home page\nloads for a guest' })] }),
      /control characters|title is not in/,
    );
    await refuse(fixture({ approved: [entry(), entry()] }), /repeats an earlier entry/);
  });

  test('more than 20 entries, a malformed list, a wrong version and a missing list: refused', async () => {
    await refuse(
      fixture({ approved: Array.from({ length: 21 }, (_, i) => entry({ title: `t${i}` })) }),
      /more than 20/,
    );
    await refuse(fixture({ raw: '{ not json' }), /not valid JSON/);
    await refuse(fixture({ raw: JSON.stringify({ version: 2, approved: [] }) }), /must be/);
    await refuse(fixture({ raw: JSON.stringify({ version: 1 }) }), /must be/);
    await refuse(fixture({ raw: JSON.stringify([1]) }), /must be/);
    await refuse(fixture({ approved: [42] }), /not an object/);
    const f = fixture();
    rmSync(f.allowlist);
    await refuse(f, /missing or is not valid JSON/);
  });

  test('BASE_URL (even the canonical prod address) and LOCAL_SANDBOX_DIR make the gate refuse', async () => {
    await refuse(fixture(), /BASE_URL must be unset/, { BASE_URL: PROD_URL });
    await refuse(fixture(), /BASE_URL must be unset/, { BASE_URL: '' });
    await refuse(fixture(), /resolver refused/, { LOCAL_SANDBOX_DIR: 'x' });
  });

  test('an unknown option is a usage error', async () => {
    const result = await select(['--nope', 'x'], {});
    assert.equal(result.code, 3);
  });
});

describe('selection gate: no network, no .env', () => {
  test('the script contains no network, .env or browser call', () => {
    const text = readFileSync(SELECT_SCRIPT, 'utf8');
    assert.doesNotMatch(
      text,
      /fetch\(|node:http|node:https|node:net|node:dns|XMLHttpRequest|chromium|spawn|exec/,
    );
    assert.doesNotMatch(text, /\.env['"`]|process\.env\.(SLACK|STUDENT|JIRA)/);
  });
});

describe('ci-summary: the prod target', () => {
  const report = (tests) => ({
    config: { version: '1.61.1', rootDir: '/x/tests', metadata: { actualWorkers: 1 } },
    suites: [
      {
        title: 'a.spec.ts',
        file: 'a.spec.ts',
        suites: [],
        specs: tests.map((status, i) => ({
          title: `guest case ${i}`,
          file: 'a.spec.ts',
          line: i + 1,
          column: 1,
          tags: [],
          tests: [
            {
              status,
              annotations: [],
              results: [
                {
                  status: status === 'skipped' ? 'skipped' : 'passed',
                  retry: 0,
                  duration: 5,
                  errors: [],
                },
              ],
            },
          ],
        })),
      },
    ],
    errors: [],
    stats: {
      startTime: '2026-11-14T10:00:00.000Z',
      duration: 100,
      expected: tests.filter((t) => t === 'expected').length,
      skipped: tests.filter((t) => t === 'skipped').length,
      unexpected: 0,
      flaky: 0,
    },
  });
  async function runReport(tests, flags) {
    const dir = temp();
    writeFileSync(join(dir, 'report.json'), JSON.stringify(report(tests)));
    const out = join(dir, 'summary.md');
    const result = await summary([
      'report',
      '--report',
      join(dir, 'report.json'),
      ...flags,
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
    return { ...result, text: existsSync(out) ? readFileSync(out, 'utf8') : '' };
  }

  test('role prod-smoke with target prod: the heading, the scope line and the reporter all say prod', async () => {
    const result = await runReport(
      ['expected', 'expected'],
      ['--role', 'prod-smoke', '--target', 'prod'],
    );
    assert.equal(result.code, 0);
    assert.match(result.text, /## CI prod tests: PASS/);
    assert.match(result.text, /scope prod-smoke · target prod ·/);
    assert.match(result.text, /target: prod \(--run-target\)/);
    assert.doesNotMatch(result.text, /target dev|target: dev|CI dev tests/);
  });

  test('every prod test skipped is INCOMPLETE, never a pass', async () => {
    const result = await runReport(
      ['skipped', 'skipped'],
      ['--role', 'prod-smoke', '--target', 'prod'],
    );
    assert.equal(result.code, 2);
    assert.match(result.text, /INCOMPLETE/);
  });

  test('role and target must go together; an unknown target is refused; dev stays the default', async () => {
    assert.equal((await runReport(['expected'], ['--role', 'prod-smoke'])).code, 3);
    assert.equal((await runReport(['expected'], ['--role', 'smoke', '--target', 'prod'])).code, 3);
    assert.equal(
      (await runReport(['expected'], ['--role', 'regression', '--target', 'prod'])).code,
      3,
    );
    assert.equal(
      (await runReport(['expected'], ['--role', 'prod-smoke', '--target', 'staging'])).code,
      3,
    );
    const dev = await runReport(['expected'], ['--role', 'regression']);
    assert.equal(dev.code, 0);
    assert.match(dev.text, /## CI dev tests: PASS/);
    assert.match(dev.text, /target dev/);
  });
});

describe('prod-smoke.yml policy (text only)', () => {
  const text = readFileSync(join(REPO, '.github', 'workflows', 'prod-smoke.yml'), 'utf8').replace(
    /\r/g,
    '',
  );
  const code = text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
  const stepNames = [...code.matchAll(/^ {6}- (?:name: (.*)|uses: .*)$/gm)].map(
    (m) => m[1] ?? m[0],
  );
  const at = (needle) => code.indexOf(needle);

  test('manual only: dispatch is the only trigger; no schedule, push, pull request or chained trigger', () => {
    const on = /^on:\n([\s\S]*?)\n\npermissions:/m.exec(code)?.[1] ?? '';
    assert.deepEqual(
      [...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]),
      ['workflow_dispatch'],
    );
    for (const forbidden of [
      /schedule:/,
      /cron:/,
      /^ {2}push:/m,
      /pull_request/,
      /workflow_run/,
      /repository_dispatch/,
    ]) {
      assert.doesNotMatch(code, forbidden);
    }
  });

  test('a typed confirmation input, and the first step refuses anything but main and the exact text', () => {
    assert.match(code, /confirm:\n\s+description: .*\n\s+type: string\n\s+required: true/);
    const first =
      /steps:\n {6}- name: Confirm and check the branch([\s\S]*?)\n {6}- uses:/.exec(code)?.[1] ??
      '';
    assert.match(first, /CONFIRM: \$\{\{ inputs\.confirm \}\}/);
    assert.match(first, /\[ "\$CONFIRM" = READ-ONLY-PROD \] \|\| \{ .*exit 1; \}/);
    assert.match(first, /\[ "\$REF" = refs\/heads\/main \] \|\| \{ .*exit 1; \}/);
    assert.doesNotMatch(code, /^\s+if: .*(inputs\.confirm|github\.ref)/m);
  });

  test('the selection gate runs before the browser install and before the only test:prod call', () => {
    assert.equal((code.match(/test:prod/g) ?? []).length, 1);
    assert.ok(at('id: select') > 0);
    assert.ok(at('id: select') < at('playwright install'));
    assert.ok(at('playwright install') < at('npm run test:prod'));
    assert.match(code, /npm run test:prod -- "\$\{args\[@\]\}" --reporter=list,json,html/);
    assert.match(code, /scripts\/prod-smoke-select\.mjs --out "\$RUNNER_TEMP\/prod-args\.txt"/);
    assert.ok(stepNames.length >= 10);
  });

  test('the target is the existing resolver route: no APP_ENV, BASE_URL or LOCAL_SANDBOX_DIR is set', () => {
    assert.doesNotMatch(code, /^\s*(APP_ENV|BASE_URL|LOCAL_SANDBOX_DIR)\s*:/m);
    assert.doesNotMatch(code, /APP_ENV=/);
    assert.match(code, /test -z "\$\{APP_ENV-\}"/);
    assert.match(code, /test -z "\$\{BASE_URL-\}"/);
  });

  test('guest only: no secret, no account, no model, Slack, database or MCP call', () => {
    assert.doesNotMatch(code, /secrets\./);
    assert.doesNotMatch(
      code,
      /SLACK_|--send|--check-connection|ANTHROPIC|claude|mcp|DATABASE|STUDENT_|QA_DB/i,
    );
    assert.doesNotMatch(code, /AUTHOR|ADMIN|PASSWORD|users\.ts/);
  });

  test('narrow permissions, one queued prod group never cancelled, a timeout, no hidden failure', () => {
    assert.match(code, /^permissions: \{\}$/m);
    assert.match(code, /permissions:\n {6}contents: read/);
    assert.equal((code.match(/: write/g) ?? []).length, 0);
    assert.match(code, /group: qa-prod-target\n\s+cancel-in-progress: false/);
    assert.match(code, /timeout-minutes: 10/);
    assert.doesNotMatch(code, /continue-on-error/);
    assert.doesNotMatch(code, /pull_request_target/);
  });

  test('actions are GitHub-owned and pinned to full SHAs; checkout drops its token', () => {
    const uses = code.split('\n').filter((line) => /^\s+(- )?uses:/.test(line));
    assert.ok(uses.length >= 4);
    for (const line of uses)
      assert.match(line, /uses: actions\/[a-z-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
    assert.match(code.split('actions/checkout@')[1].slice(0, 200), /persist-credentials: false/);
  });

  test('reports: scrubbed before upload, 14 days, prod-named artifacts, no traces or login state', () => {
    assert.ok(at('id: scrub') < at('actions/upload-artifact'));
    const uploads = code.split('actions/upload-artifact@').slice(1);
    assert.equal(uploads.length, 2);
    for (const rest of uploads) assert.match(rest.slice(0, 600), /retention-days: 14/);
    assert.match(code, /name: prod-native-json/);
    assert.match(code, /name: prod-html-report/);
    const paths = [...code.matchAll(/path: ([\s\S]*?)if-no-files-found/g)]
      .map((m) => m[1])
      .join(' ');
    assert.doesNotMatch(paths, /test-results|trace|\.auth|storage|\.env/i);
    assert.match(code, /--role prod-smoke --target prod/);
    assert.match(code, /printf 'target: prod\\n'/);
  });

  test('the core workflow is untouched in spirit: ci.yml still has no prod route', () => {
    const ci = readFileSync(join(REPO, '.github', 'workflows', 'ci.yml'), 'utf8')
      .replace(/\r/g, '')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');
    assert.doesNotMatch(ci, /test:prod|APP_ENV=|prod-smoke/);
  });
});
