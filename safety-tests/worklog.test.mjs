// Isolated checks for scripts/hooks/session-preflight.mjs and scripts/hooks/stop-worklog.mjs
// (Week 2 Task 07). node:test, no browser, no network.
// Every case runs the real script by absolute path inside its own temporary project, selected with
// CLAUDE_PROJECT_DIR and the working folder, with Git pointed at an empty global config and stopped
// from searching above the temporary folder, so the real project and the user's Git settings cannot
// leak in. Deliberate failures (bad input, no repository, no Git) run only in temporary projects.

import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const PREFLIGHT = fileURLToPath(new URL('../scripts/hooks/session-preflight.mjs', import.meta.url));
const WORKLOG = fileURLToPath(new URL('../scripts/hooks/stop-worklog.mjs', import.meta.url));
const BLOCKED = 'worklog: BLOCKED — ';
const SLUG = 'test-author';
const temps = [];
let emptyGitConfig;

before(() => {
  const dir = mkdtempSync(join(tmpdir(), 'worklog-gitconfig-'));
  temps.push(dir);
  emptyGitConfig = join(dir, 'empty.gitconfig');
  writeFileSync(emptyGitConfig, '');
});

after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function makeTemp() {
  const dir = mkdtempSync(join(tmpdir(), 'worklog-'));
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
    CLAUDE_PROJECT_DIR: root,
    GIT_CONFIG_GLOBAL: emptyGitConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CEILING_DIRECTORIES: dirname(root),
    TZ: 'UTC',
    ...extra,
  };
}

function git(cwd, args, extra = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: isolatedEnv(cwd, extra) }).trim();
}

/** Temporary repository on branch main with a local test author; `name: null` sets no name. */
function makeRepo({ name = 'Test Author' } = {}) {
  const root = makeTemp();
  git(root, ['init', '-q']);
  git(root, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  if (name !== null) git(root, ['config', 'user.name', name]);
  git(root, ['config', 'user.email', 'test-author@example.invalid']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  return root;
}

function put(root, relative, content = 'x\n') {
  const file = join(root, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** Commits everything with author and committer time `seconds` (Unix time). */
function commitAll(root, seconds = Math.floor(Date.now() / 1000)) {
  const date = `@${seconds} +0000`;
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'test commit'], {
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
  });
}

function run(script, root, { args = [], input = '', env = {} } = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    input,
    encoding: 'utf8',
    env: isolatedEnv(root, env),
    timeout: 20000,
    windowsHide: true,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** YYYY-MM-DD for now in a time zone. */
function dateIn(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function stopEvent(extra = {}) {
  return JSON.stringify({
    session_id: 'test-session',
    hook_event_name: 'Stop',
    stop_hook_active: false,
    ...extra,
  });
}

function journal(date = dateIn('UTC'), slug = SLUG) {
  return `vault/12-progress-report/${slug}/${date}.md`;
}

function stop(root, input = stopEvent(), env = {}) {
  return run(WORKLOG, root, { input, env });
}

function preflightLines(root, options) {
  const result = run(PREFLIGHT, root, options);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.ok(result.stdout.endsWith('\n'));
  const lines = result.stdout.slice(0, -1).split('\n');
  assert.equal(lines.length, 5);
  return lines;
}

/** Every file outside .git with its bytes, to prove a run wrote nothing. */
function snapshot(root) {
  const files = {};
  const walk = (relative) => {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (child === '.git') continue;
      if (entry.isDirectory()) walk(child);
      else files[child] = readFileSync(join(root, child)).toString('base64');
    }
  };
  walk('');
  return { files, status: git(root, ['status', '--porcelain', '--untracked-files=all']) };
}

/** Etc/GMT zone name for a whole-hour offset east of UTC (the Etc sign is inverted). */
function etcZone(offset) {
  if (offset === 0) return 'Etc/GMT';
  return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

/** A fixed-offset zone (UTC-12..UTC+14) whose local hour is `hour` right now. */
function zoneAtLocalHour(hour) {
  let offset = (hour - new Date().getUTCHours() + 48) % 24;
  if (offset > 14) offset -= 24;
  return etcZone(offset);
}

describe('session-preflight: five-line summary', () => {
  test('clean empty repository → 5 lines, branch main, 0 files, none yet; stdin ignored', () => {
    const root = makeRepo();
    const before = dateIn('UTC');
    const lines = preflightLines(root, { input: 'not json' });
    assert.ok([before, dateIn('UTC')].includes(lines[0].slice('Date: '.length)), lines[0]);
    assert.match(lines[0], /^Date: \d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(lines.slice(1), [
      'Branch: main',
      'Uncommitted files: 0',
      'Latest journal: none yet',
      'Map: vault/_map.md',
    ]);
  });

  test('nested untracked files count one by one; modified, staged, renamed count once', () => {
    const root = makeRepo();
    put(root, 'a.ts');
    put(root, 'b.ts');
    commitAll(root);
    put(root, 'a.ts', 'changed\n');
    git(root, ['mv', 'b.ts', 'b2.ts']);
    put(root, 's.ts');
    git(root, ['add', 's.ts']);
    put(root, 'a/b/c/x.ts');
    put(root, 'a/b/y.txt');
    put(root, 'new dir/ü q.md');
    const lines = preflightLines(root);
    assert.equal(lines[2], 'Uncommitted files: 6');
  });

  test('latest journal: newest file-name date anywhere below, ties by path, other names ignored', () => {
    const root = makeRepo();
    const base = 'vault/12-progress-report';
    put(root, `${base}/alice/2026-10-20.md`);
    put(root, `${base}/carol/2026-10-21.md`);
    put(root, `${base}/bob/2026-10-21.md`);
    put(root, `${base}/bob/deep/x/2026-10-19.md`);
    put(root, `${base}/alice/notes.md`);
    put(root, `${base}/alice/2026-10-2.md`);
    put(root, `${base}/alice/2026-12-31.md.bak`);
    mkdirSync(join(root, base, 'zed', '2026-12-31.md'), { recursive: true });
    put(root, 'vault/other/2026-12-31.md');
    const lines = preflightLines(root);
    assert.equal(lines[3], `Latest journal: ${base}/bob/2026-10-21.md`);
  });

  test('a nested journal can be the newest', () => {
    const root = makeRepo();
    put(root, 'vault/12-progress-report/alice/2026-10-20.md');
    put(root, 'vault/12-progress-report/bob/deep/2026-10-22.md');
    const lines = preflightLines(root);
    assert.equal(lines[3], 'Latest journal: vault/12-progress-report/bob/deep/2026-10-22.md');
  });

  test('not a Git repository → no-branch and unknown, exit 0', () => {
    const root = makeTemp();
    const probe = spawnSync('git', ['rev-parse', '--git-dir'], {
      cwd: root,
      env: isolatedEnv(root),
    });
    assert.notEqual(probe.status, 0, 'the temporary folder must not be inside a repository');
    const lines = preflightLines(root);
    assert.equal(lines[1], 'Branch: no-branch');
    assert.equal(lines[2], 'Uncommitted files: unknown');
  });

  test('detached HEAD → no-branch', () => {
    const root = makeRepo();
    put(root, 'a.ts');
    commitAll(root);
    git(root, ['checkout', '-q', '--detach']);
    const lines = preflightLines(root);
    assert.equal(lines[1], 'Branch: no-branch');
  });

  test('Git not available → no-branch and unknown, exit 0', () => {
    const root = makeRepo();
    const lines = preflightLines(root, { env: { PATH: '' } });
    assert.equal(lines[1], 'Branch: no-branch');
    assert.equal(lines[2], 'Uncommitted files: unknown');
  });

  test('date is the local calendar date of the time zone', () => {
    const root = makeRepo();
    for (const timeZone of ['Etc/GMT-14', 'Etc/GMT+12']) {
      const before = dateIn(timeZone);
      const lines = preflightLines(root, { env: { TZ: timeZone } });
      assert.ok([before, dateIn(timeZone)].includes(lines[0].slice('Date: '.length)), timeZone);
    }
  });
});

describe('stop-worklog --path and slug', () => {
  const cases = [
    ['Test Author', 'test-author'],
    ["  Ana-María  O'Brien ", 'ana-mar-a-o-brien'],
    ['--QA__Bot 2--', 'qa-bot-2'],
    ['___', 'student'],
    ['Τάσος', 'student'],
    [null, 'student'],
  ];
  for (const [name, slug] of cases) {
    test(`user.name ${JSON.stringify(name)} → ${slug}`, () => {
      const root = makeRepo({ name });
      const result = run(WORKLOG, root, { args: ['--path'] });
      assert.equal(result.status, 0);
      assert.equal(result.stderr, '');
      assert.equal(result.stdout, `${journal(dateIn('UTC'), slug)}\n`);
    });
  }

  test('local date in the path follows the time zone', () => {
    const root = makeRepo();
    for (const timeZone of ['Etc/GMT-14', 'Etc/GMT+12']) {
      const before = dateIn(timeZone);
      const result = run(WORKLOG, root, { args: ['--path'], env: { TZ: timeZone } });
      const expected = [before, dateIn(timeZone)].map((date) => `${journal(date)}\n`);
      assert.ok(expected.includes(result.stdout), `${timeZone}: ${result.stdout}`);
    }
  });

  test('--path does not read stdin (stdin left open)', async () => {
    const root = makeRepo();
    const child = spawn(process.execPath, [WORKLOG, '--path'], {
      cwd: root,
      env: isolatedEnv(root),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    const code = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve('timed out');
      }, 10000);
      child.on('close', (status) => {
        clearTimeout(timer);
        resolve(status);
      });
    });
    child.stdin.destroy();
    assert.equal(code, 0);
    assert.equal(stdout, `${journal()}\n`);
  });
});

describe('stop-worklog decisions', () => {
  test('clean empty repository → 0', () => {
    const result = stop(makeRepo());
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
  });

  test('activity without a journal → 2, one line naming the --path file and /worklog', () => {
    const root = makeRepo();
    put(root, 'a/b/c/x.ts');
    const path = run(WORKLOG, root, { args: ['--path'] }).stdout.trim();
    const result = stop(root);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.startsWith(BLOCKED), result.stderr);
    assert.ok(result.stderr.includes(` ${path}. `), result.stderr);
    assert.ok(result.stderr.includes('/worklog'));
    assert.ok(result.stderr.includes('(1 changed file)'));
    assert.ok(result.stderr.includes('"## HH:MM" heading'));
    assert.equal(result.stderr.split('\n').length, 2);
    assert.equal(result.stdout, '');
  });

  test("today's journal without a heading → 2", () => {
    const root = makeRepo();
    put(root, 'x.ts');
    put(root, journal(), '# Worklog\n\n- Did: no heading\n');
    assert.equal(stop(root).status, 2);
  });

  test('valid "## HH:MM" heading → 0', () => {
    const root = makeRepo();
    put(root, 'x.ts');
    put(root, journal(), '# Worklog\n\n## 09:05\n- Did: x\n');
    const result = stop(root);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
  });

  test('heading in a file with byte-order marks and CRLF → 0', () => {
    const root = makeRepo();
    put(root, 'x.ts');
    put(root, journal(), '﻿﻿## 23:59\r\n- Did: x\r\n');
    assert.equal(stop(root).status, 0);
  });

  for (const line of [
    '### 09:05',
    ' ## 09:05',
    '## 9:05',
    '## 24:00',
    '## 09:60',
    '## 09:05x',
    '##09:05',
  ]) {
    test(`not a heading: ${JSON.stringify(line)} → 2`, () => {
      const root = makeRepo();
      put(root, 'x.ts');
      put(root, journal(), `# Worklog\n${line}\n`);
      assert.equal(stop(root).status, 2);
    });
  }

  test('retry: stop_hook_active true with activity and no entry → 0', () => {
    const root = makeRepo();
    put(root, 'x.ts');
    const result = stop(root, stopEvent({ stop_hook_active: true }));
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
  });

  test('block, retry, add entry, stop again → 2, 0, 0', () => {
    const root = makeRepo();
    put(root, 'x.ts');
    const first = stop(root).status;
    const retry = stop(root, stopEvent({ stop_hook_active: true })).status;
    put(root, journal(), "# Worklog\n\n## 10:00\n- Did: x\n- Worked / didn't: x\n- Next: x\n");
    const later = stop(root).status;
    assert.deepEqual([first, retry, later], [2, 0, 0]);
  });

  for (const [label, input] of [
    ['empty', ''],
    ['not JSON', 'not json'],
    ['cut-off JSON', '{"stop_hook_active": fal'],
    ['array', '[]'],
    ['null', 'null'],
    ['number', '42'],
    ['string', '"Stop"'],
  ]) {
    test(`malformed input (${label}) with activity and no entry → 0`, () => {
      const root = makeRepo();
      put(root, 'x.ts');
      const result = stop(root, input);
      assert.equal(result.status, 0);
      assert.equal(result.stderr, '');
    });
  }

  test('valid event after three byte-order marks is still read → 2', () => {
    const root = makeRepo();
    put(root, 'x.ts');
    assert.equal(stop(root, `\uFEFF\uFEFF\uFEFF${stopEvent()}`).status, 2);
  });

  for (const file of ['x.ts', 'x.mjs', 'x.json', 'x.md', 'x.sh', 'NOTES.MD', 'deep/new/dir/x.ts']) {
    test(`qualifying change ${file} → 2`, () => {
      const root = makeRepo();
      put(root, file);
      assert.equal(stop(root).status, 2);
    });
  }

  test('only .txt/.png changes and no commit today → 0', () => {
    const root = makeRepo();
    put(root, 'old.ts');
    commitAll(root, Math.floor(Date.now() / 1000) - 3 * 86400);
    put(root, 'notes.txt');
    put(root, 'img/shot.png');
    put(root, 'old.ts.bak');
    assert.equal(stop(root).status, 0);
  });

  test('a staged rename to a qualifying name counts → 2', () => {
    const root = makeRepo();
    put(root, 'a.txt');
    commitAll(root, Math.floor(Date.now() / 1000) - 3 * 86400);
    git(root, ['mv', 'a.txt', 'a.ts']);
    const result = stop(root);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.includes('(1 changed file)'), result.stderr);
  });

  test('clean tree, commit today → 2 naming the commit', () => {
    const root = makeRepo();
    put(root, 'notes.txt');
    commitAll(root);
    const result = stop(root);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.includes('(commit today)'), result.stderr);
  });

  test('clean tree, last commit three days ago → 0', () => {
    const root = makeRepo();
    put(root, 'a.ts');
    commitAll(root, Math.floor(Date.now() / 1000) - 3 * 86400);
    assert.equal(stop(root).status, 0);
  });

  test('commit 20 hours ago: today where it is now 22:00, yesterday where it is now 01:00', () => {
    const root = makeRepo();
    put(root, 'notes.txt');
    commitAll(root, Math.floor(Date.now() / 1000) - 20 * 3600);
    const late = zoneAtLocalHour(22);
    const early = zoneAtLocalHour(1);
    assert.equal(stop(root, stopEvent(), { TZ: late }).status, 2, late);
    assert.equal(stop(root, stopEvent(), { TZ: early }).status, 0, early);
  });

  test("another slug's or another day's journal does not count → 2", () => {
    const root = makeRepo();
    put(root, 'x.ts');
    put(root, journal(dateIn('UTC'), 'someone-else'), '## 09:00\n- Did: x\n');
    put(root, journal('2000-01-01'), '## 09:00\n- Did: x\n');
    assert.equal(stop(root).status, 2);
  });

  test('not a Git repository → 0, nothing on stderr', () => {
    const root = makeTemp();
    put(root, 'x.ts');
    const result = stop(root);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
  });

  test('Git not available → 0, nothing on stderr', () => {
    const root = makeRepo();
    put(root, 'x.ts');
    const result = stop(root, stopEvent(), { PATH: '' });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
  });

  test('no run writes a file: blocked and allowed runs leave the project byte-identical', () => {
    const root = makeRepo();
    put(root, 'x.ts');
    put(root, journal(), '# Worklog\n\n- Did: earlier text, no heading\n');
    const before = snapshot(root);
    assert.equal(stop(root).status, 2);
    assert.equal(stop(root, stopEvent({ stop_hook_active: true })).status, 0);
    assert.equal(run(WORKLOG, root, { args: ['--path'] }).status, 0);
    assert.equal(run(PREFLIGHT, root).status, 0);
    assert.deepEqual(snapshot(root), before);

    put(root, journal(), '# Worklog\n\n## 08:00\n- Did: earlier entry\n');
    const withEntry = snapshot(root);
    assert.equal(stop(root).status, 0);
    assert.deepEqual(snapshot(root), withEntry);
  });
});
