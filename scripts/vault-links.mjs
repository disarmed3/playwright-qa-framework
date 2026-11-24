#!/usr/bin/env node
// Vault link check (Week 2 Task 11, stage 2): `npm run vault:validate`. Node built-ins only; reads
// files, writes nothing, never opens a web address.
//
// Scans every *.md under vault/ (symbolic links are not followed). Before looking for links it blanks
// out fenced code blocks (``` or ~~~, closed by the same character at least as long) and inline code
// spans, keeping line numbers, so examples in code are never checked.
//
// Checked (the target must exist as a file or folder; headings are never checked):
//   [label](target "title")   and [label](<target with spaces>)  relative to the note
//   [id]: target              reference definitions, relative to the note
//   [[target]], [[target|label]], [[target#heading]]               relative to vault/
// The .md extension is optional, a #fragment or ?query suffix is dropped, targets are percent-decoded,
// and a target may not leave the project. Ignored: images (![…](…), ![[…]]), any scheme: link (http,
// https, mailto, …), same-note #anchors, and links inside a generated block of a note outside
// vault/tests/ (an archived note's block records a spec that is gone on purpose).
//
// Broken targets are errors (exit 1). A maintained note that no other note links to is a warning
// (exit stays 0). No orphan warning for: _map.md, _raw/**, _changelog/**, sources/** (imports) and
// 12-progress-report/** (daily journals). No metadata is required of any note.
//
// Guide titles (warning only): a human guide under vault/03-framework/ (any depth) with no Markdown
// H1 outside code gets "warning … no H1 heading outside code". Counted: `# Title` with up to three
// leading spaces (closing #s allowed) and a setext `Title` / `===` pair. Not counted: `#Title`, an
// empty `#`, deeper headings, anything in fenced code, in a leading YAML front matter block, or
// indented four or more spaces. No other folder is checked for titles (imports, logs, raw notes,
// journals, spec notes, the map and the context note are out of scope). Like every warning, it
// never changes the exit code.
//
// Root: VAULT_SYNC_ROOT, else CLAUDE_PROJECT_DIR, else the working folder (as scripts/vault-sync.mjs).

import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(
  process.env.VAULT_SYNC_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd(),
);
const VAULT = path.join(ROOT, 'vault');
const START = '<!-- generated:start -->';
const END = '<!-- generated:end -->';
const ORPHAN_EXEMPT = [
  /^_map\.md$/,
  /^_raw\//,
  /^_changelog\//,
  /^sources\//,
  /^12-progress-report\//,
];
// Folders whose notes are human guides and must have an H1 title (warning only).
const GUIDE_DIRS = [/^03-framework\//];

const out = (line) => process.stdout.write(`vault-links: ${line}\n`);

/** Control characters removed, for messages. */
function shown(value) {
  // eslint-disable-next-line no-control-regex -- strips control characters before printing
  return String(value).replace(/[\u0000-\u001f\u007f]+/g, ' ');
}

function stat(abs) {
  try {
    return lstatSync(abs);
  } catch {
    return undefined;
  }
}

/** vault-relative paths of every *.md under vault/, sorted; symbolic links are skipped. */
function listNotes() {
  const found = [];
  const walk = (rel) => {
    for (const entry of readdirSync(path.join(VAULT, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && entry.name.endsWith('.md')) found.push(child);
    }
  };
  if (stat(VAULT)?.isDirectory()) walk('');
  return found.sort();
}

/** The text with code (and, outside vault/tests/, generated blocks) replaced by spaces. */
function blankOut(text, skipGenerated) {
  const lines = text.split('\n');
  let fence;
  let generated = false;
  const kept = lines.map((line) => {
    const bare = line.replace(/\r$/, '');
    if (fence !== undefined) {
      const close = bare.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = undefined;
      return ' '.repeat(line.length);
    }
    const open = bare.match(/^ {0,3}(`{3,}|~{3,})/);
    if (open) {
      fence = open[1];
      return ' '.repeat(line.length);
    }
    if (skipGenerated && bare === START) generated = true;
    if (generated) {
      if (bare === END) generated = false;
      return ' '.repeat(line.length);
    }
    // Inline code: a run of n backticks up to the next run of exactly n backticks on the line.
    return line.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (match) => ' '.repeat(match.length));
  });
  return kept.join('\n');
}

/** Line number (1-based) of an offset. */
const lineAt = (text, offset) => text.slice(0, offset).split('\n').length;

/** Every link in one note: { line, kind, target } with kind 'md' or 'wiki'. */
function linksIn(text) {
  const links = [];
  const inline =
    /(!?)\[((?:\\.|[^\\\]\n])*)\]\(\s*(<[^>\n]*>|(?:\\.|[^\s()\\]|\((?:\\.|[^\s()\\])*\))*)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*\)/g;
  for (const match of text.matchAll(inline)) {
    if (match[1] === '!' || (match.index > 0 && text[match.index - 1] === '\\')) continue;
    links.push({
      line: lineAt(text, match.index),
      kind: 'md',
      target: match[3].replace(/^<|>$/g, ''),
    });
  }
  for (const match of text.matchAll(/^ {0,3}\[((?:\\.|[^\\\]\n])+)\]:[ \t]*(<[^>\n]*>|\S+)/gm)) {
    links.push({
      line: lineAt(text, match.index),
      kind: 'md',
      target: match[2].replace(/^<|>$/g, ''),
    });
  }
  for (const match of text.matchAll(/(!?)\[\[([^\]\n]*)\]\]/g)) {
    if (match[1] === '!') continue;
    const target = match[2].split('|')[0];
    links.push({ line: lineAt(text, match.index), kind: 'wiki', target });
  }
  return links;
}

/** { ok: true, abs } or { ok: false, reason }; ignored links give { ignore: true }. */
function resolveLink(note, { kind, target }) {
  const trimmed = target.trim();
  if (kind === 'md' && /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return { ignore: true };
  const pathPart = trimmed.split('#')[0].split('?')[0];
  if (pathPart === '') return { ignore: true }; // same-note anchor
  let decoded;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    return { ok: false, reason: 'malformed percent-encoding' };
  }
  if (kind === 'md' && path.isAbsolute(decoded)) return { ok: false, reason: 'absolute path' };
  const base = kind === 'wiki' ? VAULT : path.dirname(path.join(VAULT, note));
  const abs = path.resolve(base, decoded);
  const fromRoot = path.relative(ROOT, abs);
  if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) {
    return { ok: false, reason: 'outside the project' };
  }
  if (kind === 'wiki') {
    const fromVault = path.relative(VAULT, abs);
    if (fromVault.startsWith('..') || path.isAbsolute(fromVault)) {
      return { ok: false, reason: 'wikilink outside the vault' };
    }
  }
  for (const candidate of [abs, `${abs}.md`]) {
    if (stat(candidate) !== undefined) return { ok: true, abs: path.resolve(candidate) };
  }
  return { ok: false, reason: 'target does not exist' };
}

/** Does the note have a Markdown H1 outside front matter and fenced code? */
function hasH1(text) {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split('\n')
    .map((line) => line.replace(/\r$/, ''));
  let first = 0;
  if (lines[0] === '---') {
    const close = lines.findIndex((line, i) => i > 0 && (line === '---' || line === '...'));
    if (close > 0) first = close + 1;
  }
  let fence;
  let previous; // the last line outside code, for setext headings
  for (const line of lines.slice(first)) {
    if (fence !== undefined) {
      const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = undefined;
      previous = undefined;
      continue;
    }
    const open = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (open) {
      fence = open[1];
      previous = undefined;
      continue;
    }
    const atx = line.match(/^ {0,3}#(?:[ \t]+(.*))?$/);
    if (atx) {
      const content = (atx[1] ?? '').replace(/(^|[ \t]+)#+[ \t]*$/, '').trim();
      if (content !== '') return true;
    }
    if (
      /^ {0,3}=+[ \t]*$/.test(line) &&
      previous !== undefined &&
      /^ {0,3}\S/.test(previous) &&
      !/^ {0,3}#/.test(previous)
    ) {
      return true;
    }
    previous = line.trim() === '' ? undefined : line;
  }
  return false;
}

function main() {
  out(`root ${ROOT}`);
  const notes = listNotes();
  const incoming = new Map(notes.map((note) => [note, 0]));
  const broken = [];
  let checked = 0;
  for (const note of notes) {
    const raw = readFileSync(path.join(VAULT, note), 'utf8');
    const text = blankOut(raw, !note.startsWith('tests/'));
    for (const link of linksIn(text)) {
      const result = resolveLink(note, link);
      if (result.ignore) continue;
      checked += 1;
      if (!result.ok) {
        broken.push(`broken vault/${note}:${link.line}: ${shown(link.target)} (${result.reason})`);
        continue;
      }
      const target = path.relative(VAULT, result.abs).split(path.sep).join('/');
      if (target !== note && incoming.has(target)) incoming.set(target, incoming.get(target) + 1);
    }
  }
  const warnings = [
    ...notes
      .filter((note) => incoming.get(note) === 0 && !ORPHAN_EXEMPT.some((rule) => rule.test(note)))
      .map((note) => `warning vault/${note}: no other note links to it`),
    ...notes
      .filter((note) => GUIDE_DIRS.some((rule) => rule.test(note)))
      .filter((note) => !hasH1(readFileSync(path.join(VAULT, note), 'utf8')))
      .map(
        (note) =>
          `warning vault/${note}: no H1 heading outside code (a guide starts with "# Title")`,
      ),
  ];
  for (const line of [...broken, ...warnings]) out(line);
  out(
    `${notes.length} note(s), ${checked} link(s) checked, ${broken.length} broken, ${warnings.length} warning(s)`,
  );
  return broken.length > 0 ? 1 : 0;
}

if (process.argv.length > 2) {
  process.stderr.write('usage: node scripts/vault-links.mjs\n');
  process.exitCode = 2;
} else {
  process.exitCode = main();
}
