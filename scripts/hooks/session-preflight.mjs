#!/usr/bin/env node
// Startup summary for Claude Code's SessionStart hook (Week 2 Task 07). Node built-ins only.
//
// Prints exactly five lines to stdout, which Claude Code adds to the session's context:
//
//   Date: <local YYYY-MM-DD>
//   Branch: <current branch, or "no-branch">
//   Uncommitted files: <count from git status, or "unknown">
//   Latest journal: <newest vault/12-progress-report/**/YYYY-MM-DD.md, or "none yet">
//   Map: vault/_map.md
//
// It ignores stdin, writes nothing and always exits 0. It reads nothing the SessionStart recorder
// (scripts/vault-sync.mjs --session-start) writes, so the two do not depend on running order.
// Project root: CLAUDE_PROJECT_DIR (set by Claude Code for hooks), else the working directory.

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const JOURNAL_DIR = 'vault/12-progress-report';
const JOURNAL_NAME = /^\d{4}-\d{2}-\d{2}\.md$/;

/** Local calendar date, e.g. 2026-10-22. */
function localDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Git's stdout, or undefined when Git cannot provide it. */
function git(...args) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      windowsHide: true,
    });
  } catch {
    return undefined;
  }
}

/** Branch name; symbolic-ref also works on a branch with no commits yet. Detached HEAD: no-branch. */
function branch() {
  const name = git('symbolic-ref', '--short', '-q', 'HEAD')?.trim();
  // eslint-disable-next-line no-control-regex -- strips control characters before printing
  return name ? name.replace(/[\u0000-\u001f\u007f]+/g, ' ') : 'no-branch';
}

/**
 * Number of changed files. -z separates entries with NUL, so no file name can split or merge
 * entries; a rename or copy carries its old name as one extra field, which is skipped.
 */
function uncommittedCount() {
  const out = git('status', '--porcelain', '--untracked-files=all', '-z');
  if (out === undefined) return 'unknown';
  const fields = out.split('\0');
  let count = 0;
  for (let i = 0; i < fields.length; i += 1) {
    if (fields[i] === '') continue;
    count += 1;
    if (/^[RC]/.test(fields[i])) i += 1;
  }
  return String(count);
}

/** Newest journal by the date in its file name (ties: first path), or "none yet". */
function latestJournal() {
  const found = [];
  const walk = (relative) => {
    let entries;
    try {
      entries = readdirSync(path.join(ROOT, relative), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && JOURNAL_NAME.test(entry.name))
        found.push({ date: entry.name, child });
    }
  };
  walk(JOURNAL_DIR);
  if (found.length === 0) return 'none yet';
  found.sort((a, b) =>
    a.date !== b.date
      ? a.date < b.date
        ? 1
        : -1
      : a.child < b.child
        ? -1
        : a.child > b.child
          ? 1
          : 0,
  );
  // eslint-disable-next-line no-control-regex -- strips control characters before printing
  return found[0].child.replace(/[\u0000-\u001f\u007f]+/g, ' ');
}

function summary() {
  return [
    `Date: ${localDate(new Date())}`,
    `Branch: ${branch()}`,
    `Uncommitted files: ${uncommittedCount()}`,
    `Latest journal: ${latestJournal()}`,
    'Map: vault/_map.md',
  ].join('\n');
}

try {
  process.stdout.write(`${summary()}\n`);
} catch {
  // Never fail a session start.
}
process.exitCode = 0;
