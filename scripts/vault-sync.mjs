#!/usr/bin/env node
// Records Claude's file edits in the vault change log (Week 2 Task 05) and keeps one generated note
// per spec (Task 11). The logging modes use Node built-ins only.
//
//   --from-hook      read one hook event (JSON) from stdin; append one entry to
//                    vault/_changelog/<local YYYY-MM-DD>.md for a valid project path outside vault/
//   --session-start  append "- session START <UTC>" to vault/_changelog/sessions.log, followed by
//                    " · source: <source> · session: <session_id>" when the SessionStart event on
//                    stdin carries both as plain IDs (letters, digits, "-")
//   --session-end    the same for SessionEnd (Task 07): "- session END <UTC>", followed by
//                    " · reason: <reason> · session: <session_id>" under the same rule
//   --write [--files <spec>…]  refresh vault/tests/<path>.md from tests/<path>.spec.ts (Task 11)
//   --check [--files <spec>…]  read-only: exit 1 for a missing, stale, invalid, unsupported or
//                              source-less note
// The two note modes load scripts/vault-notes.mjs (and through it the project's typescript package)
// only when they run, so the logging modes never depend on them; see that file for the rules.
//   --write --stage --files <spec>…  (stage 2) Git safety checks first, then refresh, recheck and
//                              `git add -- <note>` for the matching notes only (pre-commit)
// --from-hook also refreshes the note of an edited existing spec (stage 2), without staging; any
// problem is one stderr line and the exit stays 0.
//
// Project root: VAULT_SYNC_ROOT (isolated tests), else CLAUDE_PROJECT_DIR (set by Claude Code for
// hooks), else the working directory.
// Both logging modes exit 0 for any input they handle and for write failures; a write failure prints
// one line to stderr with the error code only, never the input. Nothing is printed to stdout, because
// SessionStart stdout would be added to Claude's context. Every mode takes exactly the arguments
// listed above; anything else prints usage and exits 2.

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(
  process.env.VAULT_SYNC_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd(),
);
const CHANGELOG_DIR = path.join(ROOT, 'vault', '_changelog');
const USAGE =
  'usage: node scripts/vault-sync.mjs --from-hook | --session-start | --session-end\n' +
  '       node scripts/vault-sync.mjs --write | --check [--files <tests/…/name.spec.ts>…]\n' +
  '       node scripts/vault-sync.mjs --write --stage --files <tests/…/name.spec.ts>…\n';

/** UTC time to the second, e.g. 2026-10-20T14:03:12Z. */
function utcTime(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Local calendar date, e.g. 2026-10-20. */
function localDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Keeps each recorded value on one line. */
function oneLine(value) {
  // eslint-disable-next-line no-control-regex -- strips control characters before printing
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim() || 'unknown';
}

/** One Git value from the project root, or "unknown" when Git cannot provide it. */
function git(...args) {
  try {
    const out = execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      windowsHide: true,
    });
    return oneLine(out);
  } catch {
    return 'unknown';
  }
}

/** Branch name; symbolic-ref first because rev-parse fails on a branch with no commits yet. */
function gitBranch() {
  const branch = git('symbolic-ref', '--short', 'HEAD');
  return branch !== 'unknown' ? branch : git('rev-parse', '--abbrev-ref', 'HEAD');
}

/** Appends text, creating the folder and file when needed; never rewrites existing bytes. */
function append(file, text, header = '') {
  mkdirSync(path.dirname(file), { recursive: true });
  if (!existsSync(file)) {
    appendFileSync(file, header + text);
    return;
  }
  const size = statSync(file).size;
  const endsWithNewline = size === 0 || readFileSync(file).at(-1) === 0x0a;
  appendFileSync(file, (endsWithNewline ? '' : '\n') + text);
}

function reportWriteFailure(what, error) {
  process.stderr.write(`vault-sync: could not write ${what} (${error?.code ?? 'error'})\n`);
}

/** Reads all of stdin; an unreadable or absent stdin counts as empty input. */
function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/** The changed path from a PostToolUse (tool_input.file_path) or FileChanged (file_path) event. */
function pickPath(event) {
  if (event === null || typeof event !== 'object' || Array.isArray(event)) return undefined;
  const toolInput = event.tool_input;
  const fromTool =
    toolInput !== null && typeof toolInput === 'object' ? toolInput.file_path : undefined;
  const candidate = typeof fromTool === 'string' ? fromTool : event.file_path;
  return typeof candidate === 'string' && candidate.trim() !== '' ? candidate : undefined;
}

/** Project-relative path with forward slashes, or undefined for outside-project and vault paths. */
function toProjectPath(raw) {
  // path.relative ignores case on Windows, so c:\ and C:\ are the same drive.
  const relative = path.relative(ROOT, path.resolve(ROOT, raw));
  if (relative === '' || path.isAbsolute(relative)) return undefined;
  const parts = relative.split(path.sep);
  if (parts[0] === '..') return undefined;
  const first = process.platform === 'win32' ? parts[0].toLowerCase() : parts[0];
  if (first === 'vault') return undefined;
  return parts.join('/');
}

function fromHook() {
  const text = readStdin().replace(/^\uFEFF+/, '');
  let event;
  try {
    event = JSON.parse(text);
  } catch {
    return;
  }
  const raw = pickPath(event);
  if (raw === undefined) return;
  const file = toProjectPath(raw);
  if (file === undefined) return;

  const now = new Date();
  const entry =
    `- **when:** ${utcTime(now)} · **who:** ${git('config', 'user.name')}@${oneLine(hostname())}` +
    ` · **branch:** ${gitBranch()}\n` +
    `  **what:** ${oneLine(file)} · **why (last commit):** ${git('log', '-1', '--format=%s')}` +
    ` · **commit:** ${git('rev-parse', '--short', 'HEAD')}\n`;
  const date = localDate(now);
  try {
    append(path.join(CHANGELOG_DIR, `${date}.md`), entry, `# Change log ${date}\n\n`);
  } catch (error) {
    reportWriteFailure('change log', error);
  }
  return file;
}

/**
 * After the entry (Task 11 stage 2): refresh the note of an existing tests/**\/*.spec.ts, never
 * staging it. Fails open: any problem is one stderr line naming the status and path; exit stays 0.
 * Vault paths never get here, because fromHook() ignores them before recording.
 */
async function refreshNote(file) {
  if (!/^tests\/.+\.spec\.ts$/.test(file)) return;
  try {
    const notes = await import('./vault-notes.mjs');
    const problem = await notes.refreshFromHook(ROOT, file);
    if (problem !== undefined) process.stderr.write(`vault-sync: ${oneLine(problem)}\n`);
  } catch (error) {
    process.stderr.write(
      `vault-sync: note not refreshed (${oneLine(String(error?.code ?? 'error'))})\n`,
    );
  }
}

/**
 * " · <field>: … · session: …" from a session event (field "source" for SessionStart, "reason" for
 * SessionEnd), or "" unless both are plain IDs.
 */
function sessionDetails(field) {
  let event;
  try {
    event = JSON.parse(readStdin().replace(/^\uFEFF+/, ''));
  } catch {
    return '';
  }
  if (event === null || typeof event !== 'object' || Array.isArray(event)) return '';
  const plainId = (value) => typeof value === 'string' && /^[A-Za-z0-9-]{1,128}$/.test(value);
  const { [field]: detail, session_id: sessionId } = event;
  return plainId(detail) && plainId(sessionId)
    ? ` · ${field}: ${detail} · session: ${sessionId}`
    : '';
}

function sessionLine(kind, field) {
  const line = `- session ${kind} ${utcTime(new Date())}${sessionDetails(field)}\n`;
  try {
    append(path.join(CHANGELOG_DIR, 'sessions.log'), line);
  } catch (error) {
    reportWriteFailure('sessions.log', error);
  }
}

/** The arguments after --write/--check: { files (undefined = all), stage } or { error }. */
function noteArguments(mode, args) {
  let rest = args;
  let stage = false;
  if (rest[0] === '--stage') {
    if (mode !== '--write') return { error: '--stage is only valid with --write --files' };
    stage = true;
    rest = rest.slice(1);
    if (rest[0] !== '--files') return { error: '--stage is only valid with --write --files' };
  }
  if (rest.length === 0) return { files: undefined, stage };
  if (rest[0] !== '--files')
    return { error: `unknown or conflicting argument: ${oneLine(rest[0])}` };
  const files = rest.slice(1);
  if (files.length === 0) return { error: '--files needs at least one spec path' };
  const flag = files.find((file) => file.startsWith('-'));
  if (flag === '--files') return { error: '--files given twice' };
  if (flag !== undefined) return { error: `flags must come before --files: ${oneLine(flag)}` };
  return { files, stage };
}

function usage(reason) {
  process.stderr.write(reason ? `vault-sync: ${reason}\n${USAGE}` : USAGE);
  process.exitCode = 2;
}

const [mode, ...rest] = process.argv.slice(2);
const LOGGING_MODES = ['--from-hook', '--session-start', '--session-end'];
if (LOGGING_MODES.includes(mode) && rest.length > 0) {
  usage(`${mode} takes no further arguments`);
} else if (mode === '--from-hook') {
  let file;
  try {
    file = fromHook();
  } catch (error) {
    reportWriteFailure('change log', error);
  }
  if (file !== undefined) await refreshNote(file);
} else if (mode === '--session-start') {
  sessionLine('START', 'source');
} else if (mode === '--session-end') {
  sessionLine('END', 'reason');
} else if (mode === '--write' || mode === '--check') {
  const { files, stage, error } = noteArguments(mode, rest);
  if (error !== undefined) {
    usage(error);
  } else {
    try {
      const notes = await import('./vault-notes.mjs');
      process.exitCode = await notes.run(ROOT, mode, files, { stage });
    } catch (failure) {
      process.stderr.write(
        `vault-sync: ${mode} failed (${oneLine(String(failure?.code ?? failure?.message ?? 'error'))})\n`,
      );
      process.exitCode = 1;
    }
  }
} else {
  usage();
}
