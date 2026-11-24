#!/usr/bin/env node
// Edit guard for Claude's Edit and Write tools (Week 2 Task 06). Node built-ins only.
//
// Claude Code runs this as a PreToolUse hook and writes the proposed tool call as JSON to stdin.
// The guard examines only that input: it never opens the target file and never applies the edit.
//
//   Edit   old text = tool_input.old_string, new text = tool_input.new_string
//   Write  old text = '' (no baseline),      new text = tool_input.content
//
// Checks, in order; the first match blocks (exit 2, one line on stderr starting "guard: BLOCKED — "):
//   1. protected filename (basename, any folder; .env.example is exempt from this check only)
//   2. secret-looking new text (any file, including .env.example)
//   3. *.spec.ts: .only in new text but not in old text
//   4. *.spec.ts: .skip, .fixme( or .fail( in new text but not in old text (checked in that order)
//   5. Edit on *.spec.ts: fewer expect( calls in new_string than in old_string
//   6. Edit on *.spec.ts: fewer runIfEnv( calls, or fewer envGuard( calls (counted separately)
//   7. *.spec.ts: waitForTimeout( in new text but not in old text (a Write checks the whole content)
//   8. Write of a *.spec.ts under tests/ whose content lacks runIfEnv(test, ['dev'])
// Checks 5 and 6 need an old-text baseline, so a Write (whole file) is not checked for them.
// Check 8 places the path in the project (relative as given, absolute under CLAUDE_PROJECT_DIR); a
// path it cannot place, or a Write whose content is not a string, is not checked.
//
// After all eight checks pass (Task 09): an Edit or Write of a path in CRITICAL_PATHS prints one JSON
// object to stdout — systemMessage and hookSpecificOutput.additionalContext both carry the WARNING
// line — and still exits 0. It never returns permissionDecision, so it approves nothing. Every other
// allowed edit stays silent; a refusal still exits 2 with no JSON. The path is placed as for check 8,
// except that without CLAUDE_PROJECT_DIR an absolute path is placed under this script's own project;
// a path outside the project gets no reminder.
//
// FAILS OPEN. This is a course guard, not a security boundary: malformed or unreadable input, other
// tools and any internal error exit 0 silently, and if node or this script cannot start, Claude Code
// treats the non-2 exit as a non-blocking error and the edit goes ahead. Shell edits and NotebookEdit
// never reach it. Permissions, the deny list and review stay in force.
//
// Secret prefixes are assembled from pieces so this file never contains them whole.

import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const BLOCKED = 'guard: BLOCKED — ';
const WARNING = 'guard: WARN — shared file; review the affected callers before approving';
// The project this script belongs to (scripts/hooks/ → root). The warning falls back to it when
// CLAUDE_PROJECT_DIR is unset or empty; check 8 does not, so its placement is unchanged.
const SCRIPT_ROOT = fileURLToPath(new URL('../..', import.meta.url));

// Task 09: the CRITICAL tier of .claude/rules/01-guardrails.md, kept here by hand. That Markdown
// table does not update this list, and this list does not update the table: change both together,
// plus the copy in safety-tests/guard.test.mjs. Project-relative, forward slashes; compared in
// lower case against projectPath(), so case and separators in the proposed path do not matter.
const CRITICAL_PATHS = new Set(
  [
    'playwright.config.ts',
    'playwright.safety.config.ts',
    'tsconfig.json',
    'package.json',
    'eslint.config.mjs',
    '.prettierrc.json',
    '.gitignore',
    'env/target.ts',
    'env/runIfEnv.ts',
    'env/envGuard.ts',
    'tests/support/env.ts',
    'tests/support/users.ts',
    '.claude/settings.json',
    '.husky/pre-commit',
    '.husky/pre-push',
    'scripts/hooks/guard.mjs',
    'scripts/hooks/secret-scan.mjs',
    'scripts/hooks/pre-push-check.mjs',
    'scripts/hooks/session-preflight.mjs',
    'scripts/hooks/stop-worklog.mjs',
    'scripts/vault-sync.mjs',
    '.claude/hooks/fleet-log.mjs',
  ].map((path) => path.toLowerCase()),
);

const SECRET_MARKERS = [
  { kind: 'Slack bot token', marker: 'xo' + 'xb-' },
  { kind: 'Atlassian API token', marker: 'ATA' + 'TT' },
  { kind: 'AWS access key ID', marker: 'AK' + 'IA' },
  { kind: 'private key block', marker: '-'.repeat(5) + 'BEGIN PRIV' + 'ATE KEY' + '-'.repeat(5) },
];

/** Reads all of stdin; an unreadable or absent stdin counts as empty input. */
function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function text(value) {
  return typeof value === 'string' ? value : '';
}

/** Basename after turning backslashes into slashes; control characters removed for messages. */
function baseName(filePath) {
  const parts = filePath.replace(/\\/g, '/').split('/');
  // eslint-disable-next-line no-control-regex -- strips control characters before printing
  return parts[parts.length - 1].replace(/[\u0000-\u001f\u007f]+/g, '');
}

/**
 * Project-relative path, lower case with forward slashes, or undefined when it cannot be placed.
 * An absolute path is placed under CLAUDE_PROJECT_DIR, or under `fallbackRoot` when that is unset.
 */
function projectPath(filePath, fallbackRoot) {
  const path = posix.normalize(filePath.replace(/\\/g, '/')).toLowerCase();
  if (!/^([a-z]:)?\//.test(path)) return path;
  const fromEnv = process.env.CLAUDE_PROJECT_DIR;
  const root = typeof fromEnv === 'string' && fromEnv.trim() !== '' ? fromEnv : fallbackRoot;
  if (typeof root !== 'string' || root.trim() === '') return undefined;
  const base = posix.normalize(root.replace(/\\/g, '/')).toLowerCase().replace(/\/+$/, '');
  return path.startsWith(`${base}/`) ? path.slice(base.length + 1) : undefined;
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

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

/** The reason to block, or undefined to allow. `rel` is the project path for check 8, else undefined. */
function check(tool, name, oldText, newText, rel) {
  const lower = name.toLowerCase();

  if (isProtectedName(lower)) {
    return (
      `${name} is a protected secret file (.env, .env.*, *.pem, *.key, *.p12, id_rsa, id_ed25519); ` +
      'do not edit it with Claude — ask the user to change it by hand, and put placeholders in .env.example.'
    );
  }

  const secret = SECRET_MARKERS.find(({ marker }) => newText.includes(marker));
  if (secret) {
    return (
      `the new text for ${name} looks like a secret (${secret.kind}); ` +
      'remove it and read the value from an environment variable instead.'
    );
  }

  if (!lower.endsWith('.spec.ts')) return undefined;

  if (newText.includes('.only') && !oldText.includes('.only')) {
    return `this change adds .only to ${name}; .only makes Playwright run only the focused tests — remove it.`;
  }
  if (newText.includes('.skip') && !oldText.includes('.skip')) {
    return (
      `this change adds .skip to ${name}; ` +
      'limit environments with runIfEnv(test, [...]) or ask the user before skipping a test.'
    );
  }
  if (newText.includes('.fixme(') && !oldText.includes('.fixme(')) {
    return (
      `this change adds .fixme( to ${name}; .fixme skips the test — fix it, ` +
      'limit environments with runIfEnv(test, [...]), or ask the user before skipping a test.'
    );
  }
  if (newText.includes('.fail(') && !oldText.includes('.fail(')) {
    return (
      `this change adds .fail( to ${name}; .fail makes the test pass only when it fails — ` +
      'fix the test, or ask the user before marking it as expected to fail.'
    );
  }

  if (tool === 'Edit') {
    const reduced = (needle) => {
      const before = count(oldText, needle);
      const after = count(newText, needle);
      return after < before ? { before, after } : undefined;
    };

    const expects = reduced('expect(');
    if (expects) {
      return (
        `this edit to ${name} reduces expect( calls from ${expects.before} to ${expects.after}; ` +
        'keep the assertions, or ask the user to approve removing them.'
      );
    }
    const runIfEnv = reduced('runIfEnv(');
    if (runIfEnv) {
      return (
        `this edit to ${name} reduces runIfEnv( calls from ${runIfEnv.before} to ${runIfEnv.after}; ` +
        "every spec keeps runIfEnv(test, ['dev']) as the first line of its top-level describe."
      );
    }
    const envGuard = reduced('envGuard(');
    if (envGuard) {
      return (
        `this edit to ${name} reduces envGuard( calls from ${envGuard.before} to ${envGuard.after}; ` +
        'every data write must stay inside envGuard(() => …).'
      );
    }
  }

  if (newText.includes('waitForTimeout(') && !oldText.includes('waitForTimeout(')) {
    return (
      `this change adds waitForTimeout( to ${name}; a fixed wait only guesses the timing — ` +
      'wait for the condition the test needs instead, with a web-first assertion such as ' +
      'await expect(locator).toBeVisible() or await expect(page).toHaveURL(…).'
    );
  }

  if (
    tool === 'Write' &&
    rel !== undefined &&
    rel.startsWith('tests/') &&
    !newText.includes("runIfEnv(test, ['dev'])")
  ) {
    return (
      `this Write of ${name} under tests/ has no runIfEnv(test, ['dev']); ` +
      'add it as the first line of the top-level describe so the spec cannot run on prod.'
    );
  }
  return undefined;
}

function main() {
  let event;
  try {
    event = JSON.parse(readStdin().replace(/^\uFEFF+/, ''));
  } catch {
    return 0;
  }
  if (event === null || typeof event !== 'object' || Array.isArray(event)) return 0;

  const tool = event.tool_name;
  if (tool !== 'Edit' && tool !== 'Write') return 0;
  const input = event.tool_input;
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return 0;
  if (typeof input.file_path !== 'string' || input.file_path.trim() === '') return 0;

  const oldText = tool === 'Edit' ? text(input.old_string) : '';
  const newText = tool === 'Edit' ? text(input.new_string) : text(input.content);

  const rel =
    tool === 'Write' && typeof input.content === 'string'
      ? projectPath(input.file_path)
      : undefined;
  const reason = check(tool, baseName(input.file_path), oldText, newText, rel);
  if (reason !== undefined) {
    process.stderr.write(`${BLOCKED}${reason}\n`);
    return 2;
  }

  // A reminder, never a decision: no permissionDecision, so the normal approval prompt still applies.
  const target = projectPath(input.file_path, SCRIPT_ROOT);
  if (target !== undefined && CRITICAL_PATHS.has(target)) {
    process.stdout.write(
      `${JSON.stringify({
        systemMessage: WARNING,
        hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: WARNING },
      })}\n`,
    );
  }
  return 0;
}

try {
  process.exitCode = main();
} catch {
  process.exitCode = 0;
}
