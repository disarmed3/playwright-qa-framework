// Isolated checks for scripts/hooks/pre-push-check.mjs (Week 2 Task 08). node:test, no browser, no
// network, no Git. Every case runs the real script by absolute path and feeds the lines Git would
// write to a pre-push hook's stdin.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CHECK = fileURLToPath(new URL('../scripts/hooks/pre-push-check.mjs', import.meta.url));
const BLOCKED = 'pre-push: BLOCKED — ';
const SHA = 'a'.repeat(40);
const ZERO = '0'.repeat(40);

function run(input, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  if (!('ALLOW_MAIN_PUSH' in extraEnv)) delete env.ALLOW_MAIN_PUSH;
  const result = spawnSync(process.execPath, [CHECK], { input, encoding: 'utf8', env });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const line = (localRef, remoteRef, localSha = SHA, remoteSha = ZERO) =>
  `${localRef} ${localSha} ${remoteRef} ${remoteSha}\n`;

describe('allowed pushes', () => {
  test('no input → exit 0', () => {
    assert.equal(run('').status, 0);
  });

  test('feature branch to the same name → exit 0, silent', () => {
    const result = run(line('refs/heads/week-2', 'refs/heads/week-2'));
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
  });

  test('names that only resemble main → exit 0', () => {
    const input =
      line('refs/heads/x', 'refs/heads/mainline') +
      line('refs/heads/x', 'refs/heads/feature/main') +
      line('refs/tags/main', 'refs/tags/main');
    assert.equal(run(input).status, 0);
  });

  test('CRLF line endings are accepted', () => {
    assert.equal(run(line('refs/heads/a', 'refs/heads/a').replace('\n', '\r\n')).status, 0);
  });
});

describe('pushes to refs/heads/main are rejected', () => {
  test('local main to remote main → exit 1', () => {
    const result = run(line('refs/heads/main', 'refs/heads/main'));
    assert.equal(result.status, 1);
    assert.ok(
      result.stderr.startsWith(
        `${BLOCKED}this push updates refs/heads/main (from refs/heads/main)`,
      ),
    );
  });

  test('a differently named local branch to remote main → exit 1, local ref named', () => {
    const result = run(line('refs/heads/feature', 'refs/heads/main'));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\(from refs\/heads\/feature\)/);
  });

  test('deleting remote main → exit 1', () => {
    assert.equal(run(line('(delete)', 'refs/heads/main', ZERO, SHA)).status, 1);
  });

  test('main among several refs → exit 1', () => {
    const input = line('refs/heads/a', 'refs/heads/a') + line('refs/heads/b', 'refs/heads/main');
    assert.equal(run(input).status, 1);
  });

  test('ALLOW_MAIN_PUSH set to anything other than 1 does not skip the check', () => {
    for (const value of ['true', 'yes', ' 1', '']) {
      assert.equal(
        run(line('refs/heads/main', 'refs/heads/main'), { ALLOW_MAIN_PUSH: value }).status,
        1,
      );
    }
  });
});

describe('exception and malformed input', () => {
  test('ALLOW_MAIN_PUSH=1 → exit 0 with a notice', () => {
    const result = run(line('refs/heads/main', 'refs/heads/main'), { ALLOW_MAIN_PUSH: '1' });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, 'pre-push: ALLOW_MAIN_PUSH=1 set — main-branch check skipped.\n');
  });

  test('a line without four fields → exit 1 (fails closed)', () => {
    const result = run('refs/heads/main refs/heads/main\n');
    assert.equal(result.status, 1);
    assert.equal(result.stderr, `${BLOCKED}unexpected input from Git; push stopped.\n`);
  });
});
