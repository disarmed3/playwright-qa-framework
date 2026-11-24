// Isolated checks for scripts/hooks/secret-scan.mjs (Week 2 Task 08). node:test, no browser, no network.
// Every case runs the real script by absolute path inside its own temporary repository, with Git
// pointed at an empty global config and stopped from searching above the temporary folder, so the
// real project and the user's Git settings cannot leak in. Samples are made-up values whose prefixes
// are assembled from pieces, so this file never contains a marker whole and stays scanned itself.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCAN = fileURLToPath(new URL('../scripts/hooks/secret-scan.mjs', import.meta.url));
const GUARD = fileURLToPath(new URL('../scripts/hooks/guard.mjs', import.meta.url));
const THIS_FILE = fileURLToPath(import.meta.url);
const BLOCKED = 'secret-scan: BLOCKED — ';
const temps = [];
let emptyGitConfig;

const SAMPLES = [
  { kind: 'Slack bot token', value: 'xo' + 'xb-' + '1111111111-2222222222-abcdefSAMPLE' },
  { kind: 'Atlassian API token', value: 'ATA' + 'TT' + '3xFfGF0SAMPLEonlyNOTREAL0000' },
  { kind: 'AWS access key ID', value: 'AK' + 'IA' + 'SAMPLE0NOTREAL00' },
  {
    kind: 'private key block',
    value: '-'.repeat(5) + 'BEGIN PRIV' + 'ATE KEY' + '-'.repeat(5) + '\nSAMPLEONLY\n',
  },
];
const AWS = SAMPLES[2];

before(() => {
  const dir = mkdtempSync(join(tmpdir(), 'secret-scan-gitconfig-'));
  temps.push(dir);
  emptyGitConfig = join(dir, 'empty.gitconfig');
  writeFileSync(emptyGitConfig, '');
});

after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function makeTemp() {
  const dir = mkdtempSync(join(tmpdir(), 'secret-scan-'));
  temps.push(dir);
  return dir;
}

/** A copy of the environment without anything that could point at the real project or Git setup. */
function isolatedEnv(root) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.toUpperCase().startsWith('GIT_')) continue;
    env[key] = value;
  }
  return {
    ...env,
    GIT_CONFIG_GLOBAL: emptyGitConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CEILING_DIRECTORIES: dirname(root),
  };
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: isolatedEnv(cwd) }).trim();
}

/** Temporary repository with a local test author and no hooks. */
function makeRepo() {
  const root = makeTemp();
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'Test Author']);
  git(root, ['config', 'user.email', 'test-author@example.invalid']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  return root;
}

function put(root, relative, content = 'x\n') {
  const file = join(root, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function stage(root, relative, content) {
  put(root, relative, content);
  git(root, ['add', '--', relative]);
}

function scan(root) {
  const result = spawnSync(process.execPath, [SCAN], {
    cwd: root,
    encoding: 'utf8',
    env: isolatedEnv(root),
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function assertNoValue(output, value) {
  assert.ok(!output.includes(value), 'output must not contain the sample value');
}

describe('clean staged content passes', () => {
  test('a clean new file → exit 0 with the file count', () => {
    const root = makeRepo();
    stage(root, 'src/a.ts', 'export const a = 1;\n');
    const result = scan(root);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'secret-scan: 1 staged file(s) clean\n');
    assert.equal(result.stderr, '');
  });

  test('nothing staged → exit 0, zero files', () => {
    const root = makeRepo();
    const result = scan(root);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'secret-scan: 0 staged file(s) clean\n');
  });

  test('a staged deletion only → not scanned, exit 0', () => {
    const root = makeRepo();
    stage(root, 'old.txt', `${AWS.value}\n`);
    git(root, ['commit', '-q', '-m', 'seed']);
    git(root, ['rm', '-q', '--', 'old.txt']);
    assert.equal(scan(root).status, 0);
  });

  test('a placeholder-only .env.example passes the filename check and the content scan', () => {
    const root = makeRepo();
    stage(
      root,
      '.env.example',
      'JIRA_BASE_URL=https://<your-site>.atlassian.net\nJIRA_API_TOKEN=<your token>\n',
    );
    const result = scan(root);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'secret-scan: 1 staged file(s) clean\n');
  });

  test('filenames with spaces and non-ASCII characters are read exactly (NUL-delimited)', () => {
    const root = makeRepo();
    stage(root, 'dir with space/naïve file ü.md', 'clean\n');
    assert.equal(scan(root).status, 0);
  });

  test('a secret only in the working copy (staged copy clean) → exit 0', () => {
    const root = makeRepo();
    stage(root, 'config.txt', 'clean\n');
    put(root, 'config.txt', `${AWS.value}\n`);
    assert.equal(scan(root).status, 0);
  });

  test('the scanner, the edit guard and this test file stay scanned and pass', () => {
    const root = makeRepo();
    stage(root, 'scripts/hooks/secret-scan.mjs', readFileSync(SCAN));
    stage(root, 'scripts/hooks/guard.mjs', readFileSync(GUARD));
    stage(root, 'safety-tests/secret-scan.test.mjs', readFileSync(THIS_FILE));
    const result = scan(root);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'secret-scan: 3 staged file(s) clean\n');
  });
});

describe('protected filenames are rejected', () => {
  for (const name of [
    '.env',
    '.env.local',
    '.ENV',
    'config/.env.production',
    'certs/server.pem',
    'deploy.key',
    'bundle.p12',
    'home/.ssh/id_rsa',
    'id_ed25519',
  ]) {
    test(`${name} → exit 1`, () => {
      const root = makeRepo();
      stage(root, name, 'PLACEHOLDER=1\n');
      const result = scan(root);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.ok(result.stderr.startsWith(`${BLOCKED}${name} is a protected secret file`));
    });
  }

  test('lookalikes are not protected names: env.ts, my.env.md, id_rsa.pub', () => {
    const root = makeRepo();
    stage(root, 'env.ts', 'x\n');
    stage(root, 'docs/my.env.md', 'x\n');
    stage(root, 'id_rsa.pub', 'ssh-ed25519 public\n');
    assert.equal(scan(root).status, 0);
  });
});

describe('secret markers in staged content are rejected without printing values', () => {
  for (const { kind, value } of SAMPLES) {
    test(`${kind} in a new file → exit 1, kind named, value not printed`, () => {
      const root = makeRepo();
      stage(root, 'notes.md', `before\n${value}\nafter\n`);
      const result = scan(root);
      assert.equal(result.status, 1);
      assert.equal(
        result.stderr.split('\n')[0],
        `${BLOCKED}notes.md looks like it contains a secret (${kind}); ` +
          'remove it, read the value from an environment variable, and stage the file again.',
      );
      assertNoValue(result.stderr + result.stdout, value.trim());
    });
  }

  test('.env.example with a real-looking token → content scan rejects it', () => {
    const root = makeRepo();
    stage(root, '.env.example', `JIRA_API_TOKEN=${SAMPLES[1].value}\n`);
    const result = scan(root);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /\.env\.example looks like it contains a secret \(Atlassian API token\)/,
    );
    assertNoValue(result.stderr, SAMPLES[1].value);
  });

  test('staged content is scanned even after the working copy was cleaned', () => {
    const root = makeRepo();
    stage(root, 'config.txt', `${AWS.value}\n`);
    put(root, 'config.txt', 'clean\n');
    assert.equal(scan(root).status, 1);
  });

  test('a marker added to a modified tracked file → exit 1', () => {
    const root = makeRepo();
    stage(root, 'app.ts', 'export {};\n');
    git(root, ['commit', '-q', '-m', 'seed']);
    stage(root, 'app.ts', `export {};\nconst k = '${AWS.value}';\n`);
    assert.equal(scan(root).status, 1);
  });

  test('a renamed file whose content holds a marker → exit 1', () => {
    const root = makeRepo();
    stage(root, 'a.txt', `${AWS.value}\nline\nline\n`);
    git(root, ['commit', '-q', '-m', 'seed (no hooks in this temporary repository)']);
    git(root, ['mv', 'a.txt', 'b.txt']);
    const result = scan(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /b\.txt looks like it contains a secret/);
  });

  test('a marker inside binary content (NUL bytes) → exit 1', () => {
    const root = makeRepo();
    stage(
      root,
      'blob.bin',
      Buffer.concat([Buffer.from([0, 1, 2, 0]), Buffer.from(AWS.value), Buffer.from([0])]),
    );
    assert.equal(scan(root).status, 1);
  });

  test('a non-ASCII filename with a marker is named in the report', () => {
    const root = makeRepo();
    stage(root, 'dir with space/naïve ü.txt', `${AWS.value}\n`);
    const result = scan(root);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('dir with space/naïve ü.txt looks like it contains a secret'));
  });

  test('every problem is reported, not only the first', () => {
    const root = makeRepo();
    stage(root, '.env', 'A=1\n');
    stage(root, 'a.md', `${AWS.value}\n`);
    stage(root, 'b.md', `${SAMPLES[0].value}\n`);
    const result = scan(root);
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim().split('\n').length, 3);
  });
});

describe('fails closed', () => {
  test('outside a Git repository → exit 1 with one short line', () => {
    const root = makeTemp();
    const result = scan(root);
    assert.equal(result.status, 1);
    assert.equal(
      result.stderr,
      `${BLOCKED}could not list or read the staged files; commit stopped.\n`,
    );
  });
});

describe('scanner and edit guard agree on the markers', () => {
  for (const { kind, value } of SAMPLES) {
    test(`${kind}: guard blocks the same sample`, () => {
      const event = { tool_name: 'Write', tool_input: { file_path: 'notes.md', content: value } };
      const result = spawnSync(process.execPath, [GUARD], {
        input: JSON.stringify(event),
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_PROJECT_DIR: makeTemp() },
      });
      assert.equal(result.status, 2);
      assert.ok(result.stderr.includes(`(${kind})`));
      assertNoValue(result.stderr, value.trim());
    });
  }
});
