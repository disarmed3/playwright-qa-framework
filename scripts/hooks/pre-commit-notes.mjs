#!/usr/bin/env node
// Pre-commit spec-note step (Week 2 Task 11, stage 2). Run twice by .husky/pre-commit:
//
//   --preflight  after the secret scan, before lint-staged. Writes nothing. Stops the commit (exit 1)
//                when a selected spec is partially staged, untracked or unstaged-deleted, when its
//                note has unstaged edits outside the generated block, is untracked with hand-written
//                text, or is ignored, when a merge/rebase is in progress, and when a deleted or
//                renamed spec still has its old note (reviewed removal or archiving comes first).
//   --refresh    after lint-staged: node scripts/vault-sync.mjs --write --stage --files <selected>
//                (which repeats the safety checks before writing and stages only matching notes),
//                then --check --files <selected>.
//
// Selected specs: staged tests/**/*.spec.ts that are added, copied, modified, type-changed, deleted
// or renamed (old and new path), plus the spec of every staged vault/tests/**/*.md (so a hand edit
// inside a staged block is caught). Read with `git diff --cached --name-status -z -M`.
//
// Git and node are always called with argument arrays (no shell); paths travel NUL-delimited and as
// separate arguments, so spaces and quotes in names are safe. Never `git add .`. FAILS CLOSED: if Git
// cannot list the staged files, the commit stops. The project root is the top of the work tree of the
// working folder; the child vault-sync run gets it explicitly as VAULT_SYNC_ROOT.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = 'pre-commit-notes: ';
const VAULT_SYNC = fileURLToPath(new URL('../vault-sync.mjs', import.meta.url));
const SPEC = /^tests\/.+\.spec\.ts$/;
const NOTE = /^vault\/tests\/.+\.md$/;

function git(args) {
  const result = spawnSync('git', ['--literal-pathspecs', '-c', 'core.quotepath=off', ...args], {
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error(`git ${args[0]} failed`);
  return result.stdout;
}

/** Control characters removed, for messages. */
function shown(value) {
  // eslint-disable-next-line no-control-regex -- strips control characters before printing
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ');
}

const noteOf = (spec) => `vault/tests/${spec.slice('tests/'.length, -'.spec.ts'.length)}.md`;
const specOf = (note) => `tests/${note.slice('vault/tests/'.length, -'.md'.length)}.spec.ts`;

/** { root, specs: [...], gone: [{ spec, renamedTo? }] } from the staged changes. */
function selection() {
  const root = git(['rev-parse', '--show-toplevel']).toString('utf8').trim();
  const tokens = git(['diff', '--cached', '--name-status', '-z', '-M', '--diff-filter=ACDMRT'])
    .toString('utf8')
    .split('\0');
  const specs = new Set();
  const gone = [];
  for (let i = 0; i < tokens.length && tokens[i] !== '';) {
    const status = tokens[i][0];
    if (status === 'R' || status === 'C') {
      const [from, to] = [tokens[i + 1], tokens[i + 2]];
      i += 3;
      if (SPEC.test(to)) specs.add(to);
      if (status === 'R' && SPEC.test(from)) {
        specs.add(from);
        gone.push({ spec: from, renamedTo: to });
      }
      if (NOTE.test(to)) specs.add(specOf(to));
      if (NOTE.test(from)) specs.add(specOf(from));
    } else {
      const file = tokens[i + 1];
      i += 2;
      if (SPEC.test(file)) {
        specs.add(file);
        if (status === 'D') gone.push({ spec: file });
      }
      if (NOTE.test(file)) specs.add(specOf(file));
    }
  }
  return { root, specs: [...specs].sort(), gone };
}

/** Is the note still on disk or in the index? Either way it has not been cleaned up yet. */
function stillThere(root, note) {
  const tracked = git(['ls-files', '-z', '--', note]).toString('utf8').split('\0').includes(note);
  return tracked || existsSync(path.join(root, note));
}

function runVaultSync(root, args) {
  const result = spawnSync(process.execPath, [VAULT_SYNC, ...args], {
    env: { ...process.env, VAULT_SYNC_ROOT: root },
    stdio: 'inherit',
    windowsHide: true,
  });
  return result.status ?? 1;
}

async function preflight({ root, specs, gone }) {
  if (specs.length === 0) {
    process.stdout.write(`${SELF}no staged spec or spec note\n`);
    return 0;
  }
  const problems = [];
  for (const { spec, renamedTo } of gone) {
    const note = noteOf(spec);
    if (stillThere(root, note)) {
      const what = renamedTo ? `renamed ${spec} -> ${renamedTo}` : `deleted ${spec}`;
      problems.push(
        `${what}: the old note ${note} is still there; review it, then remove it (git rm) or archive it outside vault/tests/ (git mv) and stage that`,
      );
    }
  }
  const { specPath, stageProblems } = await import('../vault-notes.mjs');
  try {
    for (const spec of specs) specPath(root, spec);
    problems.push(...stageProblems(root, specs));
  } catch (error) {
    problems.push(error.message);
  }
  for (const problem of problems) process.stderr.write(`${SELF}BLOCKED — ${shown(problem)}\n`);
  if (problems.length > 0) {
    process.stderr.write(`${SELF}nothing was written or staged\n`);
    return 1;
  }
  process.stdout.write(`${SELF}preflight ok: ${specs.length} spec path(s)\n`);
  return 0;
}

function refresh({ root, specs }) {
  if (specs.length === 0) {
    process.stdout.write(`${SELF}no staged spec or spec note\n`);
    return 0;
  }
  if (runVaultSync(root, ['--write', '--stage', '--files', ...specs]) !== 0) return 1;
  return runVaultSync(root, ['--check', '--files', ...specs]) === 0 ? 0 : 1;
}

async function main(mode) {
  if (mode !== '--preflight' && mode !== '--refresh') {
    process.stderr.write(
      'usage: node scripts/hooks/pre-commit-notes.mjs --preflight | --refresh\n',
    );
    return 2;
  }
  let selected;
  try {
    selected = selection();
  } catch (error) {
    process.stderr.write(`${SELF}BLOCKED — cannot read the staged files (${error.message})\n`);
    return 1;
  }
  return mode === '--preflight' ? preflight(selected) : refresh(selected);
}

process.exitCode = process.argv.length === 3 ? await main(process.argv[2]) : await main(undefined);
