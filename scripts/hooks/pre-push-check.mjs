#!/usr/bin/env node
// Pre-push branch check (Week 2 Task 08). Node built-ins only. Run by .husky/pre-push before the
// typecheck and the development test listing.
//
// Git writes one line per ref being pushed to the hook's stdin:
//   <local ref> SP <local sha> SP <remote ref> SP <remote sha> LF
// The push stops (exit 1) if any *remote* ref is refs/heads/main, so `git push origin feature:main`
// and deleting main are refused as well as pushing a local branch called main. A line that does not
// have four fields also stops the push (fails closed).
//
// ALLOW_MAIN_PUSH=1 skips this check only, with a notice. It is for an exceptional, agreed push by a
// maintainer — not for course exercises. `--no-verify` or HUSKY=0 skips the whole hook (forbidden by
// .claude/rules/01-guardrails.md).

import { readFileSync } from 'node:fs';

const BLOCKED = 'pre-push: BLOCKED — ';
const PROTECTED = 'refs/heads/main';

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  if (process.env.ALLOW_MAIN_PUSH === '1') {
    process.stderr.write('pre-push: ALLOW_MAIN_PUSH=1 set — main-branch check skipped.\n');
    return 0;
  }

  const lines = readStdin()
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');

  for (const line of lines) {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 4) {
      process.stderr.write(`${BLOCKED}unexpected input from Git; push stopped.\n`);
      return 1;
    }
    if (fields[2] === PROTECTED) {
      process.stderr.write(
        `${BLOCKED}this push updates ${PROTECTED} (from ${fields[0]}); push a feature branch and ` +
          'open a pull request instead.\n',
      );
      return 1;
    }
  }
  return 0;
}

process.exitCode = main();
