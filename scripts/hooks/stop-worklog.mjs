#!/usr/bin/env node
// Daily-note reminder for Claude Code's Stop hook (Week 2 Task 07). Node built-ins only.
//
//   --path   print today's journal path (project-relative) and exit 0; stdin is not read
//   (none)   read one Stop event (JSON) from stdin and decide:
//
// Journal: vault/12-progress-report/<slug>/<local YYYY-MM-DD>.md, where <slug> is git user.name
// trimmed and lowercased, each run of characters outside a-z0-9 replaced with "-", edge hyphens
// removed; "student" when nothing is left.
//
// Decisions, in order (the first that applies wins):
//   1. input is not a JSON object (after removing all leading byte-order marks)  → exit 0
//   2. stop_hook_active is true (Claude is already continuing after a block)     → exit 0
//   3. no uncommitted .ts/.mjs/.json/.md/.sh file and no commit on today's local date → exit 0
//   4. today's journal has a line beginning "## HH:MM"                           → exit 0
//   5. otherwise one line on stderr starting "worklog: BLOCKED — " naming the path and /worklog → exit 2
// Any unexpected error exits 0. The script never writes a file.
// Project root: CLAUDE_PROJECT_DIR (set by Claude Code for hooks), else the working directory.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const BLOCKED = 'worklog: BLOCKED — ';
const QUALIFYING = /\.(ts|mjs|json|md|sh)$/i;
const HEADING = /^## ([01]\d|2[0-3]):[0-5]\d\b/m;

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

function slug() {
  const name = (git('config', 'user.name') ?? '').trim().toLowerCase();
  const value = name.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return value || 'student';
}

/** Today's journal, project-relative with forward slashes. */
function journalPath() {
  return `vault/12-progress-report/${slug()}/${localDate(new Date())}.md`;
}

/** Changed files with a qualifying extension. -z keeps names intact; a rename's old name is skipped. */
function qualifyingChanges() {
  const out = git('status', '--porcelain', '--untracked-files=all', '-z');
  if (out === undefined) return 0;
  const fields = out.split('\0');
  let count = 0;
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i];
    if (field === '') continue;
    if (QUALIFYING.test(field.slice(3))) count += 1;
    if (/^[RC]/.test(field)) i += 1;
  }
  return count;
}

/** True when the last commit's committer time falls on today's local calendar date. */
function committedToday() {
  const seconds = Number((git('log', '-1', '--format=%ct') ?? '').trim());
  if (!Number.isInteger(seconds) || seconds <= 0) return false;
  return localDate(new Date(seconds * 1000)) === localDate(new Date());
}

function hasHeading(relative) {
  try {
    return HEADING.test(readFileSync(path.join(ROOT, relative), 'utf8').replace(/^\uFEFF+/, ''));
  } catch {
    return false;
  }
}

/** Exit code for one Stop event. */
function fromHook() {
  let event;
  try {
    event = JSON.parse(readFileSync(0, 'utf8').replace(/^\uFEFF+/, ''));
  } catch {
    return 0;
  }
  if (event === null || typeof event !== 'object' || Array.isArray(event)) return 0;
  if (event.stop_hook_active === true) return 0;

  const changes = qualifyingChanges();
  const commit = committedToday();
  if (changes === 0 && !commit) return 0;

  const journal = journalPath();
  if (hasHeading(journal)) return 0;

  const activity = [
    changes > 0 ? `${changes} changed ${changes === 1 ? 'file' : 'files'}` : undefined,
    commit ? 'commit today' : undefined,
  ].filter(Boolean);
  process.stderr.write(
    `${BLOCKED}work today (${activity.join('; ')}) but no "## HH:MM" entry in ` +
      // eslint-disable-next-line no-control-regex -- strips control characters before printing
      `${journal.replace(/[\u0000-\u001f\u007f]+/g, ' ')}. Run /worklog, or append to that file a ` +
      '"## HH:MM" heading (current local time) followed by short Did, Worked / didn\'t and Next ' +
      'bullets; keep earlier entries and leave out secrets. This reminder is shown once per stop.\n',
  );
  return 2;
}

try {
  if (process.argv[2] === '--path') {
    process.stdout.write(`${journalPath()}\n`);
    process.exitCode = 0;
  } else {
    process.exitCode = fromHook();
  }
} catch {
  process.exitCode = 0;
}
