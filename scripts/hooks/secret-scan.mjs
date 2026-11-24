#!/usr/bin/env node
// Pre-commit secret scan (Week 2 Task 08). Node built-ins only. Run by .husky/pre-commit before
// lint-staged.
//
// It checks what Git is about to commit, not the working copy:
//   file list  git diff --cached --name-only -z --diff-filter=ACMRT  (new, copied, modified, renamed,
//              type-changed; NUL-delimited, so any filename is read exactly)
//   content    git show :0:<path> for each listed file — the staged blob, read as bytes
// Git is always called with an argument array; no shell is involved.
//
// Checks per staged file; every problem is reported, then the commit stops (exit 1):
//   1. protected filename (basename, any folder): .env, .env.*, *.pem, *.key, *.p12, id_rsa,
//      id_ed25519. .env.example is exempt from this check only.
//   2. staged content containing one of the Task 06 secret markers (every staged file, including
//      .env.example, excluded-from-lint paths, this script, the edit guard and the tests).
// A report names the file and the kind of marker, never the matched text or its line.
//
// FAILS CLOSED, unlike the Claude edit guard: if Git cannot list or read the staged files, the
// commit stops. Limits: only the four marker patterns are known; UTF-16 or compressed content can
// hide a marker; merges, rebases and cherry-picks do not run pre-commit; `--no-verify` or HUSKY=0
// skips it (forbidden by .claude/rules/01-guardrails.md).
//
// Secret prefixes are assembled from pieces so this file never contains them whole.

import { spawnSync } from 'node:child_process';

const BLOCKED = 'secret-scan: BLOCKED — ';

const SECRET_MARKERS = [
  { kind: 'Slack bot token', marker: 'xo' + 'xb-' },
  { kind: 'Atlassian API token', marker: 'ATA' + 'TT' },
  { kind: 'AWS access key ID', marker: 'AK' + 'IA' },
  { kind: 'private key block', marker: '-'.repeat(5) + 'BEGIN PRIV' + 'ATE KEY' + '-'.repeat(5) },
];

/** Runs git with an argument array and returns stdout as a Buffer; throws on any failure. */
function git(args) {
  const result = spawnSync('git', args, { maxBuffer: 512 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`git ${args[0]} failed`);
  return result.stdout;
}

/** Filename for messages: control characters removed. */
function shown(path) {
  // eslint-disable-next-line no-control-regex -- strips control characters before printing
  return path.replace(/[\u0000-\u001f\u007f]+/g, '');
}

function baseName(path) {
  const parts = path.split('/');
  return parts[parts.length - 1];
}

function isProtectedName(lower) {
  if (lower === '.env.example') return false;
  return (
    lower === '.env' ||
    lower.startsWith('.env.') ||
    lower.endsWith('.pem') ||
    lower.endsWith('.key') ||
    lower.endsWith('.p12') ||
    lower === 'id_rsa' ||
    lower === 'id_ed25519'
  );
}

function main() {
  const paths = git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMRT'])
    .toString('utf8')
    .split('\0')
    .filter((path) => path !== '');

  const problems = [];
  for (const path of paths) {
    if (isProtectedName(baseName(path).toLowerCase())) {
      problems.push(
        `${shown(path)} is a protected secret file (.env, .env.*, *.pem, *.key, *.p12, id_rsa, ` +
          'id_ed25519); unstage it with `git restore --staged -- <file>`.',
      );
      continue;
    }
    // latin1 maps every byte to one character, so a marker is found in text and binary files alike.
    const content = git(['show', `:0:${path}`]).toString('latin1');
    const secret = SECRET_MARKERS.find(({ marker }) => content.includes(marker));
    if (secret) {
      problems.push(
        `${shown(path)} looks like it contains a secret (${secret.kind}); ` +
          'remove it, read the value from an environment variable, and stage the file again.',
      );
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`${BLOCKED}${problem}\n`);
    return 1;
  }
  process.stdout.write(`secret-scan: ${paths.length} staged file(s) clean\n`);
  return 0;
}

let code;
try {
  code = main();
} catch {
  process.stderr.write(`${BLOCKED}could not list or read the staged files; commit stopped.\n`);
  code = 1;
}
process.exitCode = code;
