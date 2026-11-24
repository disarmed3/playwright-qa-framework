// Isolated checks for the Git integration of the spec notes (Week 2 Task 11, stage 2): the real
// .husky/pre-commit and .husky/pre-push, scripts/hooks/pre-commit-notes.mjs and
// `vault-sync.mjs --write --stage`. node:test; no browser, no network (the push goes to a bare
// repository in a temp folder).
//
// The disposable repository, and how this file proves it is the one used:
//   - Each case copies this project's own files into a new temp folder: the list comes from
//     `git ls-files --cached --others --exclude-standard`, so ignored files (.env*, .auth/, keys,
//     node_modules) are never copied, and a check refuses any such name anyway.
//   - The real node_modules is linked in as a directory junction (used read-only: nothing is
//     installed, nothing is downloaded). The husky wrapper folder .husky/_ is copied.
//   - `git init` and one initial commit run there before core.hooksPath=.husky/_ is set in that
//     repository only; every later commit and push runs the copied hooks for real.
//   - Git runs with an empty global config, no system config and GIT_CEILING_DIRECTORIES, so it
//     cannot see the real repository or the user's settings; HUSKY is removed from the environment.
//   - Every case asserts `git rev-parse --show-toplevel` is the temp folder before acting.
//   - before()/after(): the real repository's HEAD, index, status and the hashes of its tests/,
//     pages/, vault/ (minus _changelog), scripts/, safety-tests/, .husky/ (minus _) and evidence/
//     must be identical. after() unlinks each junction first (never a recursive delete through it),
//     checks the real node_modules is intact, then removes the temp folders.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const PROJECT = fileURLToPath(new URL('..', import.meta.url));
const HOME = 'tests/blog/home.smoke.spec.ts';
const HOME_NOTE = 'vault/tests/blog/home.smoke.md';
const CATEGORIES = 'tests/blog/categories.smoke.spec.ts';
const CATEGORIES_NOTE = 'vault/tests/blog/categories.smoke.md';
// Changed 2026-11-24 (owner's approval; evidence/week6-checks.md in tag week6-end, "Logins to the environment"): the tracked
// `.env.example` (names only, empty values) is exempt, as in .gitignore, the secret scan and the edit guard.
// `.env`, `.env.local` and every other `.env.*` name still stop the copy.
const SECRET_NAMES =
  /(^|\/)(\.env($|\.(?!example$))|\.auth\/|id_rsa|id_ed25519)|\.(pem|key|p12)$|storage-?state/i;

const temps = [];
const junctions = [];
let EMPTY_GITCONFIG;
let realBefore;

/** An environment with nothing that could point at the real repository or the user's Git setup. */
function isolatedEnv(root) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    const upper = key.toUpperCase();
    if (['CLAUDE_PROJECT_DIR', 'VAULT_SYNC_ROOT', 'HUSKY', 'ALLOW_MAIN_PUSH'].includes(upper))
      continue;
    if (upper.startsWith('GIT_')) continue;
    env[key] = value;
  }
  return {
    ...env,
    GIT_CONFIG_GLOBAL: EMPTY_GITCONFIG,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CEILING_DIRECTORIES: dirname(root),
  };
}

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, env: isolatedEnv(root), encoding: 'utf8' });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    output: result.stdout + result.stderr,
  };
}

function gitOk(root, ...args) {
  const result = git(root, ...args);
  assert.equal(result.status, 0, `git ${args.join(' ')}\n${result.output}`);
  return result.stdout;
}

/** Read-only Git on the real repository (no optional locks, so not even the index stat cache). */
function realGit(...args) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_')) delete env[key];
  const result = spawnSync('git', ['--no-optional-locks', ...args], {
    cwd: PROJECT,
    env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function hashes(base, folders, skip) {
  const found = {};
  const walk = (rel) => {
    if (skip.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))) return;
    const abs = join(base, rel);
    if (!existsSync(abs)) return;
    if (statSync(abs).isDirectory()) {
      for (const name of readdirSync(abs).sort()) walk(`${rel}/${name}`);
    } else {
      found[rel] = createHash('sha256').update(readFileSync(abs)).digest('hex');
    }
  };
  for (const folder of folders) walk(folder);
  return found;
}

const realState = () => ({
  head: realGit('rev-parse', 'HEAD'),
  index: realGit('ls-files', '-s'),
  status: realGit('status', '--porcelain=v1', '--untracked-files=all'),
  files: hashes(
    PROJECT,
    ['tests', 'pages', 'vault', 'scripts', 'safety-tests', '.husky', 'evidence'],
    ['vault/_changelog', '.husky/_'],
  ),
});

before(() => {
  realBefore = realState();
  EMPTY_GITCONFIG = join(makeTemp('vault-git-config-'), 'empty.gitconfig');
  writeFileSync(EMPTY_GITCONFIG, '');
});

after(() => {
  for (const link of junctions) {
    unlinkSync(link);
    assert.equal(existsSync(link), false, `junction removed: ${link}`);
  }
  assert.ok(
    existsSync(join(PROJECT, 'node_modules', 'typescript', 'package.json')),
    'real node_modules intact',
  );
  assert.deepEqual(realState(), realBefore, 'the real repository must not change');
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  for (const dir of temps) assert.equal(existsSync(dir), false, `temp folder removed: ${dir}`);
});

function makeTemp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  assert.ok(relative(PROJECT, dir).startsWith('..') || /^[A-Za-z]:/.test(relative(PROJECT, dir)));
  return dir;
}

/**
 * A disposable copy of the project as a Git repository with the real hooks switched on.
 * autocrlf 'true' (as in this project's own clone): the index holds LF and every tracked file is
 * checked out again, so the working copy has CRLF.
 */
function makeRepo({ autocrlf = 'false' } = {}) {
  const root = makeTemp('vault-git-repo-');
  const files = realGit('ls-files', '-z', '--cached', '--others', '--exclude-standard')
    .split('\0')
    .filter((file) => file !== '' && existsSync(join(PROJECT, file)));
  assert.ok(files.length > 50, 'the project file list was read');
  for (const file of files) {
    assert.equal(SECRET_NAMES.test(file), false, `never copy ${file}`);
    mkdirSync(join(root, dirname(file)), { recursive: true });
    copyFileSync(join(PROJECT, file), join(root, file));
  }
  mkdirSync(join(root, '.husky', '_'), { recursive: true });
  for (const name of readdirSync(join(PROJECT, '.husky', '_'))) {
    copyFileSync(join(PROJECT, '.husky', '_', name), join(root, '.husky', '_', name));
  }
  symlinkSync(join(PROJECT, 'node_modules'), join(root, 'node_modules'), 'junction');
  junctions.push(join(root, 'node_modules'));
  writeFileSync(join(root, 'other.txt'), 'other v1\n');
  // A POSIX shell passes the trailing CR of a CRLF hook script into the command's arguments ("Cannot
  // find module '...\r'" on Linux CI); Git for Windows' own sh tolerates it. Windows keeps this
  // project's setup unchanged (CRLF hooks). Elsewhere the disposable repository tells Git that the two
  // hook scripts are LF files, so the autocrlf=true checkout writes them with LF and the repository
  // stays clean. Only the hooks change: the notes and specs this group asserts on stay CRLF.
  if (process.platform !== 'win32') {
    appendFileSync(
      join(root, '.gitattributes'),
      '\n.husky/pre-commit text eol=lf\n.husky/pre-push text eol=lf\n',
    );
  }

  gitOk(root, 'init', '-q', '-b', 'feature');
  gitOk(root, 'config', 'user.name', 'Test Author');
  gitOk(root, 'config', 'user.email', 'test-author@example.invalid');
  gitOk(root, 'config', 'core.autocrlf', autocrlf);
  const add = spawnSync(
    'git',
    ['--literal-pathspecs', 'add', '--pathspec-from-file=-', '--pathspec-file-nul'],
    { cwd: root, env: isolatedEnv(root), input: [...files, 'other.txt'].join('\0') },
  );
  assert.equal(add.status, 0, String(add.stderr));
  gitOk(root, 'commit', '-q', '-m', 'initial copy');
  if (autocrlf === 'true') {
    for (const file of [...files, 'other.txt']) rmSync(join(root, file));
    gitOk(root, 'checkout', '-q', '--', '.');
    assert.ok(
      readFileSync(join(root, HOME_NOTE), 'utf8').includes('\r\n'),
      'checked out with CRLF',
    );
    assert.equal(gitOk(root, 'status', '--porcelain', '--untracked-files=no'), '', 'and clean');
  }
  gitOk(root, 'config', 'core.hooksPath', '.husky/_');

  const top = gitOk(root, 'rev-parse', '--show-toplevel').trim();
  assert.equal(relative(top, root), '', 'the repository is the temp folder');
  assert.equal(gitOk(root, 'remote'), '', 'no remote');
  // Same hook text; with autocrlf=true the copy is checked out with CRLF.
  const lf = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(lf(join(root, '.husky/pre-commit')), lf(join(PROJECT, '.husky/pre-commit')));
  if (autocrlf === 'false') {
    assert.deepEqual(
      readFileSync(join(root, '.husky/pre-commit')),
      readFileSync(join(PROJECT, '.husky/pre-commit')),
    );
  }
  assert.ok(
    lstatSync(join(root, 'node_modules')).isSymbolicLink(),
    'node_modules is a link, not an install',
  );
  return root;
}

const read = (root, rel) => readFileSync(join(root, rel));
const readText = (root, rel) => readFileSync(join(root, rel), 'utf8');
const put = (root, rel, content) => {
  mkdirSync(join(root, dirname(rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
};

/** Index, staged, unstaged, untracked and HEAD, for "nothing changed" comparisons. */
const gitState = (root) => ({
  head: gitOk(root, 'rev-parse', 'HEAD'),
  index: gitOk(root, 'ls-files', '-s'),
  staged: gitOk(root, 'diff', '--cached', '--name-status'),
  unstaged: gitOk(root, 'diff', '--name-status'),
  untracked: gitOk(root, 'ls-files', '--others', '--exclude-standard'),
});

const commit = (root, message = 'change') => git(root, 'commit', '-m', message);
const vaultSync = (root, ...args) =>
  spawnSync(process.execPath, [join(root, 'scripts/vault-sync.mjs'), ...args], {
    cwd: root,
    env: { ...isolatedEnv(root), VAULT_SYNC_ROOT: root },
    encoding: 'utf8',
  });

// ---------------------------------------------------------------------------------------------

describe('pre-commit refuses unsafe staging before anything is written', () => {
  test('a partially staged spec', () => {
    const root = makeRepo();
    put(root, HOME, `${readText(root, HOME)}// staged part\n`);
    gitOk(root, 'add', '--', HOME);
    put(root, HOME, `${readText(root, HOME)}// unstaged part\n`);
    const before = { state: gitState(root), note: read(root, HOME_NOTE), spec: read(root, HOME) };

    const result = commit(root);
    assert.notEqual(result.status, 0);
    assert.match(
      result.output,
      /pre-commit-notes: BLOCKED — tests\/blog\/home\.smoke\.spec\.ts: partially staged/,
    );
    assert.match(result.output, /pre-commit-notes: nothing was written or staged/);
    assert.equal(result.output.includes('lint-staged'), false, 'lint-staged never ran');
    assert.deepEqual(gitState(root), before.state);
    assert.deepEqual(read(root, HOME_NOTE), before.note);
    assert.deepEqual(read(root, HOME), before.spec);
  });

  test('a related note with unstaged edits outside the block', () => {
    const root = makeRepo();
    put(root, HOME, `${readText(root, HOME)}// change\n`);
    gitOk(root, 'add', '--', HOME);
    appendFileSync(join(root, HOME_NOTE), '\nUnstaged hand-written line.\n');
    const before = { state: gitState(root), note: read(root, HOME_NOTE) };

    const result = commit(root);
    assert.notEqual(result.status, 0);
    assert.match(
      result.output,
      /BLOCKED — vault\/tests\/blog\/home\.smoke\.md: unstaged edits outside the generated block/,
    );
    assert.deepEqual(gitState(root), before.state);
    assert.deepEqual(read(root, HOME_NOTE), before.note);
  });

  test('an existing untracked note with human text needs review; after git add it is committed', () => {
    const root = makeRepo();
    const spec = 'tests/blog/extra.smoke.spec.ts';
    const note = 'vault/tests/blog/extra.smoke.md';
    put(root, spec, readText(root, HOME).replace('blog home smoke', 'blog extra smoke'));
    assert.equal(vaultSync(root, '--write', '--files', spec).status, 0);
    appendFileSync(join(root, note), '\nHuman explanation written before review.\n');
    gitOk(root, 'add', '--', spec);
    const before = { state: gitState(root), note: read(root, note) };

    const refused = commit(root);
    assert.notEqual(refused.status, 0);
    assert.match(
      refused.output,
      /BLOCKED — vault\/tests\/blog\/extra\.smoke\.md: untracked note with hand-written text; review it and git add it first/,
    );
    assert.deepEqual(gitState(root), before.state);
    assert.deepEqual(read(root, note), before.note);

    gitOk(root, 'add', '--', note); // the reviewed note
    const accepted = commit(root);
    assert.equal(accepted.status, 0, accepted.output);
    assert.ok(
      gitOk(root, 'show', `HEAD:${note}`).includes('Human explanation written before review.'),
    );
  });

  test('a note deleted on disk but not staged', () => {
    const root = makeRepo();
    put(root, HOME, `${readText(root, HOME)}// change\n`);
    gitOk(root, 'add', '--', HOME);
    rmSync(join(root, HOME_NOTE));
    const before = gitState(root);
    const result = commit(root);
    assert.notEqual(result.status, 0);
    assert.match(
      result.output,
      /BLOCKED — vault\/tests\/blog\/home\.smoke\.md: deleted in the working copy, but the deletion is not staged/,
    );
    assert.deepEqual(gitState(root), before);
    assert.equal(existsSync(join(root, HOME_NOTE)), false, 'not recreated');
  });
});

describe('a normal commit formats, refreshes and stages only the intended notes', () => {
  test('spec formatted by lint-staged, note refreshed and staged, unrelated work untouched', () => {
    const root = makeRepo();
    // Unrelated work: one staged file, one unstaged change, one untracked file.
    put(root, 'notes.txt', 'unrelated staged\n');
    gitOk(root, 'add', '--', 'notes.txt');
    put(root, 'other.txt', 'other v2 unstaged\n');
    put(root, 'scratch.txt', 'untracked\n');
    // The spec change: a renamed title and a double-quoted string that Prettier will rewrite.
    const original = readText(root, HOME);
    const edited = original
      .replace(
        "'the banner is visible and identifies DEVELOPMENT'",
        '"the banner is visible and names DEVELOPMENT"',
      )
      .replace("toHaveText('DEVELOPMENT')", 'toHaveText("DEVELOPMENT")');
    assert.notEqual(edited, original);
    put(root, HOME, edited);
    gitOk(root, 'add', '--', HOME);

    const result = commit(root, 'rename the banner test');
    assert.equal(result.status, 0, result.output);
    const order = [
      'secret-scan: ',
      'pre-commit-notes: preflight ok',
      'vault-sync: staged vault/tests/blog/home.smoke.md',
      '--check: 1 spec path(s), 1 fresh',
    ].map((marker) => result.output.indexOf(marker));
    assert.ok(
      order.every((at) => at >= 0),
      result.output,
    );
    assert.deepEqual(
      [...order].sort((a, b) => a - b),
      order,
      'steps ran in order',
    );

    const committed = gitOk(root, 'show', '--name-only', '--format=', 'HEAD')
      .trim()
      .split('\n')
      .sort();
    assert.deepEqual(committed, ['notes.txt', HOME, HOME_NOTE].sort());
    const headSpec = gitOk(root, 'show', `HEAD:${HOME}`);
    assert.ok(headSpec.includes("test('the banner is visible and names DEVELOPMENT'"), 'formatted');
    assert.ok(headSpec.includes("toHaveText('DEVELOPMENT')"));
    assert.equal(headSpec.includes('"'), false, 'no double quotes left');
    const headNote = gitOk(root, 'show', `HEAD:${HOME_NOTE}`);
    assert.ok(headNote.includes('    - `the banner is visible and names DEVELOPMENT`'));
    assert.ok(headNote.includes('## About this test'), 'the explanation is still there');
    assert.equal(vaultSync(root, '--check').status, 0);

    assert.equal(gitOk(root, 'show', 'HEAD:notes.txt'), 'unrelated staged\n');
    assert.equal(readText(root, 'other.txt'), 'other v2 unstaged\n');
    assert.equal(gitOk(root, 'show', 'HEAD:other.txt'), 'other v1\n');
    assert.equal(gitOk(root, 'diff', '--name-only'), 'other.txt\n');
    assert.equal(gitOk(root, 'diff', '--cached', '--name-only'), '');
    assert.ok(
      gitOk(root, 'ls-files', '--others', '--exclude-standard').split('\n').includes('scratch.txt'),
    );
  });

  test('a block-only refresh left unstaged by the edit hook is accepted and staged', () => {
    const root = makeRepo();
    put(root, HOME, `${readText(root, HOME)}// change\n`);
    gitOk(root, 'add', '--', HOME);
    assert.equal(vaultSync(root, '--write', '--files', HOME).status, 0); // as --from-hook would
    assert.equal(gitOk(root, 'diff', '--name-only'), `${HOME_NOTE}\n`);
    const result = commit(root);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /vault-sync: staged vault\/tests\/blog\/home\.smoke\.md/);
    assert.equal(gitOk(root, 'status', '--porcelain', '--', HOME, HOME_NOTE), '');
  });

  test('paths containing spaces', () => {
    const root = makeRepo();
    const spec = 'tests/my folder/a b.smoke.spec.ts';
    const note = 'vault/tests/my folder/a b.smoke.md';
    put(root, spec, readText(root, HOME).replace('blog home smoke', 'spaced smoke'));
    gitOk(root, 'add', '--', spec);
    const result = commit(root, 'spec with spaces');
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /vault-sync: created vault\/tests\/my folder\/a b\.smoke\.md/);
    assert.match(result.output, /vault-sync: staged vault\/tests\/my folder\/a b\.smoke\.md/);
    const committed = gitOk(root, 'show', '--name-only', '--format=', '-z', 'HEAD')
      .split('\0')
      .filter(Boolean)
      .sort();
    assert.deepEqual(committed, [spec, note].sort());
    assert.ok(
      gitOk(root, 'show', `HEAD:${note}`).includes(
        '[tests/my folder/a b.smoke.spec.ts](../../../tests/my%20folder/a%20b.smoke.spec.ts)',
      ),
    );
    const linksRun = spawnSync(process.execPath, [join(root, 'scripts/vault-links.mjs')], {
      cwd: root,
      env: { ...isolatedEnv(root), VAULT_SYNC_ROOT: root },
      encoding: 'utf8',
    });
    assert.equal(linksRun.status, 0, linksRun.stdout);
    assert.match(
      linksRun.stdout,
      /warning vault\/tests\/my folder\/a b\.smoke\.md: no other note links to it/,
    );
  });
});

describe('deleted and renamed specs need reviewed cleanup of the old note', () => {
  test('rename: refused while the old note is there; after git mv to an archive, committed', () => {
    const root = makeRepo();
    const renamed = 'tests/blog/home-page.smoke.spec.ts';
    const newNote = 'vault/tests/blog/home-page.smoke.md';
    gitOk(root, 'mv', '--', HOME, renamed);
    const before = gitState(root);

    const refused = commit(root);
    assert.notEqual(refused.status, 0);
    assert.match(
      refused.output,
      /BLOCKED — renamed tests\/blog\/home\.smoke\.spec\.ts -> tests\/blog\/home-page\.smoke\.spec\.ts: the old note vault\/tests\/blog\/home\.smoke\.md is still there; review it/,
    );
    assert.deepEqual(gitState(root), before);
    assert.equal(existsSync(join(root, newNote)), false, 'no new note before the cleanup');

    mkdirSync(join(root, 'vault/_raw/archived-tests'), { recursive: true });
    gitOk(root, 'mv', '--', HOME_NOTE, 'vault/_raw/archived-tests/home.smoke.md');
    const accepted = commit(root, 'rename home spec');
    assert.equal(accepted.status, 0, accepted.output);
    const tree = gitOk(root, 'ls-tree', '-r', '--name-only', 'HEAD').split('\n');
    assert.ok(tree.includes(renamed) && tree.includes(newNote));
    assert.ok(
      tree.includes('vault/_raw/archived-tests/home.smoke.md'),
      'old note archived, not erased',
    );
    assert.equal(tree.includes(HOME) || tree.includes(HOME_NOTE), false);
    assert.ok(
      gitOk(root, 'show', 'HEAD:vault/_raw/archived-tests/home.smoke.md').includes(
        '## About this test',
      ),
      'human text kept in the archive',
    );
  });

  test('delete: refused while the old note is there; after git rm of the note, committed', () => {
    const root = makeRepo();
    gitOk(root, 'rm', '-q', '--', CATEGORIES);
    const before = gitState(root);
    const refused = commit(root);
    assert.notEqual(refused.status, 0);
    assert.match(
      refused.output,
      /BLOCKED — deleted tests\/blog\/categories\.smoke\.spec\.ts: the old note vault\/tests\/blog\/categories\.smoke\.md is still there/,
    );
    assert.deepEqual(gitState(root), before);

    gitOk(root, 'rm', '-q', '--', CATEGORIES_NOTE); // reviewed removal
    const accepted = commit(root, 'drop categories spec');
    assert.equal(accepted.status, 0, accepted.output);
    const tree = gitOk(root, 'ls-tree', '-r', '--name-only', 'HEAD').split('\n');
    assert.equal(tree.includes(CATEGORIES) || tree.includes(CATEGORIES_NOTE), false);
    assert.equal(
      vaultSync(root, '--check', '--files', CATEGORIES).status,
      0,
      'absent spec + absent note',
    );
  });
});

describe('pre-push runs the existing checks, then the note and link checks', () => {
  test('a broken vault link stops the push; after the repair the push goes through', () => {
    const root = makeRepo();
    const remote = makeTemp('vault-git-remote-');
    gitOk(remote, 'init', '-q', '--bare');
    gitOk(root, 'remote', 'add', 'origin', remote);
    const context = readText(root, 'vault/_context.md');
    // Changed 2026-11-24 (owner's approval, demo cleanup): the test adds its own broken link instead of
    // rewriting an existing one, so it no longer depends on a link that a note edit can remove.
    put(root, 'vault/_context.md', `${context}\n[missing note](../evidence/missing-note.md)\n`);

    const refused = git(root, 'push', 'origin', 'HEAD:refs/heads/feature');
    assert.notEqual(refused.status, 0);
    for (const step of [
      'tsc --noEmit',
      'check-env-gates: ',
      'vault-sync: --check:',
      'vault-links: ',
    ]) {
      assert.ok(refused.output.includes(step), `ran: ${step}`);
    }
    // The listing ran; its count changes whenever a test is added (owner-approved, Week 3 Task 05).
    assert.match(refused.output, /^Total: \d+ tests? in \d+ files?$/m, 'ran: the test listing');
    assert.match(
      refused.output,
      /vault-links: broken vault\/_context\.md:\d+: \.\.\/evidence\/missing-note\.md \(target does not exist\)/,
    );
    assert.equal(gitOk(remote, 'branch', '--list', 'feature'), '', 'nothing pushed');

    put(root, 'vault/_context.md', context);
    const accepted = git(root, 'push', 'origin', 'HEAD:refs/heads/feature');
    assert.equal(accepted.status, 0, accepted.output);
    assert.match(accepted.output, /vault-links: .* 0 broken/);
    assert.equal(gitOk(remote, 'rev-parse', 'feature'), gitOk(root, 'rev-parse', 'HEAD'));
  });

  test('a spec without its runIfEnv declaration stops the push at check:env-gates', () => {
    const root = makeRepo();
    const remote = makeTemp('vault-git-remote-');
    gitOk(remote, 'init', '-q', '--bare');
    gitOk(root, 'remote', 'add', 'origin', remote);
    const spec = readText(root, HOME);
    assert.match(spec, /runIfEnv\(test, \['dev'\]\);/);
    put(root, HOME, spec.replace(/runIfEnv\(test, \['dev'\]\);/, ''));
    const refused = git(root, 'push', 'origin', 'HEAD:refs/heads/feature');
    assert.notEqual(refused.status, 0);
    assert.match(refused.output, /home\.smoke\.spec\.ts:\d+:\d+ E_MISSING_DECL/);
    assert.equal(refused.output.includes('vault-sync: '), false, 'stopped before the note check');
    assert.equal(gitOk(remote, 'branch', '--list', 'feature'), '', 'nothing pushed');
  });

  test('a stale note stops the push at vault:check', () => {
    const root = makeRepo();
    const remote = makeTemp('vault-git-remote-');
    gitOk(remote, 'init', '-q', '--bare');
    gitOk(root, 'remote', 'add', 'origin', remote);
    put(root, HOME, `${readText(root, HOME)}// unrefreshed change\n`);
    const refused = git(root, 'push', 'origin', 'HEAD:refs/heads/feature');
    assert.notEqual(refused.status, 0);
    assert.match(
      refused.output,
      /vault-sync: stale vault\/tests\/blog\/home\.smoke\.md: source changed/,
    );
    assert.equal(
      refused.output.includes('vault-links: root'),
      false,
      'stopped before the link check',
    );
    assert.equal(gitOk(remote, 'branch', '--list', 'feature'), '');
  });
});

describe('core.autocrlf=true: LF in the index, CRLF in the working copy (this project setup)', () => {
  const bareLf = (text) => /[^\r]\n/.test(text) || text.startsWith('\n');

  test('a normal commit refreshes and stages the note; the working copy keeps CRLF', () => {
    const root = makeRepo({ autocrlf: 'true' });
    const spec = readText(root, HOME);
    assert.ok(spec.includes('\r\n'));
    put(root, HOME, spec.replace('identifies DEVELOPMENT', 'names DEVELOPMENT'));
    gitOk(root, 'add', '--', HOME);

    const result = commit(root, 'crlf rename');
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /vault-sync: staged vault\/tests\/blog\/home\.smoke\.md/);
    const committed = gitOk(root, 'show', '--name-only', '--format=', 'HEAD')
      .trim()
      .split('\n')
      .sort();
    assert.deepEqual(committed, [HOME, HOME_NOTE].sort());
    const headNote = gitOk(root, 'show', `HEAD:${HOME_NOTE}`);
    assert.ok(headNote.includes('    - `the banner is visible and names DEVELOPMENT`'));
    assert.equal(headNote.includes('\r'), false, 'the index holds LF');
    const diskNote = readText(root, HOME_NOTE);
    assert.equal(bareLf(diskNote), false, 'the working copy keeps CRLF, block included');
    assert.ok(diskNote.includes('## About this test'), 'explanation kept');
    assert.equal(gitOk(root, 'status', '--porcelain', '--', HOME, HOME_NOTE), '');
    assert.equal(vaultSync(root, '--check').status, 0);
  });

  test('a block-only refresh left unstaged is accepted (CR differences are not hand edits)', () => {
    const root = makeRepo({ autocrlf: 'true' });
    put(root, HOME, `${readText(root, HOME)}// change\r\n`);
    gitOk(root, 'add', '--', HOME);
    assert.equal(vaultSync(root, '--write', '--files', HOME).status, 0);
    assert.equal(gitOk(root, 'diff', '--name-only'), `${HOME_NOTE}\n`);
    const result = commit(root);
    assert.equal(result.status, 0, result.output);
    assert.equal(gitOk(root, 'status', '--porcelain', '--', HOME, HOME_NOTE), '');
  });

  test('an unstaged CRLF hand edit outside the block is still refused before writes', () => {
    const root = makeRepo({ autocrlf: 'true' });
    put(root, HOME, `${readText(root, HOME)}// change\r\n`);
    gitOk(root, 'add', '--', HOME);
    appendFileSync(join(root, HOME_NOTE), '\r\nUnstaged hand-written line.\r\n');
    const before = { state: gitState(root), note: read(root, HOME_NOTE) };
    const result = commit(root);
    assert.notEqual(result.status, 0);
    assert.match(
      result.output,
      /BLOCKED — vault\/tests\/blog\/home\.smoke\.md: unstaged edits outside the generated block/,
    );
    assert.deepEqual(gitState(root), before.state);
    assert.deepEqual(read(root, HOME_NOTE), before.note);
  });
});
