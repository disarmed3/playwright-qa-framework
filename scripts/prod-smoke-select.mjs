#!/usr/bin/env node
// Selection gate for the optional, manual production smoke job (.github/workflows/prod-smoke.yml).
// Node built-ins plus the project's own resolver and write-name lists; never reads .env, never makes a
// network request, never starts a test. Rule: .claude/rules/95-ci-workflow.md.
//
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/prod-smoke-select.mjs
//        [--root <dir>] [--allowlist <file>] [--out <args file>] [--github-output <file>]
//
// A tag is not eligibility. The only way a test reaches production is an entry in the reviewed allowlist
// (scripts/prod-smoke-allowlist.json), and every entry is re-checked here against the spec's own source:
//   - the spec file is a regular file under tests/ and holds the exact test title;
//   - the spec declares runIfEnv(test, [... 'prod' ...]), otherwise the test would skip on prod;
//   - the whole file is guest-only and writes nothing: no credentials import or account name, no
//     envGuard, and none of the write names that scripts/check-env-gates.mjs knows.
// The target comes from the existing resolver (env/target.ts) with APP_ENV prod; BASE_URL must be unset.
//
// Exit: 0 at least one approved test selected (args written to --out); 2 nothing approved, so nothing
// will be requested; 3 the allowlist, a spec or the target settings are invalid.
// The last stdout line is `prod-smoke-select: exit <n> <status>`.

import { appendFileSync, existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  API_HELPER_FUNCTIONS,
  HTTP_WRITE_MEMBERS,
  OWNED_RECORD_MEMBERS,
  UI_WRITE_MEMBERS,
} from './check-env-gates.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_ENTRIES = 20;
const FIELDS = ['file', 'title', 'approvedBy', 'approvedOn', 'source', 'readOnlyBasis'];
const SPEC_PATH = /^tests\/[A-Za-z0-9_./-]+\.spec\.ts$/;
const PROD_DECLARATION = /runIfEnv\(\s*test\s*,\s*\[[^\]]*['"]prod['"][^\]]*\]\s*\)/;
const CREDENTIALS = /support\/users|\b(?:AUTHOR|ADMIN|OTHER_AUTHOR)\b/;
const WRITE_MEMBER = new RegExp(
  `\\.(?:${[...HTTP_WRITE_MEMBERS, ...OWNED_RECORD_MEMBERS, ...UI_WRITE_MEMBERS].join('|')})\\(`,
);
const WRITE_FUNCTION = new RegExp(
  `\\b(?:${[...API_HELPER_FUNCTIONS].join('|')})\\(|\\benvGuard\\(`,
);

class Invalid extends Error {}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseArgs(argv) {
  const known = ['root', 'allowlist', 'out', 'github-output'];
  const opts = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!flag.startsWith('--') || !known.includes(flag.slice(2))) {
      throw new Invalid(`unknown option ${JSON.stringify(flag.slice(0, 40))}`);
    }
    if (argv[i + 1] === undefined) throw new Invalid(`${flag} needs a value`);
    opts[flag.slice(2)] = argv[i + 1];
  }
  return opts;
}

/** The production target from the existing resolver; BASE_URL must not be set at all. */
async function productionTarget(env) {
  if (env.BASE_URL !== undefined) throw new Invalid('BASE_URL must be unset');
  const { resolveTarget } = await import(new URL('../env/target.ts', import.meta.url).href);
  try {
    return resolveTarget({ APP_ENV: 'prod', LOCAL_SANDBOX_DIR: env.LOCAL_SANDBOX_DIR });
  } catch (error) {
    throw new Invalid(`the resolver refused the settings (${error?.name ?? 'Error'})`);
  }
}

function checkEntry(entry, index, root) {
  const at = `entry ${index + 1}`;
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Invalid(`${at} is not an object`);
  }
  for (const field of FIELDS) {
    if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
      throw new Invalid(`${at} needs a non-empty "${field}"`);
    }
  }
  if (!SPEC_PATH.test(entry.file) || entry.file.includes('..')) {
    throw new Invalid(`${at}: "file" must be a tests/**/*.spec.ts path`);
  }
  // eslint-disable-next-line no-control-regex -- rejects control characters in a title
  if (entry.title.length > 200 || /[\u0000-\u001f\u007f]/.test(entry.title)) {
    throw new Invalid(`${at}: "title" is too long or has control characters`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.approvedOn)) {
    throw new Invalid(`${at}: "approvedOn" must be YYYY-MM-DD`);
  }
  const file = path.join(root, ...entry.file.split('/'));
  if (!existsSync(file) || !lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) {
    throw new Invalid(`${at}: ${entry.file} is not a regular file`);
  }
  const source = readFileSync(file, 'utf8');
  if (!source.includes(entry.title)) throw new Invalid(`${at}: the title is not in ${entry.file}`);
  if (!PROD_DECLARATION.test(source)) {
    throw new Invalid(
      `${at}: ${entry.file} does not declare runIfEnv(test, [..'prod'..]); it would skip`,
    );
  }
  if (CREDENTIALS.test(source)) throw new Invalid(`${at}: ${entry.file} uses credentials`);
  if (WRITE_MEMBER.test(source) || WRITE_FUNCTION.test(source)) {
    throw new Invalid(`${at}: ${entry.file} contains a write or a guard; it is not read-only`);
  }
}

export async function select({ root = REPO, allowlist, env = process.env } = {}) {
  const lines = [];
  const target = await productionTarget(env);
  lines.push(
    `target: ${target.env} (${target.baseURL}), from the existing resolver; BASE_URL is unset`,
  );
  const listFile = allowlist ?? path.join(root, 'scripts', 'prod-smoke-allowlist.json');
  let list;
  try {
    list = JSON.parse(readFileSync(listFile, 'utf8'));
  } catch {
    throw new Invalid('the allowlist is missing or is not valid JSON');
  }
  if (
    list === null ||
    typeof list !== 'object' ||
    list.version !== 1 ||
    !Array.isArray(list.approved)
  ) {
    throw new Invalid('the allowlist must be { "version": 1, "approved": [...] }');
  }
  if (list.approved.length > MAX_ENTRIES) throw new Invalid(`more than ${MAX_ENTRIES} entries`);
  const seen = new Set();
  list.approved.forEach((entry, index) => {
    checkEntry(entry, index, root);
    const key = `${entry.file}::${entry.title}`;
    if (seen.has(key)) throw new Invalid(`entry ${index + 1} repeats an earlier entry`);
    seen.add(key);
  });
  const entries = list.approved;
  lines.push(`approved tests in the allowlist: ${entries.length}`);
  for (const entry of entries) lines.push(`  ${entry.file} :: ${entry.title}`);
  const files = [...new Set(entries.map((entry) => entry.file))];
  const pattern = `(${entries.map((entry) => escapeRegExp(entry.title)).join('|')})`;
  return {
    target,
    lines,
    entries,
    args: entries.length === 0 ? [] : [...files, '--grep', pattern],
  };
}

export async function main(argv, env = process.env) {
  const out = [];
  try {
    const opts = parseArgs(argv);
    const result = await select({ root: opts.root, allowlist: opts.allowlist, env });
    out.push(...result.lines);
    if (result.entries.length === 0) {
      out.push(
        'no production test is approved: nothing was selected and no production request is made',
      );
      out.push('prod-smoke-select: exit 2 none-approved');
      if (opts['github-output']) appendFileSync(opts['github-output'], 'count=0\n');
      return { code: 2, out };
    }
    if (opts.out) writeFileSync(opts.out, `${result.args.join('\n')}\n`);
    if (opts['github-output'])
      appendFileSync(opts['github-output'], `count=${result.entries.length}\n`);
    out.push('prod-smoke-select: exit 0 selected');
    return { code: 0, out };
  } catch (error) {
    if (error instanceof Invalid) {
      out.push(`error: ${error.message}`);
      out.push('prod-smoke-select: exit 3 invalid');
      return { code: 3, out };
    }
    out.push(`error: unexpected failure (${error?.name ?? 'Error'})`);
    out.push('prod-smoke-select: exit 3 invalid');
    return { code: 3, out };
  }
}

if (path.basename(process.argv[1] ?? '') === 'prod-smoke-select.mjs') {
  const result = await main(process.argv.slice(2));
  for (const line of result.out) console.log(line);
  process.exitCode = result.code;
}
