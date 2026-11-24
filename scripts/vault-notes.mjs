// Spec-note generator behind `node scripts/vault-sync.mjs --write | --check` (Week 2 Task 11,
// stage 1). Loaded on demand by those two modes only; the logging modes never import this file or
// the TypeScript compiler.
//
//   tests/<path>.spec.ts  ->  vault/tests/<path>.md
//
// Parsing: the project's own `typescript` package, syntax only (createSourceFile plus the syntactic
// diagnostics of a one-file in-memory program: no type check, no module resolution, no lib files).
// The spec is read as text and never executed. Only the shape the current specs use is accepted:
//   import … from '…'   (test from @playwright/test or, since Week 3 Task 05, tests/support/api.ts;
//                        since Week 3 Task 09 also tests/support/db.ts, since Week 4 Task 01
//                        also tests/support/store.ts)
//   test.describe('<literal>', () => {
//     runIfEnv(test, ['dev']);
//     test('<literal>', async ({ … }) => { … });   // test.step / test.info allowed inside the body
//   });
// Anything else is reported (parse-error, unsupported, dynamic-title, invalid) with line:column and
// no note is written. Messages name paths, positions and syntax, never title text or file content.
//
// Note: only the bytes between the `<!-- generated:start -->` and `<!-- generated:end -->` lines
// are replaced; everything outside stays byte-for-byte. A note must have exactly one of each line,
// in that order; any other line mentioning either marker is refused. The block ends with a hash of
// its own body, so a hand edit inside the block is refused instead of overwritten. The block uses
// the line ending of its start line, and the source hash is taken over the spec with the BOM removed
// and CRLF turned into LF, so a CRLF checkout and an LF checkout give the same note.
//
// The generator never deletes, moves or stages a note. A note whose spec is gone is reported until
// a person removes it or archives it outside vault/tests/.
//
// --write plans every selected spec first and writes only when none failed (temp file + rename).
// --check never writes. Exit codes: 0 ok, 1 a failure was reported, 2 unsafe path (usage).
//
// --write --stage --files (stage 2, used by scripts/hooks/pre-commit-notes.mjs): before anything is
// written, refuses an unsafe Git state (see stageProblems); after writing, checks again that the
// staged specs and the written notes did not change (else restores the notes), then runs
// `git --literal-pathspecs add -- <note>` once per matching note. Never `git add .`.
// refreshFromHook() is the quiet one-spec refresh behind `--from-hook`: it never stages.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

export const START = '<!-- generated:start -->';
export const END = '<!-- generated:end -->';

const posix = path.posix;
const SPEC_SUFFIX = '.spec.ts';
const SPEC_DIR = 'tests';
const NOTE_DIR = 'vault/tests';
const MAX_SPEC_BYTES = 1024 * 1024;
const BLOCK_HASH = /^- \*\*Block SHA-256:\*\* `([0-9a-f]{64})`$/;
const SOURCE_HASH = /^- \*\*SHA-256 \(LF-normalised\):\*\* `([0-9a-f]{64})`$/;
// U+2028 and U+2029 end a line in Markdown and JavaScript, so a title holding one is refused.
const LINE_SEPARATORS = new RegExp(`[${String.fromCharCode(0x2028, 0x2029)}]`);
const OK_STATUSES = new Set(['fresh', 'missing', 'stale', 'deleted']);

/** An unsafe or malformed path argument; the caller exits 2. */
export class UsageError extends Error {}

/** A problem with one spec or note; reported, never thrown past planOne(). */
class InputError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** The readable SyntaxKind name (TypeScript also maps aliases such as FirstStatement). */
function kindName(ts, node) {
  const names = Object.keys(ts.SyntaxKind).filter(
    (key) => ts.SyntaxKind[key] === node.kind && Number.isNaN(Number(key)),
  );
  return names.find((name) => !/^(First|Last)/.test(name)) ?? names[0];
}

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** A path or value for messages: control characters removed, length capped. */
function shown(value) {
  // eslint-disable-next-line no-control-regex -- strips control characters before printing
  const clean = String(value).replace(/[\u0000-\u001f\u007f]+/g, ' ');
  return clean.length > 200 ? `${clean.slice(0, 200)}…` : clean;
}

/** Strict UTF-8; the BOM stays in the string so writing the text back gives the same bytes. */
function decode(buffer, what) {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    throw new InputError('invalid', `${what} is not valid UTF-8`);
  }
}

// ---------------------------------------------------------------------------------------------
// Paths

/** Project-relative spec path with forward slashes; throws UsageError for anything unsafe. */
export function specPath(root, raw) {
  if (typeof raw !== 'string' || raw === '') throw new UsageError('empty path');
  // eslint-disable-next-line no-control-regex -- control characters are refused, not printed
  if (/[\u0000-\u001f\u007f]/.test(raw)) throw new UsageError('control character in a path');
  let rel = raw.replace(/\\/g, '/');
  if (path.isAbsolute(raw) || /^[A-Za-z]:/.test(rel)) {
    const relative = path.relative(root, path.resolve(raw));
    if (relative === '' || path.isAbsolute(relative) || relative.split(path.sep)[0] === '..') {
      throw new UsageError(`outside the project: ${shown(raw)}`);
    }
    rel = relative.split(path.sep).join('/');
  }
  const parts = rel.split('/');
  if (parts[0] === '.') parts.shift();
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new UsageError(`not a plain relative path: ${shown(raw)}`);
  }
  if (parts[0] !== SPEC_DIR || parts.length < 2) {
    throw new UsageError(`not under ${SPEC_DIR}/: ${shown(raw)}`);
  }
  const base = parts.at(-1);
  if (!base.endsWith(SPEC_SUFFIX) || base.length === SPEC_SUFFIX.length) {
    throw new UsageError(`not a *${SPEC_SUFFIX} file: ${shown(raw)}`);
  }
  return parts.join('/');
}

/** tests/<path>.spec.ts -> vault/tests/<path>.md */
export function notePath(spec) {
  return `${NOTE_DIR}/${spec.slice(SPEC_DIR.length + 1, -SPEC_SUFFIX.length)}.md`;
}

/** vault/tests/<path>.md -> tests/<path>.spec.ts */
function sourcePath(note) {
  return `${SPEC_DIR}/${note.slice(NOTE_DIR.length + 1, -'.md'.length)}${SPEC_SUFFIX}`;
}

/** lstat, or undefined when the path does not exist. */
function stat(abs) {
  try {
    return lstatSync(abs);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return undefined;
    throw error;
  }
}

/** Refuses a symbolic link anywhere along rel; returns the final entry's stat (or undefined). */
function statNoLinks(root, rel) {
  let current = root;
  let entry;
  for (const part of rel.split('/')) {
    current = path.join(current, part);
    entry = stat(current);
    if (entry === undefined) return undefined;
    if (entry.isSymbolicLink()) {
      throw new InputError('invalid', `symbolic link in the path: ${shown(rel)}`);
    }
  }
  return entry;
}

/** Sorted project-relative files under dir ending in suffix; symbolic links are reported. */
function listFiles(root, dir, suffix, problems) {
  const found = [];
  const walk = (rel) => {
    const entry = stat(path.join(root, rel));
    if (entry === undefined) return;
    if (entry.isSymbolicLink()) {
      problems.push({ status: 'invalid', path: rel, detail: 'symbolic link (not followed)' });
      return;
    }
    if (!entry.isDirectory()) return;
    for (const child of readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const childRel = `${rel}/${child.name}`;
      if (child.isSymbolicLink()) {
        problems.push({
          status: 'invalid',
          path: childRel,
          detail: 'symbolic link (not followed)',
        });
      } else if (child.isDirectory()) {
        walk(childRel);
      } else if (child.isFile() && child.name.endsWith(suffix)) {
        found.push(childRel);
      }
    }
  };
  walk(dir);
  return found.sort();
}

// ---------------------------------------------------------------------------------------------
// Parsing

/** Syntax diagnostics for one in-memory file; nothing is read from disk or resolved. */
function syntaxDiagnostics(ts, sourceFile) {
  const name = sourceFile.fileName;
  const host = {
    getSourceFile: (file) => (file === name ? sourceFile : undefined),
    writeFile() {},
    getDefaultLibFileName: () => '/lib.d.ts',
    useCaseSensitiveFileNames: () => true,
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: () => '/',
    getNewLine: () => '\n',
    fileExists: (file) => file === name,
    readFile: () => undefined,
  };
  const program = ts.createProgram({
    rootNames: [name],
    options: { noLib: true, noResolve: true, types: [] },
    host,
  });
  return program.getSyntacticDiagnostics(sourceFile);
}

/** "test.describe" for test.describe, undefined for anything that is not a plain name chain. */
function calleeText(ts, expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) {
    const left = calleeText(ts, expression.expression);
    return left === undefined ? undefined : `${left}.${expression.name.text}`;
  }
  return undefined;
}

/** The identifier at the far left of a.b().c[…], or undefined. */
function rootIdentifier(ts, expression) {
  let current = expression;
  while (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current) ||
    ts.isCallExpression(current)
  ) {
    current = current.expression;
  }
  return ts.isIdentifier(current) ? current.text : undefined;
}

const isFunction = (ts, node) =>
  node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));

/**
 * Suite-tag details (Week 5 Task 01): an object literal holding only `tag`, one string or a
 * non-empty array of strings, each `@name`. Any other details object stays unsupported.
 */
function isTagDetails(ts, node) {
  if (node === undefined || !ts.isObjectLiteralExpression(node) || node.properties.length !== 1) {
    return false;
  }
  const [property] = node.properties;
  if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) return false;
  if (property.name.text !== 'tag') return false;
  const isTag = (item) => ts.isStringLiteral(item) && /^@[\w-]+$/.test(item.text);
  const value = property.initializer;
  return (
    isTag(value) ||
    (ts.isArrayLiteralExpression(value) && value.elements.length > 0 && value.elements.every(isTag))
  );
}

/** runIfEnv(test, ['dev']) exactly. */
function isRunIfEnvDev(ts, statement) {
  if (statement === undefined || !ts.isExpressionStatement(statement)) return false;
  const call = statement.expression;
  if (!ts.isCallExpression(call) || calleeText(ts, call.expression) !== 'runIfEnv') return false;
  const [first, second, ...more] = call.arguments;
  return (
    more.length === 0 &&
    first !== undefined &&
    ts.isIdentifier(first) &&
    first.text === 'test' &&
    second !== undefined &&
    ts.isArrayLiteralExpression(second) &&
    second.elements.length === 1 &&
    ts.isStringLiteral(second.elements[0]) &&
    second.elements[0].text === 'dev'
  );
}

// Week 3 Task 05 (D1): the Blog API fixtures extend Playwright's test in this one module. A spec may
// import `test` from it by a relative path, with or without the .ts extension; nothing else.
// Week 3 Task 09: the optional database fixtures (tests/support/db.ts), under the same path rule.
// Week 4 Task 01: the Store API fixtures (tests/support/store.ts), under the same path rule.
const FIXTURE_MODULES = ['tests/support/api', 'tests/support/db', 'tests/support/store'];

/** True when `from`, as written in the spec at `rel`, is a source a spec may take `test` from. */
function isTestSource(rel, from) {
  if (from === '@playwright/test') return true;
  if (!from.startsWith('.')) return false;
  const resolved = posix.normalize(posix.join(posix.dirname(rel), from));
  return FIXTURE_MODULES.some((module) => resolved === module || resolved === `${module}.ts`);
}

/**
 * Titles and Page Object imports of one spec, or the problems that stop a note being written.
 * Returns { describes: [{ title, tests: [title] }], imports: [{ names, file }], problems }.
 */
export function analyseSpec(ts, rel, text) {
  const sourceFile = ts.createSourceFile(
    `/${rel}`,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const problems = [];
  const at = (node) => {
    if (node === undefined) return '';
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    return `${line + 1}:${character + 1}`;
  };
  const report = (kind, node, message) => problems.push({ kind, where: at(node), message });

  const diagnostics = syntaxDiagnostics(ts, sourceFile);
  if (diagnostics.length > 0) {
    for (const diagnostic of diagnostics) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      problems.push({
        kind: 'parse-error',
        where: `${line + 1}:${character + 1}`,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
      });
    }
    return { describes: [], imports: [], problems };
  }

  const describes = [];
  const imports = [];
  const accepted = new Set(); // test-rooted calls in a supported position
  const bodies = new Set(); // callbacks of accepted test(...) calls
  const reported = new Set(); // test(...) calls already reported; calls inside them are not repeated

  const literal = (node, what) => {
    if (
      node !== undefined &&
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ) {
      const value = node.text;
      if (value.trim() === '') {
        report('invalid', node, `empty ${what}`);
        return undefined;
      }
      // eslint-disable-next-line no-control-regex -- such titles cannot be shown on one line
      if (/[\u0000-\u0008\u000a-\u001f\u007f]/.test(value) || LINE_SEPARATORS.test(value)) {
        report('unsupported', node, `line break or control character in the ${what}`);
        return undefined;
      }
      return value;
    }
    let why = 'missing';
    if (node !== undefined) {
      if (ts.isTemplateExpression(node)) why = 'template literal with ${…}';
      else if (ts.isBinaryExpression(node)) why = 'concatenation';
      else if (ts.isIdentifier(node)) why = `identifier ${node.text}`;
      else if (ts.isCallExpression(node)) why = 'function call';
      else why = kindName(ts, node);
    }
    report('dynamic-title', node, `${what} is not a literal (${why})`);
    return undefined;
  };

  const readImport = (declaration) => {
    const from = declaration.moduleSpecifier.text;
    const clause = declaration.importClause;
    const names = [];
    if (clause !== undefined) {
      const typeOnly = clause.isTypeOnly ? 'type ' : '';
      if (clause.name !== undefined) {
        names.push(`${typeOnly}${clause.name.text}`);
        if (clause.name.text === 'test')
          report('unsupported', clause.name, 'test as a default import');
      }
      const bindings = clause.namedBindings;
      if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
        names.push(`${typeOnly}* as ${bindings.name.text}`);
        if (bindings.name.text === 'test')
          report('unsupported', bindings, 'test as a namespace import');
      } else if (bindings !== undefined) {
        for (const element of bindings.elements) {
          const imported = (element.propertyName ?? element.name).text;
          const local = element.name.text;
          const type = typeOnly || (element.isTypeOnly ? 'type ' : '');
          names.push(imported === local ? `${type}${local}` : `${type}${imported} as ${local}`);
          if (imported === 'test' && local !== 'test')
            report('unsupported', element, 'renamed test import');
          else if (local === 'test' && (imported !== 'test' || !isTestSource(rel, from))) {
            report(
              'unsupported',
              element,
              'test imported from somewhere other than @playwright/test or tests/support/api.ts (or tests/support/db.ts, tests/support/store.ts)',
            );
          }
        }
      }
    }
    if (!from.startsWith('.')) return;
    const resolved = posix.normalize(posix.join(posix.dirname(rel), from));
    if (!resolved.startsWith('pages/')) return;
    imports.push({ names, file: resolved.endsWith('.ts') ? resolved : `${resolved}.ts` });
  };

  const readTest = (call, block, seen) => {
    const withTag = call.arguments.length === 3 && isTagDetails(ts, call.arguments[1]);
    if (call.arguments.length !== 2 && !withTag) {
      report(
        'unsupported',
        call,
        call.arguments.length === 3
          ? 'test options argument other than { tag } (title, details, body)'
          : 'test(...) needs exactly a title and a body',
      );
      reported.add(call);
      return;
    }
    const titleNode = call.arguments[0];
    const body = call.arguments[call.arguments.length - 1];
    const title = literal(titleNode, 'test title');
    if (!isFunction(ts, body)) {
      report('unsupported', body, 'test body is not a function');
      reported.add(call);
      return;
    }
    accepted.add(call);
    bodies.add(body);
    if (title === undefined) return;
    if (seen.has(title)) report('invalid', titleNode, 'duplicate test title in this test.describe');
    seen.add(title);
    block.tests.push(title);
  };

  const readDescribe = (call) => {
    const withTag = call.arguments.length === 3 && isTagDetails(ts, call.arguments[1]);
    if (call.arguments.length !== 2 && !withTag) {
      report(
        'unsupported',
        call,
        'test.describe(...) needs a title, an optional { tag } details object and a callback',
      );
      reported.add(call);
      return;
    }
    const titleNode = call.arguments[0];
    const callback = call.arguments[call.arguments.length - 1];
    const title = literal(titleNode, 'describe title');
    if (!isFunction(ts, callback) || callback.parameters.length > 0 || !ts.isBlock(callback.body)) {
      report(
        'unsupported',
        callback,
        'test.describe callback must be a function with no parameters',
      );
      reported.add(call);
      return;
    }
    accepted.add(call);
    const block = { title, tests: [] };
    const statements = [...callback.body.statements];
    const first = statements[0];
    const firstIsRunIfEnv =
      first !== undefined &&
      ts.isExpressionStatement(first) &&
      ts.isCallExpression(first.expression) &&
      calleeText(ts, first.expression.expression) === 'runIfEnv';
    if (firstIsRunIfEnv) statements.shift();
    if (!isRunIfEnvDev(ts, first)) {
      report(
        'invalid',
        statements[0] ?? callback,
        "the first statement of test.describe must be runIfEnv(test, ['dev'])",
      );
    }
    const seen = new Set();
    for (const statement of statements) {
      const call =
        ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)
          ? statement.expression
          : undefined;
      if (call !== undefined && calleeText(ts, call.expression) === 'test') {
        readTest(call, block, seen);
      } else if (call !== undefined && rootIdentifier(ts, call.expression) === 'test') {
        // Reported by the full walk below (nested describe, hooks, .only, …).
      } else {
        report(
          'unsupported',
          statement,
          `${kindName(ts, statement)} inside test.describe (only runIfEnv and test(...) are supported)`,
        );
      }
    }
    if (block.tests.length === 0)
      report('invalid', call, 'test.describe contains no supported tests');
    if (title !== undefined && describes.some((existing) => existing.title === title)) {
      report('invalid', titleNode, 'duplicate test.describe title');
    }
    describes.push(block);
  };

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      readImport(statement);
      continue;
    }
    const call =
      ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)
        ? statement.expression
        : undefined;
    if (call !== undefined && calleeText(ts, call.expression) === 'test.describe') {
      readDescribe(call);
    } else if (call !== undefined && rootIdentifier(ts, call.expression) === 'test') {
      // Reported by the full walk below.
    } else {
      report(
        'unsupported',
        statement,
        `top-level ${kindName(ts, statement)} (only imports and test.describe(...) are supported)`,
      );
    }
  }

  // Full walk: every use of `test` must be one of the accepted shapes above.
  const insideAny = (node, set) => {
    for (let current = node.parent; current !== undefined; current = current.parent) {
      if (set.has(current)) return true;
    }
    return false;
  };
  const visit = (node) => {
    if (ts.isCallExpression(node) && rootIdentifier(ts, node.expression) === 'test') {
      const name = calleeText(ts, node.expression);
      const allowedInBody =
        (name === 'test.step' || name === 'test.info') && insideAny(node, bodies);
      if (
        !accepted.has(node) &&
        !allowedInBody &&
        !insideAny(node, reported) &&
        !reported.has(node)
      ) {
        if (name === 'test') {
          report(
            'unsupported',
            node,
            'test(...) outside test.describe, or inside a loop, condition or test body',
          );
        } else if (name === 'test.describe') {
          report('unsupported', node, 'test.describe(...) nested or not a top-level statement');
        } else {
          report('unsupported', node, `unsupported wrapper ${name ?? 'test(...)(...)'}`);
        }
        reported.add(node);
      }
    } else if (ts.isIdentifier(node) && node.text === 'test') {
      const parent = node.parent;
      const fine =
        (ts.isCallExpression(parent) && parent.expression === node) ||
        (ts.isPropertyAccessExpression(parent) &&
          (parent.expression === node || parent.name === node)) ||
        (ts.isCallExpression(parent) && calleeText(ts, parent.expression) === 'runIfEnv') ||
        ts.isImportSpecifier(parent) ||
        ts.isImportClause(parent) ||
        ts.isNamespaceImport(parent) ||
        (ts.isPropertyAssignment(parent) && parent.name === node);
      if (!fine && !insideAny(node, reported)) {
        report(
          'unsupported',
          node,
          'test used as a value or redeclared (aliases and wrappers are not supported)',
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (problems.length === 0 && describes.length === 0) {
    problems.push({
      kind: 'invalid',
      where: '',
      message: 'no tests found (expected test.describe(...) containing test(...) calls)',
    });
  }
  return { describes, imports, problems };
}

// ---------------------------------------------------------------------------------------------
// Rendering

/** A Markdown code span that survives backticks and edge spaces in the text. */
function codeSpan(text) {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = '`'.repeat(longest + 1);
  const pad =
    text.startsWith('`') ||
    text.endsWith('`') ||
    (text.startsWith(' ') && text.endsWith(' ') && text.trim() !== '')
      ? ' '
      : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

/** [project/path](relative/link) from a note to a project file. */
function fileLink(fromNote, target) {
  const label = target.replace(/[\\[\]`*_<>]/g, '\\$&');
  const href = encodeURI(posix.relative(posix.dirname(fromNote), target)).replace(
    /[()#?]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `[${label}](${href})`;
}

/** The block body (between the markers, without the block hash line). */
function renderBody(root, spec, note, sourceHash, analysis) {
  const lines = [
    `- **Source:** ${fileLink(note, spec)}`,
    `- **SHA-256 (LF-normalised):** \`${sourceHash}\``,
    '- **Parser:** typescript — ok',
    '- **Titles:**',
  ];
  for (const { title, tests } of analysis.describes) {
    lines.push(`  - ${codeSpan(title)}`);
    for (const test of tests) lines.push(`    - ${codeSpan(test)}`);
  }
  if (analysis.imports.length === 0) {
    lines.push('- **Page Object imports:** none');
  } else {
    lines.push('- **Page Object imports:**');
    for (const { names, file } of analysis.imports) {
      const shownNames = names.length > 0 ? names.map(codeSpan).join(', ') : '(side-effect import)';
      const entry = stat(path.join(root, file));
      const where = entry?.isFile() ? fileLink(note, file) : `${codeSpan(file)} (file not found)`;
      lines.push(`  - ${shownNames} — ${where}`);
    }
  }
  return lines;
}

const blockHashLine = (body) => `- **Block SHA-256:** \`${sha256(body.join('\n'))}\``;

/** The front matter, heading, block and placeholder of a note that does not exist yet. */
function newNoteText(spec, blockLines) {
  const id = `tests-${spec
    .slice(SPEC_DIR.length + 1, -SPEC_SUFFIX.length)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`;
  return [
    '---',
    `id: ${id}`,
    'type: test-note',
    '---',
    '',
    `# ${posix.basename(spec).replace(/[\\`*_<>[\]]/g, '\\$&')}`,
    '',
    ...blockLines,
    '',
    '## About this test',
    '',
    '_Not written yet. Explain the requirement, the evidence for each assertion and the last verified',
    'result here, outside the generated block._',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------
// Existing notes

/** Lines with their offsets; `content` has no line ending, `eol` is '\n', '\r\n' or ''. */
function splitLines(text) {
  const lines = [];
  let position = 0;
  for (;;) {
    const newline = text.indexOf('\n', position);
    const lineEnd = newline === -1 ? text.length : newline;
    let content = text.slice(position, lineEnd);
    const crlf = newline !== -1 && content.endsWith('\r');
    if (crlf) content = content.slice(0, -1);
    lines.push({
      start: position,
      contentEnd: position + content.length,
      content,
      eol: newline === -1 ? '' : crlf ? '\r\n' : '\n',
    });
    if (newline === -1) return lines;
    position = newline + 1;
  }
}

/** The generated block of an existing note; throws InputError for damaged or repeated markers. */
function readBlock(text) {
  const lines = splitLines(text);
  const starts = [];
  const ends = [];
  const damaged = [];
  lines.forEach((line, index) => {
    if (line.content === START) starts.push(index);
    else if (line.content === END) ends.push(index);
    else if (line.content.includes('generated:start') || line.content.includes('generated:end')) {
      damaged.push(index + 1);
    }
  });
  if (starts.length === 0 && ends.length === 0 && damaged.length === 0) {
    throw new InputError('invalid', 'not a managed note (no generated:start/end lines)');
  }
  const faults = [];
  if (damaged.length > 0) faults.push(`damaged marker on line ${damaged.join(', ')}`);
  if (starts.length !== 1) faults.push(`expected one generated:start line, found ${starts.length}`);
  if (ends.length !== 1) faults.push(`expected one generated:end line, found ${ends.length}`);
  if (faults.length === 0 && ends[0] < starts[0])
    faults.push('generated:end comes before generated:start');
  if (faults.length > 0) throw new InputError('invalid', faults.join('; '));

  const body = lines.slice(starts[0] + 1, ends[0]).map((line) => line.content);
  const hashLine = body.at(-1)?.match(BLOCK_HASH);
  if (hashLine === undefined || hashLine === null) {
    throw new InputError(
      'invalid',
      'block hash line missing (hand edit inside the generated block?)',
    );
  }
  if (sha256(body.slice(0, -1).join('\n')) !== hashLine[1]) {
    throw new InputError(
      'invalid',
      'hand edit inside the generated block (block hash does not match); move hand-written text outside the markers',
    );
  }
  return {
    body,
    before: text.slice(0, lines[starts[0]].start),
    after: text.slice(lines[ends[0]].contentEnd),
    eol: lines[starts[0]].eol,
  };
}

// ---------------------------------------------------------------------------------------------
// Planning and running

/** What to do for one spec path: { spec, note, status, detail?, text? }. Never throws InputError. */
function planOne(ts, root, spec) {
  const note = notePath(spec);
  const result = { spec, note };
  try {
    const specEntry = statNoLinks(root, spec);
    const noteEntry = statNoLinks(root, note);
    if (specEntry !== undefined && !specEntry.isFile())
      throw new InputError('invalid', `${spec} is not a file`);
    if (noteEntry !== undefined && !noteEntry.isFile())
      throw new InputError('invalid', `${note} is not a file`);

    let block;
    if (noteEntry !== undefined) {
      try {
        block = readBlock(decode(readFileSync(path.join(root, note)), note));
      } catch (error) {
        if (error instanceof InputError) error.subject = note;
        throw error;
      }
    }

    if (specEntry === undefined) {
      if (block === undefined) return { ...result, status: 'deleted' };
      return {
        ...result,
        status: 'source-missing',
        detail: `${spec} no longer exists; review ${note}, then remove it or archive it outside ${NOTE_DIR}/ (the generator never deletes notes)`,
      };
    }

    const expected = path.join(realpathSync.native(root), ...spec.split('/'));
    if (realpathSync.native(path.join(root, spec)) !== expected) {
      throw new InputError('invalid', 'letter case differs from the file on disk');
    }
    const buffer = readFileSync(path.join(root, spec));
    if (buffer.length > MAX_SPEC_BYTES)
      throw new InputError('invalid', `larger than ${MAX_SPEC_BYTES} bytes`);
    const text = decode(buffer, spec)
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n');
    const sourceHash = sha256(text);

    const analysis = analyseSpec(ts, spec, text);
    if (analysis.problems.length > 0) {
      const order = ['parse-error', 'unsupported', 'dynamic-title', 'invalid'];
      const status = order.find((kind) =>
        analysis.problems.some((problem) => problem.kind === kind),
      );
      const detail = analysis.problems
        .map(({ kind, where, message }) => `${where ? `${where} ` : ''}${kind}: ${message}`)
        .join('; ');
      return { ...result, status, detail };
    }

    const body = renderBody(root, spec, note, sourceHash, analysis);
    const full = [...body, blockHashLine(body)];
    const blockLines = [START, ...full, END];
    if (block === undefined)
      return { ...result, status: 'missing', text: newNoteText(spec, blockLines) };

    if (block.body.length === full.length && block.body.every((line, i) => line === full[i])) {
      return { ...result, status: 'fresh' };
    }
    const recorded = block.body.find((line) => SOURCE_HASH.test(line))?.match(SOURCE_HASH)[1];
    return {
      ...result,
      status: 'stale',
      detail: recorded === sourceHash ? 'generated content differs' : 'source changed',
      text: block.before + blockLines.join(block.eol) + block.after,
    };
  } catch (error) {
    if (error instanceof InputError) {
      return { ...result, status: error.status, detail: error.message, where: error.subject };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Git safety (--stage)

/** git with an argument array (no shell) and literal pathspecs; throws unless the exit is allowed. */
function git(root, args, allow = [0]) {
  // check-ignore takes plain paths and refuses pathspec magic, including --literal-pathspecs.
  const literal = args[0] === 'check-ignore' ? [] : ['--literal-pathspecs'];
  const result = spawnSync('git', [...literal, '-c', 'core.quotepath=off', ...args], {
    cwd: root,
    maxBuffer: 256 * 1024 * 1024,
    timeout: 60000,
    windowsHide: true,
  });
  if (result.error || !allow.includes(result.status)) {
    throw new InputError(
      'invalid',
      `git ${args[0]} failed${result.status === null ? '' : ` (exit ${result.status})`}`,
    );
  }
  return result;
}

const nulList = (buffer) => buffer.toString('utf8').split('\0').filter(Boolean);
const inIndex = (root, rel) =>
  nulList(git(root, ['ls-files', '-z', '--', rel]).stdout).includes(rel);
const hasUnstaged = (root, rel) =>
  nulList(git(root, ['diff', '--name-only', '-z', '--', rel]).stdout).length > 0;
const indexBlob = (root, rel) =>
  inIndex(root, rel)
    ? git(root, ['rev-parse', `:${rel}`])
        .stdout.toString('utf8')
        .trim()
    : 'absent';

/** Text outside the markers (before NUL after), or undefined without exactly one valid pair. */
function outsideText(text) {
  const lines = splitLines(text);
  const starts = lines.filter((line) => line.content === START);
  const ends = lines.filter((line) => line.content === END);
  if (starts.length !== 1 || ends.length !== 1 || ends[0].start < starts[0].start) return undefined;
  return `${text.slice(0, starts[0].start)}\0${text.slice(ends[0].contentEnd)}`;
}

/** Problems with the repository itself: not the top of a work tree, or an operation in progress. */
function repoProblems(root) {
  const problems = [];
  const top = git(root, ['rev-parse', '--show-toplevel']).stdout.toString('utf8').trim();
  if (path.relative(realpathSync.native(top), realpathSync.native(root)) !== '') {
    problems.push('the project root is not the top of its Git work tree');
  }
  for (const name of [
    'MERGE_HEAD',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'rebase-merge',
    'rebase-apply',
  ]) {
    const where = git(root, ['rev-parse', '--git-path', name]).stdout.toString('utf8').trim();
    if (stat(path.resolve(root, where)) !== undefined) {
      problems.push(`${name} exists (a merge, rebase, cherry-pick or revert is in progress)`);
    }
  }
  return problems;
}

/**
 * Why staging the notes of these specs would be unsafe, checked before anything is written:
 *   spec  untracked or removed with `git rm --cached`; deleted but not staged; partially staged
 *   note  ignored; deleted but not staged; tracked with unstaged edits outside the block;
 *         untracked with text outside the block that differs from a new note's (needs review)
 * A tracked note whose only unstaged change is inside the block (a `--from-hook` refresh) is fine.
 */
export function stageProblems(root, specs) {
  const problems = repoProblems(root);
  for (const spec of specs) {
    const note = notePath(spec);
    const specOnDisk = stat(path.join(root, spec)) !== undefined;
    const specStaged = inIndex(root, spec);
    if (specOnDisk && !specStaged) {
      problems.push(
        `${spec}: not staged (untracked, or removed from the index with git rm --cached)`,
      );
    } else if (!specOnDisk && specStaged) {
      problems.push(`${spec}: deleted in the working copy, but the deletion is not staged`);
    } else if (specOnDisk && hasUnstaged(root, spec)) {
      problems.push(`${spec}: partially staged (unstaged changes); stage or stash them first`);
    }

    const noteOnDisk = stat(path.join(root, note)) !== undefined;
    const noteStaged = inIndex(root, note);
    if (noteOnDisk && git(root, ['check-ignore', '-q', '--', note], [0, 1]).status === 0) {
      problems.push(`${note}: ignored by Git`);
    }
    if (!noteOnDisk && noteStaged) {
      problems.push(`${note}: deleted in the working copy, but the deletion is not staged`);
    } else if (noteOnDisk && noteStaged && hasUnstaged(root, note)) {
      // Compared without CR: with core.autocrlf the index holds LF and the working copy CRLF.
      const lf = (text) => text.replace(/\r\n/g, '\n');
      const staged = lf(git(root, ['cat-file', 'blob', `:${note}`]).stdout.toString('utf8'));
      const disk = lf(readFileSync(path.join(root, note), 'utf8'));
      if (outsideText(staged) !== outsideText(disk)) {
        problems.push(
          `${note}: unstaged edits outside the generated block; stage or undo them first`,
        );
      }
    } else if (noteOnDisk && !noteStaged) {
      const disk = readFileSync(path.join(root, note), 'utf8');
      if (
        outsideText(disk) === undefined ||
        outsideText(disk) !== outsideText(newNoteText(spec, [START, END]))
      ) {
        problems.push(
          `${note}: untracked note with hand-written text; review it and git add it first`,
        );
      }
    }
  }
  return problems;
}

/** Temp file in the same folder, then rename, so a failed write never leaves half a note. */
function writeAtomic(abs, text) {
  mkdirSync(path.dirname(abs), { recursive: true });
  const temp = `${abs}.${process.pid}.vault-sync.tmp`;
  try {
    writeFileSync(temp, text, { flag: 'wx' });
    renameSync(temp, abs);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

/**
 * The quiet refresh behind `--from-hook`: rewrites the note of one existing spec when it is stale or
 * missing, never stages. Returns undefined when nothing needs saying, else a one-line reason that
 * names only the status and the path.
 */
export async function refreshFromHook(root, projectPath) {
  let spec;
  try {
    spec = specPath(root, projectPath);
  } catch {
    return undefined; // not a tests/**/*.spec.ts path
  }
  if (!stat(path.join(root, spec))?.isFile()) return undefined;
  const ts = (await import('typescript')).default;
  const plan = planOne(ts, root, spec);
  if (plan.text !== undefined) {
    writeAtomic(path.join(root, plan.note), plan.text);
    return undefined;
  }
  if (plan.status === 'fresh') return undefined;
  return `note not refreshed: ${plan.status} ${plan.where ?? plan.spec}; run npm run vault:check for details`;
}

/**
 * Runs --write or --check for the given spec paths (undefined: every spec and every managed note).
 * With stage (only --write with files), Git safety comes first and matching notes are staged.
 * Prints to stdout/stderr and returns the exit code.
 */
export async function run(root, mode, files, { stage = false } = {}) {
  const out = (line) => process.stdout.write(`vault-sync: ${line}\n`);
  const err = (line) => process.stderr.write(`vault-sync: ${line}\n`);

  let specs;
  try {
    if (files !== undefined) {
      const byLower = new Map();
      specs = [];
      for (const raw of files) {
        const spec = specPath(root, raw);
        const lower = spec.toLowerCase();
        if (byLower.has(lower) && byLower.get(lower) !== spec) {
          throw new UsageError(
            `paths differ only in letter case: ${shown(byLower.get(lower))}, ${shown(spec)}`,
          );
        }
        if (!byLower.has(lower)) specs.push(spec);
        byLower.set(lower, spec);
      }
    }
  } catch (error) {
    if (error instanceof UsageError) {
      err(error.message);
      return 2;
    }
    throw error;
  }

  const rootEntry = stat(root);
  if (rootEntry === undefined || !rootEntry.isDirectory()) {
    err(`project root is not a folder: ${shown(root)}`);
    return 1;
  }

  let ts;
  try {
    ts = (await import('typescript')).default;
  } catch (error) {
    err(`parser unavailable: typescript could not be loaded (${error?.code ?? 'error'})`);
    return 1;
  }

  const listing = [];
  if (specs === undefined) {
    const fromSpecs = listFiles(root, SPEC_DIR, SPEC_SUFFIX, listing);
    const fromNotes = listFiles(root, NOTE_DIR, '.md', listing).map(sourcePath);
    specs = [...new Set([...fromSpecs, ...fromNotes])].sort();
  }

  out(`root ${root}`);
  let blobsBefore;
  if (stage) {
    let refused;
    try {
      refused = stageProblems(root, specs);
    } catch (error) {
      if (!(error instanceof InputError)) throw error;
      refused = [error.message];
    }
    if (refused.length > 0) {
      for (const problem of refused) err(`refused ${problem}`);
      out(`--write --stage: ${refused.length} refused; nothing written or staged`);
      return 1;
    }
    blobsBefore = new Map(specs.map((spec) => [spec, indexBlob(root, spec)]));
  }
  const plans = specs.map((spec) => planOne(ts, root, spec));
  const failures = [
    ...listing.map(({ status, path: where, detail }) => ({ status, where, detail })),
    ...plans
      .filter(
        (plan) =>
          !(mode === '--check' ? ['fresh', 'deleted'] : [...OK_STATUSES]).includes(plan.status),
      )
      .map(({ status, spec, note, detail, where }) => ({
        status,
        where:
          where ??
          (status === 'missing' || status === 'stale' || status === 'source-missing' ? note : spec),
        detail,
      })),
  ];
  for (const { status, where, detail } of failures) {
    err(`${status} ${where}${detail ? `: ${detail}` : ''}`);
  }

  const count = (status) => plans.filter((plan) => plan.status === status).length;
  if (mode === '--check') {
    out(
      `--check: ${plans.length} spec path(s), ${count('fresh')} fresh, ${count('deleted')} deleted with no note, ${failures.length} failed`,
    );
    return failures.length > 0 ? 1 : 0;
  }

  if (failures.length > 0) {
    out(`--write: ${failures.length} failed; nothing written`);
    return 1;
  }
  let written = 0;
  const originals = new Map(); // note -> bytes before this run (undefined: did not exist)
  for (const plan of plans) {
    if (plan.text === undefined) {
      if (plan.status === 'fresh') out(`unchanged ${plan.note}`);
      continue;
    }
    const abs = path.join(root, plan.note);
    originals.set(plan.note, plan.status === 'missing' ? undefined : readFileSync(abs));
    try {
      writeAtomic(abs, plan.text);
    } catch (error) {
      err(
        `could not write ${plan.note} (${error?.code ?? 'error'}); ${written} note(s) already written`,
      );
      return 1;
    }
    written += 1;
    out(`${plan.status === 'missing' ? 'created' : 'updated'} ${plan.note}`);
  }
  out(
    `--write: ${plans.length} spec path(s), ${count('missing')} created, ${count('stale')} updated, ${count('fresh')} unchanged, ${count('deleted')} deleted with no note`,
  );
  if (!stage) return 0;

  // Recheck before staging: the staged specs and the written notes must be exactly as planned.
  const changed = [];
  try {
    for (const spec of specs) {
      if (indexBlob(root, spec) !== blobsBefore.get(spec))
        changed.push(`${spec}: staged copy changed`);
      else if (stat(path.join(root, spec)) !== undefined && hasUnstaged(root, spec)) {
        changed.push(`${spec}: changed in the working copy`);
      }
    }
    for (const plan of plans) {
      if (plan.text === undefined) continue;
      if (readFileSync(path.join(root, plan.note), 'utf8') !== plan.text) {
        changed.push(`${plan.note}: changed after it was written`);
      }
    }
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
    changed.push(error.message);
  }
  if (changed.length > 0) {
    for (const [note, bytes] of originals) {
      if (bytes === undefined) rmSync(path.join(root, note), { force: true });
      else writeAtomic(path.join(root, note), bytes);
    }
    for (const problem of changed) err(`refused ${problem}`);
    out(
      `--write --stage: ${changed.length} changed during the run; notes restored, nothing staged`,
    );
    return 1;
  }

  let staged = 0;
  for (const plan of plans) {
    if (stat(path.join(root, plan.note)) === undefined) continue;
    if (inIndex(root, plan.note) && !hasUnstaged(root, plan.note)) continue;
    git(root, ['add', '--', plan.note]);
    staged += 1;
    out(`staged ${plan.note}`);
  }
  out(`--write --stage: ${staged} note(s) staged`);
  return 0;
}
