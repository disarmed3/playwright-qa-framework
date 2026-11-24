// Isolated checks for scripts/vault-sync.mjs (Week 2 Task 05). node:test, no browser, no network.
// Every case runs the real script by absolute path inside its own temporary folder, selected with
// VAULT_SYNC_ROOT, with Git pointed at an empty global config so the real project and the user's
// Git settings cannot leak in.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/vault-sync.mjs', import.meta.url));
const temps = [];
let emptyGitConfig;

before(() => {
  const dir = mkdtempSync(join(tmpdir(), 'vault-log-gitconfig-'));
  temps.push(dir);
  emptyGitConfig = join(dir, 'empty.gitconfig');
  writeFileSync(emptyGitConfig, '');
});

after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function makeTemp() {
  const dir = mkdtempSync(join(tmpdir(), 'vault-log-'));
  temps.push(dir);
  return dir;
}

/** A copy of the environment without anything that could point at the real project or Git setup. */
function isolatedEnv(root, extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    const upper = key.toUpperCase();
    if (upper === 'CLAUDE_PROJECT_DIR' || upper === 'VAULT_SYNC_ROOT' || upper === 'TZ') continue;
    if (upper.startsWith('GIT_')) continue;
    if (upper === 'PATH' && 'PATH' in extra) continue;
    env[key] = value;
  }
  return {
    ...env,
    VAULT_SYNC_ROOT: root,
    GIT_CONFIG_GLOBAL: emptyGitConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    ...extra,
  };
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: isolatedEnv(cwd) }).trim();
}

/** A temporary repository on branch test-branch; with a commit "seed commit" unless unborn. */
function makeRepo({ unborn = false } = {}) {
  const root = makeTemp();
  git(root, 'init', '-q');
  git(root, 'symbolic-ref', 'HEAD', 'refs/heads/test-branch');
  git(root, 'config', 'user.name', 'Test Author');
  git(root, 'config', 'user.email', 'test-author@example.invalid');
  if (!unborn) {
    writeFileSync(join(root, 'README.md'), 'temp\n');
    git(root, 'add', 'README.md');
    git(root, 'commit', '-q', '-m', 'seed commit');
  }
  return root;
}

function run(root, mode, input, { cwd = root, env = {} } = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...(mode ? [mode] : [])], {
    cwd,
    input,
    env: isolatedEnv(root, env),
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const changelogDir = (root) => join(root, 'vault', '_changelog');

/** The daily Markdown logs in the temporary root, as { name: content }. */
function dailyLogs(root) {
  const dir = changelogDir(root);
  if (!existsSync(dir)) return {};
  return Object.fromEntries(
    readdirSync(dir)
      .filter((name) => name.endsWith('.md'))
      .map((name) => [name, readFileSync(join(dir, name), 'utf8')]),
  );
}

/** The single daily log's content; fails if there is not exactly one. */
function onlyLog(root) {
  const logs = Object.values(dailyLogs(root));
  assert.equal(logs.length, 1, 'expected exactly one daily log');
  return logs[0];
}

const WHEN = /\*\*when:\*\* (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)/g;

/** Replaces each UTC timestamp with <T> after checking its format. */
function normalized(content) {
  return content.replace(WHEN, '**when:** <T>');
}

function entry({ who, branch, what, subject, commit }) {
  return (
    `- **when:** <T> · **who:** ${who}@${hostname()} · **branch:** ${branch}\n` +
    `  **what:** ${what} · **why (last commit):** ${subject} · **commit:** ${commit}\n`
  );
}

function localDateIn(timeZone, date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

const event = (filePath) =>
  JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: filePath },
  });

describe('vault-sync --from-hook records a valid project path', () => {
  test('PostToolUse shape with an absolute path: one exact entry under a local-date heading', () => {
    const root = makeRepo();
    const short = git(root, 'rev-parse', '--short', 'HEAD');
    const before = new Date();
    const result = run(root, '--from-hook', event(join(root, 'src', 'a.ts')));
    const afterRun = new Date();

    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    const [[name, content]] = Object.entries(dailyLogs(root));
    const date = name.replace(/\.md$/, '');
    assert.equal(
      normalized(content),
      `# Change log ${date}\n\n` +
        entry({
          who: 'Test Author',
          branch: 'test-branch',
          what: 'src/a.ts',
          subject: 'seed commit',
          commit: short,
        }),
    );
    const when = new Date([...content.matchAll(WHEN)][0][1]);
    assert.ok(when.getTime() >= Math.floor(before.getTime() / 1000) * 1000 && when <= afterRun);
  });

  test('FileChanged shape: a top-level file_path is accepted', () => {
    const root = makeRepo();
    const result = run(
      root,
      '--from-hook',
      JSON.stringify({ hook_event_name: 'FileChanged', file_path: join(root, 'pages', 'P.ts') }),
    );
    assert.equal(result.status, 0);
    assert.match(onlyLog(root), /\n {2}\*\*what:\*\* pages\/P\.ts · /);
  });

  test('a relative path is resolved against the project root, not the working folder', () => {
    const root = makeRepo();
    mkdirSync(join(root, 'src'));
    const result = run(root, '--from-hook', event('tests/x.spec.ts'), { cwd: join(root, 'src') });
    assert.equal(result.status, 0);
    assert.match(onlyLog(root), /\*\*what:\*\* tests\/x\.spec\.ts · /);
  });

  test('a top-level relative file_path is accepted too', () => {
    const root = makeRepo();
    run(root, '--from-hook', JSON.stringify({ file_path: './docs/../notes.md' }));
    assert.match(onlyLog(root), /\*\*what:\*\* notes\.md · /);
  });

  test('a folder merely starting with "vault" is not excluded', () => {
    const root = makeRepo();
    run(root, '--from-hook', event('vaulty/x.md'));
    assert.match(onlyLog(root), /\*\*what:\*\* vaulty\/x\.md · /);
  });

  test('control characters in the path cannot add lines to the entry', () => {
    const root = makeRepo();
    run(root, '--from-hook', event('src/a\nb\u0007.ts'));
    const lines = onlyLog(root).trimEnd().split('\n');
    assert.equal(lines.length, 4, 'heading, blank line and the two entry lines');
    assert.match(lines[3], /\*\*what:\*\* src\/a b .ts · /);
  });

  test(
    'Windows: backslashes and a different drive-letter case',
    { skip: process.platform !== 'win32' },
    () => {
      const root = makeRepo();
      const swapped =
        root[0] === root[0].toUpperCase()
          ? root[0].toLowerCase() + root.slice(1)
          : root[0].toUpperCase() + root.slice(1);
      run(root, '--from-hook', event('src\\c.ts'));
      run(root, '--from-hook', event(join(swapped, 'src', 'd.ts')));
      const content = onlyLog(root);
      assert.match(content, /\*\*what:\*\* src\/c\.ts · /);
      assert.match(content, /\*\*what:\*\* src\/d\.ts · /);
    },
  );

  test('commit is the short HEAD at the time of the edit, at whatever length Git chooses', () => {
    const root = makeRepo();
    git(root, 'config', 'core.abbrev', '12');
    const short = git(root, 'rev-parse', '--short', 'HEAD');
    assert.equal(short.length, 12);
    run(root, '--from-hook', event('src/a.ts'));
    assert.ok(
      normalized(onlyLog(root)).endsWith(
        entry({
          who: 'Test Author',
          branch: 'test-branch',
          what: 'src/a.ts',
          subject: 'seed commit',
          commit: short,
        }),
      ),
    );
  });

  test('a new commit changes the ID in later entries only', () => {
    const root = makeRepo();
    const first = git(root, 'rev-parse', '--short', 'HEAD');
    run(root, '--from-hook', event('src/a.ts'));
    const before = onlyLog(root);
    writeFileSync(join(root, 'README.md'), 'temp 2\n');
    git(root, 'commit', '-q', '-am', 'second commit');
    const second = git(root, 'rev-parse', '--short', 'HEAD');
    assert.notEqual(second, first);
    run(root, '--from-hook', event('src/b.ts'));
    const after = onlyLog(root);
    assert.ok(after.startsWith(before), 'earlier bytes kept exactly');
    assert.equal(
      normalized(after.slice(before.length)),
      entry({
        who: 'Test Author',
        branch: 'test-branch',
        what: 'src/b.ts',
        subject: 'second commit',
        commit: second,
      }),
    );
  });
});

describe('vault-sync --from-hook ignores what it must not record', () => {
  test('vault itself and every path inside vault/', () => {
    const root = makeRepo();
    const paths = [
      'vault',
      'vault/',
      'vault/_map.md',
      'vault/_changelog/2026-01-01.md',
      join(root, 'vault', '03-framework', 'x.md'),
    ];
    if (process.platform === 'win32')
      paths.push('vault\\_raw\\y.md', 'Vault/z.md', join(root, 'VAULT', 'a.md'));
    for (const p of paths) {
      const result = run(root, '--from-hook', event(p));
      assert.equal(result.status, 0, p);
      assert.equal(result.stderr, '', p);
    }
    assert.equal(existsSync(changelogDir(root)), false);
  });

  test('paths outside the project, and the project root itself', () => {
    const root = makeRepo();
    const elsewhere = makeTemp();
    for (const p of ['../outside.txt', '..', join(elsewhere, 'x.ts'), '.', root]) {
      assert.equal(run(root, '--from-hook', event(p)).status, 0, p);
    }
    assert.equal(existsSync(changelogDir(root)), false);
  });

  test('malformed or missing input exits 0 and writes nothing', () => {
    const root = makeRepo();
    const inputs = [
      '',
      'not json',
      '{',
      'null',
      '[]',
      '"src/a.ts"',
      '{}',
      '{"file_path":5}',
      '{"file_path":""}',
      '{"file_path":"   "}',
      '{"tool_input":{"file_path":null}}',
      '{"tool_input":"src/a.ts"}',
    ];
    for (const input of inputs) {
      const result = run(root, '--from-hook', input);
      assert.equal(result.status, 0, input);
      assert.equal(result.stdout, '', input);
      assert.equal(result.stderr, '', input);
    }
    assert.equal(run(root, '--from-hook', undefined).status, 0, 'no stdin at all');
    assert.equal(existsSync(changelogDir(root)), false);
  });
});

describe('vault-sync --from-hook input and file handling', () => {
  test('one or more leading byte-order marks are removed before parsing', () => {
    const root = makeRepo();
    run(root, '--from-hook', '\uFEFF' + event('src/one.ts'));
    run(root, '--from-hook', '\uFEFF\uFEFF\uFEFF' + event('src/three.ts'));
    run(
      root,
      '--from-hook',
      Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf]),
        Buffer.from(event('src/bytes.ts')),
      ]),
    );
    const content = onlyLog(root);
    for (const name of ['one', 'three', 'bytes'])
      assert.match(content, new RegExp(`\\*\\*what:\\*\\* src/${name}\\.ts · `));
  });

  test('append-only: earlier entries keep their exact bytes', () => {
    const root = makeRepo();
    run(root, '--from-hook', event('src/first.ts'));
    const first = onlyLog(root);
    run(root, '--from-hook', event('src/second.ts'));
    const second = onlyLog(root);
    assert.ok(second.startsWith(first));
    assert.match(
      second.slice(first.length),
      /^- \*\*when:\*\* .*\n {2}\*\*what:\*\* src\/second\.ts · .*\n$/,
    );
  });

  test('append-only: an existing hand-written file without a final newline is kept', () => {
    const root = makeRepo();
    const date = localDateIn('UTC', new Date());
    mkdirSync(changelogDir(root), { recursive: true });
    const original = '# Change log\n\n- older entry kept as written';
    writeFileSync(join(changelogDir(root), `${date}.md`), original);
    run(root, '--from-hook', event('src/a.ts'), { env: { TZ: 'UTC' } });
    const content = readFileSync(join(changelogDir(root), `${date}.md`), 'utf8');
    assert.ok(content.startsWith(original + '\n- **when:** '));
    assert.equal(content.split('\n- **when:** ').length, 2);
  });

  test('the file name is the local date, which can differ from the UTC date', () => {
    const utcDates = [];
    for (const timeZone of ['Pacific/Kiritimati', 'Etc/GMT+12']) {
      const root = makeRepo();
      const before = new Date();
      run(root, '--from-hook', event('src/a.ts'), { env: { TZ: timeZone } });
      const afterRun = new Date();
      const [name] = Object.keys(dailyLogs(root));
      const expected = [localDateIn(timeZone, before), localDateIn(timeZone, afterRun)].map(
        (d) => `${d}.md`,
      );
      assert.ok(
        expected.includes(name),
        `${timeZone}: got ${name}, expected ${expected.join(' or ')}`,
      );
      utcDates.push([name, `${localDateIn('UTC', before)}.md`]);
    }
    // UTC+14 and UTC-12 cannot both share the UTC date at the same moment.
    assert.ok(
      utcDates.some(([name, utc]) => name !== utc),
      'at least one file name differs from the UTC date',
    );
  });
});

describe('vault-sync uses "unknown" when Git cannot provide a value', () => {
  test('a folder that is not a Git repository', () => {
    const root = makeTemp();
    run(root, '--from-hook', event('src/a.ts'));
    assert.match(
      normalized(onlyLog(root)),
      new RegExp(
        `\\n- \\*\\*when:\\*\\* <T> · \\*\\*who:\\*\\* unknown@.* · \\*\\*branch:\\*\\* unknown\\n {2}\\*\\*what:\\*\\* src/a\\.ts · \\*\\*why \\(last commit\\):\\*\\* unknown · \\*\\*commit:\\*\\* unknown\\n$`,
      ),
    );
  });

  test('a repository with no commits still reports its branch and name', () => {
    const root = makeRepo({ unborn: true });
    run(root, '--from-hook', event('src/a.ts'));
    assert.ok(
      normalized(onlyLog(root)).endsWith(
        entry({
          who: 'Test Author',
          branch: 'test-branch',
          what: 'src/a.ts',
          subject: 'unknown',
          commit: 'unknown',
        }),
      ),
    );
  });

  test('Git not installed (empty PATH)', () => {
    const root = makeRepo();
    const result = run(root, '--from-hook', event('src/a.ts'), { env: { PATH: '' } });
    assert.equal(result.status, 0);
    assert.ok(
      normalized(onlyLog(root)).endsWith(
        entry({
          who: 'unknown',
          branch: 'unknown',
          what: 'src/a.ts',
          subject: 'unknown',
          commit: 'unknown',
        }),
      ),
    );
  });
});

describe('vault-sync --session-start', () => {
  test('appends one exact START line per call, keeps earlier lines, prints nothing', () => {
    const root = makeTemp();
    const log = join(changelogDir(root), 'sessions.log');
    const first = run(root, '--session-start');
    assert.equal(first.status, 0);
    assert.equal(first.stdout, '');
    assert.equal(first.stderr, '');
    const one = readFileSync(log, 'utf8');
    assert.match(one, /^- session START \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ\n$/);
    run(root, '--session-start', '{"ignored": true}');
    const two = readFileSync(log, 'utf8');
    assert.ok(two.startsWith(one));
    assert.match(two.slice(one.length), /^- session START \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ\n$/);
    assert.deepEqual(dailyLogs(root), {}, 'no daily Markdown log is written');
  });

  test('a SessionStart event adds its source and session ID to the line', () => {
    const root = makeTemp();
    const input =
      '\uFEFF' +
      JSON.stringify({
        hook_event_name: 'SessionStart',
        source: 'startup',
        session_id: '5395ad6a-410e-4667-981d-f419cf948ab5',
        cwd: root,
      });
    const result = run(root, '--session-start', input);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    assert.match(
      readFileSync(join(changelogDir(root), 'sessions.log'), 'utf8'),
      /^- session START \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ · source: startup · session: 5395ad6a-410e-4667-981d-f419cf948ab5\n$/,
    );
  });

  test('missing, unsafe or malformed details fall back to the plain line', () => {
    const inputs = [
      'not json',
      '[]',
      'null',
      JSON.stringify({ source: 'startup' }),
      JSON.stringify({ session_id: 'abc-123' }),
      JSON.stringify({ source: 'startup', session_id: 'abc\n- session START forged' }),
      JSON.stringify({ source: 'start up', session_id: 'abc-123' }),
      JSON.stringify({ source: 'startup', session_id: 123 }),
      JSON.stringify({ source: 'startup', session_id: 'a'.repeat(129) }),
    ];
    for (const input of inputs) {
      const root = makeTemp();
      const result = run(root, '--session-start', input);
      assert.equal(result.status, 0, input);
      assert.equal(result.stdout, '', input);
      assert.match(
        readFileSync(join(changelogDir(root), 'sessions.log'), 'utf8'),
        /^- session START \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ\n$/,
        input,
      );
    }
  });
});

describe('vault-sync --session-end (Task 07)', () => {
  test('a SessionEnd event appends one exact END line after earlier lines, prints nothing', () => {
    const root = makeTemp();
    const log = join(changelogDir(root), 'sessions.log');
    run(root, '--session-start', JSON.stringify({ source: 'startup', session_id: 'abc-123' }));
    const start = readFileSync(log, 'utf8');
    const input =
      '\uFEFF' +
      JSON.stringify({
        hook_event_name: 'SessionEnd',
        reason: 'clear',
        session_id: '5395ad6a-410e-4667-981d-f419cf948ab5',
        cwd: root,
      });
    const result = run(root, '--session-end', input);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    const both = readFileSync(log, 'utf8');
    assert.ok(both.startsWith(start), 'START line kept exactly');
    assert.match(
      both.slice(start.length),
      /^- session END \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ · reason: clear · session: 5395ad6a-410e-4667-981d-f419cf948ab5\n$/,
    );
    assert.deepEqual(dailyLogs(root), {}, 'no daily Markdown log is written');
    assert.deepEqual(
      readdirSync(changelogDir(root)),
      ['sessions.log'],
      'only sessions.log is written',
    );
  });

  test('missing, unsafe or malformed details fall back to the plain END line', () => {
    const inputs = [
      undefined,
      'not json',
      '[]',
      'null',
      JSON.stringify({ reason: 'clear' }),
      JSON.stringify({ session_id: 'abc-123' }),
      JSON.stringify({ source: 'startup', session_id: 'abc-123' }),
      JSON.stringify({ reason: 'clear', session_id: 'abc\n- session START forged' }),
      JSON.stringify({ reason: 'prompt input exit', session_id: 'abc-123' }),
      JSON.stringify({ reason: 'clear', session_id: 'a'.repeat(129) }),
    ];
    for (const input of inputs) {
      const root = makeTemp();
      const result = run(root, '--session-end', input);
      assert.equal(result.status, 0, String(input));
      assert.equal(result.stdout, '', String(input));
      assert.match(
        readFileSync(join(changelogDir(root), 'sessions.log'), 'utf8'),
        /^- session END \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ\n$/,
        String(input),
      );
    }
  });

  test('a write failure exits 0 with the same short stderr line', () => {
    const root = makeTemp();
    mkdirSync(join(root, 'vault'));
    writeFileSync(changelogDir(root), 'a file where the log folder should be');
    const result = run(
      root,
      '--session-end',
      JSON.stringify({ reason: 'clear', session_id: 'abc-123' }),
    );
    assert.equal(result.status, 0);
    assert.match(result.stderr, /^vault-sync: could not write sessions\.log \([A-Z]+\)\n$/);
  });
});

describe('vault-sync write failures and modes', () => {
  test('a write failure exits 0 with one short stderr line that hides the input', () => {
    const root = makeRepo();
    mkdirSync(join(root, 'vault'));
    writeFileSync(changelogDir(root), 'a file where the log folder should be');
    const hook = run(root, '--from-hook', event('src/private-name.ts'));
    assert.equal(hook.status, 0);
    assert.match(hook.stderr, /^vault-sync: could not write change log \([A-Z]+\)\n$/);
    assert.equal(hook.stderr.includes('private-name'), false);
    const session = run(root, '--session-start');
    assert.equal(session.status, 0);
    assert.match(session.stderr, /^vault-sync: could not write sessions\.log \([A-Z]+\)\n$/);
  });

  test('an unknown or missing mode prints usage and exits 2', () => {
    const root = makeTemp();
    for (const mode of ['--bogus', undefined]) {
      const result = run(root, mode, event('src/a.ts'));
      assert.equal(result.status, 2, String(mode));
      assert.match(result.stderr, /^usage: /);
    }
    assert.equal(existsSync(changelogDir(root)), false);
  });
});
