#!/usr/bin/env node
// Environment-gate checker (Week 5 Task 03): `npm run check:env-gates`, also a step of .husky/pre-push.
//
//   node scripts/check-env-gates.mjs [--root <dir>] [<spec file> ...]
//
// Reads tests/**/*.spec.ts (or the files given, which must lie inside the root) with the project's own
// `typescript` package, syntax only (createSourceFile plus the syntactic diagnostics of a one-file
// in-memory program). A spec is read as text and never executed. Only real call expressions count:
// comments, string literals and template text without `${…}` are never declarations or writes; an
// expression inside `${…}` is real code and does count. The script reads no process.env, no .env and
// no network. Output is `file:line:col CODE message`: positions and names, never source text.
//
// Exit codes: 0 no finding (NOTE lines allowed), 1 at least one finding, 2 usage problem, unsafe
// path, missing root or `typescript` not loadable.
//
// What a spec must look like (rule 01; the per-block requirement below extends rule 01's top-level one):
//   import { test } from '@playwright/test' | '…/support/(api|store|db)'
//   import { runIfEnv } from '…/env/runIfEnv'      import { envGuard } from '…/env/envGuard'
//   test.describe('<title>', [{ details }], () => {          // top level, or a direct statement of a describe
//     runIfEnv(test, ['dev']);                                 // FIRST statement of every describe, nested too
//     test('…', async (…) => { await test.step('…', () => envGuard(() => api.post(…))); });
//   });
// Codes: E_PARSE E_UNREADABLE E_NO_SPECS E_NO_DESCRIBE E_IMPORT E_ALIAS E_TOPLEVEL
//   E_TEST_OUTSIDE_DESCRIBE E_DESCRIBE_INDIRECT E_DESCRIBE_FORM E_MODIFIER E_MISSING_DECL
//   E_DECL_NOT_FIRST E_DECL_MISPLACED E_DUPLICATE_DECL E_DECL_UNSUPPORTED E_NOT_DEV_ONLY
//   E_NESTED_NOT_SUBSET E_UNGUARDED_MUTATION E_GUARD_NOT_CLOSURE E_PROD_MUTATION_GUARD E_DIRECT_UI.
//
// Recognized imports: `test` from @playwright/test or a relative …/support/(api|store|db)(.ts);
// `runIfEnv` and `envGuard` from a relative …/env/runIfEnv and …/env/envGuard. Renamed, namespace and
// re-exported imports, local declarations with these names, `const d = test.describe`, computed members
// (`test['describe']`) and a bare `runIfEnv`/`envGuard` used as a value are refused (E_ALIAS).
// Describe modifiers (.only .skip .fixme .fail .slow .serial .parallel .configure) are refused
// (E_MODIFIER). A describe inside a loop, condition or function, or a top-level call that might declare
// tests, is refused (E_DESCRIBE_INDIRECT, E_TOPLEVEL). A declaration is an expression statement that is
// exactly the runIfEnv(...) call: second argument an array literal of 'dev'/'prod' strings, no spread,
// no duplicate. Any list other than exactly ['dev'] fails (E_NOT_DEV_ONLY, rule 01). An inner list must
// be a subset of the outer one; at runtime the outer test.skip already covers inner blocks, so the
// per-block declaration is a readability rule, not a safety one.
//
// Mutation categories (closed lists below, matched by call shape and name; syntax only, no types):
//   http-write    member calls .post .put .patch .delete .fetch on any receiver (deliberately broad),
//                 and a bare global fetch(
//   api-helper    createArticle updateArticle deleteArticle postComment deleteComment
//   owned-record  member calls create createOwn createAs add setQty removeLine applyCoupon clearCoupon
//                 clearCouponIfApplied checkout pay
//   ui-write      member calls addToCart placeOrder
//   ui-direct     click fill press check … in a spec (rule 10 forbids them there): E_DIRECT_UI
//   session       login attemptLogin logout: NOT a data change (owner decision 2026-11-14, option a);
//                 an unguarded one is a NOTE, never a failure
//   self-guarded  read open: the helper guards its own write (OwnedCart.read, CartPage.open); never flagged
// In a block whose list is exactly ['dev'] every write must lie inside the first argument of an
// envGuard(...) call, and that argument must be an arrow or function expression (a promise started
// outside is E_GUARD_NOT_CLOSURE). A block that allows 'prod' must contain neither a guard nor a write.
// Mutation findings need a valid declaration; a block without one reports that first.
//
// Limits: cannot certify arbitrary side effects; cannot see a write behind an unlisted method name or
// write SQL passed to dbQuery; does not scan tests/support, pages or fixture setup (their guards stay
// with review and safety/, and sign-in fixtures such as bearerSession are out of scope); does not check
// step titles; cannot prove runtime behavior (safety/env-helpers.safety.spec.ts covers that).

import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------------------------
// Closed lists (safety-tests/check-env-gates.test.mjs keeps them in step with the guarded helpers)

export const HTTP_WRITE_MEMBERS = new Set(['post', 'put', 'patch', 'delete', 'fetch']);
export const API_HELPER_FUNCTIONS = new Set([
  'createArticle',
  'updateArticle',
  'deleteArticle',
  'postComment',
  'deleteComment',
]);
export const OWNED_RECORD_MEMBERS = new Set([
  'create',
  'createOwn',
  'createAs',
  'add',
  'setQty',
  'removeLine',
  'applyCoupon',
  'clearCoupon',
  'clearCouponIfApplied',
  'checkout',
  'pay',
]);
export const UI_WRITE_MEMBERS = new Set(['addToCart', 'placeOrder']);
export const UI_DIRECT_MEMBERS = new Set([
  'click',
  'dblclick',
  'fill',
  'press',
  'pressSequentially',
  'check',
  'uncheck',
  'selectOption',
  'setInputFiles',
  'dispatchEvent',
  'tap',
  'dragTo',
]);
export const SESSION_NAMES = new Set(['login', 'attemptLogin', 'logout']);
export const SELF_GUARDED_MEMBERS = new Set(['read', 'open']);

const GATE_NAMES = ['test', 'runIfEnv', 'envGuard'];
const RECOGNIZED_SOURCES = {
  test: [/^@playwright\/test$/, /(^|\/)support\/(api|store|db)(\.ts)?$/],
  runIfEnv: [/(^|\/)env\/runIfEnv(\.ts)?$/],
  envGuard: [/(^|\/)env\/envGuard(\.ts)?$/],
};
const MODIFIER_TEST_MEMBERS = new Set(['only', 'skip', 'fixme', 'fail', 'slow']);
const TEST_DEFINITION_MEMBERS = new Set([
  'beforeEach',
  'afterEach',
  'beforeAll',
  'afterAll',
  'use',
]);
const MAX_SPEC_BYTES = 1024 * 1024;
const SESSION_NOTE_DATE = '2026-11-14';

export class UsageError extends Error {}

// ---------------------------------------------------------------------------------------------
// Parsing helpers

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

/** The identifier at the far left of a.b.c / a[b] / a(), or undefined. */
function rootName(ts, expression) {
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

const matchesSource = (name, source) => RECOGNIZED_SOURCES[name].some((re) => re.test(source));
const isRecognizedSource = (source) => GATE_NAMES.some((name) => matchesSource(name, source));

function visitAll(ts, node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => visitAll(ts, child, visit));
}

// ---------------------------------------------------------------------------------------------
// Analysis of one spec's text

/**
 * Returns { findings, notes }; each entry is { line, col, code, message }. Messages name syntax and
 * identifiers only. `ts` is the loaded typescript module.
 */
export function analyseText(ts, fileName, text) {
  const findings = [];
  const notes = [];
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const where = (node) => {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    return { line: line + 1, col: character + 1 };
  };
  const report = (node, code, message) => findings.push({ ...where(node), code, message });
  const note = (node, code, message) => notes.push({ ...where(node), code, message });
  const finish = () => {
    const order = (a, b) => a.line - b.line || a.col - b.col || a.code.localeCompare(b.code);
    findings.sort(order);
    notes.sort(order);
    return { findings, notes };
  };

  const diagnostics = syntaxDiagnostics(ts, source);
  if (diagnostics.length > 0) {
    const first = diagnostics[0];
    const { line, character } = source.getLineAndCharacterOfPosition(first.start ?? 0);
    findings.push({
      line: line + 1,
      col: character + 1,
      code: 'E_PARSE',
      message: 'the file does not parse as TypeScript; fix the syntax error at this position',
    });
    return finish();
  }

  // ---- imports, exports and local declarations -------------------------------------------------
  const imported = new Set();
  const declaredLocally = new Set();
  const importReported = new Set(); // names whose import already has a finding
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const from = ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : '';
      const clause = statement.importClause;
      if (clause === undefined) continue;
      if (clause.name !== undefined && GATE_NAMES.includes(clause.name.text)) {
        importReported.add(clause.name.text);
        report(
          clause.name,
          'E_IMPORT',
          `${clause.name.text} must be a named import from a recognized module, not a default import`,
        );
      }
      const bindings = clause.namedBindings;
      if (bindings !== undefined && ts.isNamespaceImport(bindings) && isRecognizedSource(from)) {
        report(
          bindings,
          'E_ALIAS',
          'namespace import of a gate module; import test, runIfEnv and envGuard by their plain names',
        );
      }
      if (bindings !== undefined && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const local = element.name.text;
          const remote = (element.propertyName ?? element.name).text;
          if (GATE_NAMES.includes(remote) && local !== remote) {
            importReported.add(remote);
            report(
              element,
              'E_ALIAS',
              `${remote} is imported under another name; use the plain name`,
            );
          } else if (GATE_NAMES.includes(local) && remote !== local) {
            importReported.add(local);
            report(element, 'E_ALIAS', `${remote} is imported under the gate name ${local}`);
          } else if (GATE_NAMES.includes(local)) {
            if (!matchesSource(local, from)) {
              importReported.add(local);
              report(
                element,
                'E_IMPORT',
                `${local} is not imported from a recognized module (see the script header)`,
              );
            } else if (!clause.isTypeOnly && !element.isTypeOnly) {
              imported.add(local);
            }
          }
        }
      }
    } else if (ts.isExportDeclaration(statement)) {
      const from =
        statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : undefined;
      const exportsGateName =
        statement.exportClause !== undefined &&
        ts.isNamedExports(statement.exportClause) &&
        statement.exportClause.elements.some(
          (element) =>
            GATE_NAMES.includes(element.name.text) ||
            GATE_NAMES.includes((element.propertyName ?? element.name).text),
        );
      if ((from !== undefined && isRecognizedSource(from)) || exportsGateName) {
        report(
          statement,
          'E_ALIAS',
          'a gate name or module is re-exported; specs import them directly',
        );
      }
    }
  }

  // ---- one pass over the whole tree ------------------------------------------------------------
  const describeCalls = []; // every test.describe(...) call
  const modifierDescribes = []; // every test.describe.<modifier>(...) call
  const testDefinitions = []; // test(...) and test.<hook>(...) calls
  const used = new Set(); // gate names that are called or used
  const ranges = []; // [pos, end] of every describe callback of any kind

  const rangeOfCallback = (call) => {
    const callback = call.arguments[call.arguments.length - 1];
    if (isFunction(ts, callback)) ranges.push([callback.pos, callback.end]);
  };

  const isBareGateUse = (node) => {
    const parent = node.parent;
    if (parent === undefined) return false;
    if (
      ts.isImportSpecifier(parent) ||
      ts.isExportSpecifier(parent) ||
      ts.isImportClause(parent) ||
      ts.isNamespaceImport(parent) ||
      ts.isTypeQueryNode(parent)
    ) {
      return false;
    }
    if (ts.isCallExpression(parent) && parent.expression === node) return false;
    if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
    if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
    if (
      (ts.isVariableDeclaration(parent) ||
        ts.isParameter(parent) ||
        ts.isFunctionDeclaration(parent) ||
        ts.isBindingElement(parent) ||
        ts.isMethodDeclaration(parent) ||
        ts.isPropertyDeclaration(parent)) &&
      parent.name === node
    ) {
      return false;
    }
    return true;
  };

  visitAll(ts, source, (node) => {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node)) {
      if (node.name !== undefined && ts.isIdentifier(node.name)) {
        if (GATE_NAMES.includes(node.name.text)) {
          declaredLocally.add(node.name.text);
          report(node.name, 'E_ALIAS', `a local declaration is named ${node.name.text}; rename it`);
        }
      }
    }
    if (
      ts.isClassDeclaration(node) &&
      node.name !== undefined &&
      GATE_NAMES.includes(node.name.text)
    ) {
      declaredLocally.add(node.name.text);
      report(node.name, 'E_ALIAS', `a local class is named ${node.name.text}; rename it`);
    }
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      const init = node.initializer;
      // A plain name chain (no call in it): `const d = test.describe`, `const g = envGuard`.
      const chain = calleeText(ts, init);
      if (chain !== undefined && GATE_NAMES.includes(chain.split('.')[0])) {
        report(
          init,
          'E_ALIAS',
          `${chain.split('.')[0]} is copied into a variable; call test.describe, runIfEnv and envGuard directly`,
        );
      }
    }
    if (
      ts.isIdentifier(node) &&
      (node.text === 'runIfEnv' || node.text === 'envGuard') &&
      isBareGateUse(node)
    ) {
      report(node, 'E_ALIAS', `${node.text} is used as a value; only direct calls are supported`);
    }
    if (!ts.isCallExpression(node)) return;

    const callee = node.expression;
    if (ts.isElementAccessExpression(callee)) {
      const root = rootName(ts, callee);
      if (root !== undefined && GATE_NAMES.includes(root)) {
        report(node, 'E_ALIAS', `a computed member call on ${root}; use the plain dotted name`);
      }
      return;
    }
    if (ts.isIdentifier(callee) && (callee.text === 'runIfEnv' || callee.text === 'envGuard')) {
      used.add(callee.text);
    }
    const text = calleeText(ts, callee);
    if (text === undefined) return;
    if (text === 'test.describe') {
      used.add('test');
      describeCalls.push(node);
      rangeOfCallback(node);
    } else if (text.startsWith('test.describe.')) {
      used.add('test');
      modifierDescribes.push(node);
      rangeOfCallback(node);
      report(node, 'E_MODIFIER', `${text} is not supported; describe modifiers are refused`);
    } else if (text === 'test') {
      used.add('test');
      testDefinitions.push(node);
    } else if (text.startsWith('test.')) {
      used.add('test');
      const member = text.slice('test.'.length);
      if (MODIFIER_TEST_MEMBERS.has(member)) {
        report(node, 'E_MODIFIER', `${text} is not supported; remove the modifier`);
      } else if (TEST_DEFINITION_MEMBERS.has(member)) {
        testDefinitions.push(node);
      }
    }
  });

  for (const name of used) {
    if (!imported.has(name) && !declaredLocally.has(name) && !importReported.has(name)) {
      const first = describeCalls[0] ?? modifierDescribes[0] ?? testDefinitions[0] ?? source;
      report(first, 'E_IMPORT', `${name} is used but not imported from a recognized module`);
    }
  }

  // ---- top-level statements and describes ------------------------------------------------------
  const handled = new Set(); // describe calls this checker read (supported or refused for form)
  const pendingTop = [];

  const isGateCall = (node, name) =>
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name;

  const classify = (call) => {
    const callee = call.expression;
    if (ts.isPropertyAccessExpression(callee)) {
      const name = callee.name.text;
      if (HTTP_WRITE_MEMBERS.has(name)) return { category: 'http-write', name };
      if (OWNED_RECORD_MEMBERS.has(name)) return { category: 'owned-record', name };
      if (UI_WRITE_MEMBERS.has(name)) return { category: 'ui-write', name };
      if (UI_DIRECT_MEMBERS.has(name)) return { category: 'ui-direct', name };
      if (SESSION_NAMES.has(name)) return { category: 'session', name };
    } else if (ts.isIdentifier(callee)) {
      const name = callee.text;
      if (API_HELPER_FUNCTIONS.has(name)) return { category: 'api-helper', name };
      if (name === 'fetch') return { category: 'http-write', name };
      if (SESSION_NAMES.has(name)) return { category: 'session', name };
    }
    return undefined;
  };

  /** Reads one describe; `parentList` is the enclosing block's allowed list, if it had a valid one. */
  const readDescribe = (call, parentList) => {
    handled.add(call);
    const args = call.arguments;
    const callback = args[args.length - 1];
    const formOk =
      (args.length === 2 || args.length === 3) &&
      isFunction(ts, callback) &&
      callback.parameters.length === 0 &&
      ts.isBlock(callback.body) &&
      (args.length === 2 || ts.isObjectLiteralExpression(args[1]));
    if (!formOk) {
      report(
        call,
        'E_DESCRIBE_FORM',
        'test.describe needs (title, [details object], callback); the callback must be an arrow or function expression without parameters and with a block body',
      );
      return;
    }

    const statements = callback.body.statements;
    const children = new Set();
    for (const statement of statements) {
      if (
        ts.isExpressionStatement(statement) &&
        ts.isCallExpression(statement.expression) &&
        calleeText(ts, statement.expression.expression) === 'test.describe'
      ) {
        children.add(statement.expression);
      }
    }

    const own = { runIfEnv: [], guards: [], writes: [], sessions: [] };
    const visit = (node, guarded) => {
      if (ts.isCallExpression(node)) {
        if (children.has(node)) return;
        if (isGateCall(node, 'runIfEnv')) own.runIfEnv.push(node);
        if (isGateCall(node, 'envGuard')) {
          own.guards.push(node);
          const first = node.arguments[0];
          if (!isFunction(ts, first)) {
            report(
              node,
              'E_GUARD_NOT_CLOSURE',
              'envGuard needs an arrow or function expression as its argument so the write starts inside it',
            );
            for (const argument of node.arguments) visit(argument, guarded);
            return;
          }
          visit(first.body, true);
          for (const argument of node.arguments.slice(1)) visit(argument, guarded);
          return;
        }
        const kind = classify(node);
        if (kind !== undefined) {
          if (kind.category === 'ui-direct') {
            report(
              node,
              'E_DIRECT_UI',
              `a direct page action (${kind.name}) in a spec; rule 10 keeps it in a Page Object`,
            );
          } else if (kind.category === 'session') {
            own.sessions.push({ node, guarded, name: kind.name });
          } else {
            own.writes.push({ node, guarded, ...kind });
          }
        }
      }
      ts.forEachChild(node, (child) => visit(child, guarded));
    };
    visit(callback.body, false);

    const declarations = statements.filter(
      (statement) =>
        ts.isExpressionStatement(statement) && isGateCall(statement.expression, 'runIfEnv'),
    );
    let list;
    let declaration;
    if (declarations.length === 0) {
      report(
        call,
        'E_MISSING_DECL',
        "the first statement of this describe must be runIfEnv(test, ['dev'])",
      );
      for (const misplaced of own.runIfEnv) {
        report(
          misplaced,
          'E_DECL_MISPLACED',
          'runIfEnv is only supported as the first statement of a describe',
        );
      }
    } else {
      declaration = declarations[0].expression;
      if (declarations[0] !== statements[0]) {
        report(
          declaration,
          'E_DECL_NOT_FIRST',
          'runIfEnv must be the first statement of its describe',
        );
      }
      for (const extra of declarations.slice(1)) {
        report(
          extra.expression,
          'E_DUPLICATE_DECL',
          'a describe has exactly one runIfEnv declaration',
        );
      }
      for (const found of own.runIfEnv) {
        if (!declarations.some((statement) => statement.expression === found)) {
          report(
            found,
            'E_DECL_MISPLACED',
            'runIfEnv is only supported as the first statement of a describe',
          );
        }
      }
      list = readList(declaration);
    }

    if (list !== undefined) {
      const shown = `[${list.map((env) => `'${env}'`).join(', ')}]`;
      if (!(list.length === 1 && list[0] === 'dev')) {
        report(
          declaration,
          'E_NOT_DEV_ONLY',
          `the allowed list is ${shown}; rule 01 requires exactly ['dev']`,
        );
      }
      if (parentList !== undefined && !list.every((env) => parentList.includes(env))) {
        report(
          declaration,
          'E_NESTED_NOT_SUBSET',
          `the allowed list ${shown} is not a subset of the enclosing describe's list`,
        );
      }
      if (list.includes('prod')) {
        const offending = [...own.guards, ...own.writes.map((write) => write.node)].sort(
          (a, b) => a.pos - b.pos,
        );
        if (offending.length > 0) {
          report(
            offending[0],
            'E_PROD_MUTATION_GUARD',
            `a block that may run on prod contains ${offending.length} write or guard site(s); it must be read-only`,
          );
        }
      } else {
        for (const write of own.writes) {
          if (!write.guarded) {
            report(
              write.node,
              'E_UNGUARDED_MUTATION',
              `${write.category} call "${write.name}" is not inside envGuard(() => …)`,
            );
          }
        }
      }
    }
    for (const session of own.sessions) {
      if (!session.guarded) {
        note(
          session.node,
          'NOTE',
          `session-unguarded ${session.name}: sign-in and sign-out create or clear a session, not app data (owner decision ${SESSION_NOTE_DATE}); not required inside envGuard`,
        );
      }
    }

    for (const child of children) readDescribe(child, list);
  };

  /** The allowed list of a runIfEnv call, or undefined after reporting why it is unsupported. */
  const readList = (call) => {
    const refuse = (reason) => {
      report(call, 'E_DECL_UNSUPPORTED', reason);
      return undefined;
    };
    const args = call.arguments;
    if (args.length !== 2) return refuse('runIfEnv takes exactly (test, [list])');
    if (!ts.isIdentifier(args[0]) || args[0].text !== 'test') {
      return refuse('the first argument of runIfEnv must be the identifier test');
    }
    const array = args[1];
    if (!ts.isArrayLiteralExpression(array)) {
      return refuse("the second argument must be an array literal such as ['dev']");
    }
    if (array.elements.length === 0) return refuse('the allowed list must not be empty');
    const values = [];
    for (const element of array.elements) {
      if (!ts.isStringLiteral(element) || (element.text !== 'dev' && element.text !== 'prod')) {
        return refuse("every list entry must be the string literal 'dev' or 'prod'");
      }
      if (values.includes(element.text)) return refuse('the allowed list repeats an entry');
      values.push(element.text);
    }
    return values;
  };

  for (const statement of source.statements) {
    if (ts.isExpressionStatement(statement)) {
      const expression = statement.expression;
      const text = ts.isCallExpression(expression)
        ? calleeText(ts, expression.expression)
        : undefined;
      if (text === 'test.describe') {
        readDescribe(expression, undefined);
      } else if (text !== undefined && (text === 'test' || text.startsWith('test.'))) {
        // test(...) outside a describe, modifiers and hooks are reported by the whole-tree pass.
      } else {
        pendingTop.push(statement);
      }
      continue;
    }
    if (
      ts.isImportDeclaration(statement) ||
      ts.isExportDeclaration(statement) ||
      ts.isExportAssignment(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isModuleDeclaration(statement) ||
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isVariableStatement(statement) ||
      ts.isEmptyStatement(statement)
    ) {
      continue;
    }
    pendingTop.push(statement);
  }

  // ---- what the checker could not read ---------------------------------------------------------
  const unhandled = describeCalls.filter((call) => !handled.has(call));
  for (const call of unhandled) {
    report(
      call,
      'E_DESCRIBE_INDIRECT',
      'test.describe is supported only as a top-level statement or a direct statement of another describe callback',
    );
  }
  for (const statement of pendingTop) {
    const hidesDescribe = unhandled.some(
      (call) => call.pos >= statement.pos && call.end <= statement.end,
    );
    if (!hidesDescribe) {
      report(
        statement,
        'E_TOPLEVEL',
        'only imports, declarations and test.describe(...) are supported at the top level; this statement may declare tests the checker cannot see',
      );
    }
  }
  for (const definition of testDefinitions) {
    if (!ranges.some(([start, end]) => definition.pos >= start && definition.end <= end)) {
      report(
        definition,
        'E_TEST_OUTSIDE_DESCRIBE',
        'a test or hook is declared outside any describe',
      );
    }
  }
  if (describeCalls.length === 0 && modifierDescribes.length === 0) {
    findings.push({
      line: 1,
      col: 1,
      code: 'E_NO_DESCRIBE',
      message:
        'no test.describe call found; every spec needs one describe that starts with runIfEnv',
    });
  }
  return finish();
}

/** Names of the functions and methods whose body calls envGuard( (used by the drift check). */
export function guardingMembers(ts, fileName, text) {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const names = new Set();
  visitAll(ts, source, (node) => {
    if (!ts.isCallExpression(node)) return;
    if (!ts.isIdentifier(node.expression) || node.expression.text !== 'envGuard') return;
    let current = node.parent;
    while (current !== undefined) {
      if (
        (ts.isMethodDeclaration(current) || ts.isFunctionDeclaration(current)) &&
        current.name !== undefined
      ) {
        names.add(current.name.text);
        return;
      }
      current = current.parent;
    }
  });
  return names;
}

// ---------------------------------------------------------------------------------------------
// Files and command line

function listSpecs(root) {
  const found = [];
  const walk = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) {
        throw new UsageError(`a symbolic link was found under the root (${entry.name}); refused`);
      }
      if (stat.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full);
      } else if (stat.isFile() && entry.name.endsWith('.spec.ts')) {
        found.push(full);
      }
    }
  };
  walk(root);
  return found;
}

function parseArgs(argv) {
  const options = { root: undefined, files: [], help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--root') {
      index += 1;
      const value = argv[index];
      if (value === undefined || value === '' || value.startsWith('--')) {
        throw new UsageError('--root needs a non-empty directory');
      }
      options.root = value;
    } else if (arg.startsWith('-')) {
      throw new UsageError(`unknown option ${JSON.stringify(arg)}`);
    } else {
      options.files.push(arg);
    }
  }
  return options;
}

const USAGE = [
  'usage: node scripts/check-env-gates.mjs [--root <dir>] [<spec file> ...]',
  'Checks that every describe in tests/**/*.spec.ts starts with runIfEnv(test, [...]) and that dev-only',
  'blocks keep every write inside envGuard(() => …). Syntax only; nothing is executed. See the script header.',
];

/** Runs the checker; returns { code, out: string[], err: string[] } without printing. */
export async function run(argv, cwd = process.cwd()) {
  const out = [];
  const err = [];
  try {
    const options = parseArgs(argv);
    if (options.help) return { code: 0, out: USAGE, err };

    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const root =
      options.root === undefined ? path.join(repoRoot, 'tests') : path.resolve(cwd, options.root);
    let rootStat;
    try {
      rootStat = lstatSync(root);
    } catch {
      throw new UsageError('the root directory does not exist');
    }
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      throw new UsageError('the root must be a real directory');
    }

    let ts;
    try {
      ts = (await import('typescript')).default;
    } catch (error) {
      throw new UsageError(
        `parser unavailable: typescript could not be loaded (${error?.code ?? 'error'})`,
      );
    }

    let files;
    if (options.files.length > 0) {
      files = options.files.map((raw) => {
        const full = path.resolve(cwd, raw);
        const relative = path.relative(root, full);
        if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
          throw new UsageError('a spec file lies outside the root; refused');
        }
        if (!full.endsWith('.spec.ts')) throw new UsageError('only *.spec.ts files can be checked');
        let stat;
        try {
          stat = lstatSync(full);
        } catch {
          throw new UsageError('a spec file does not exist');
        }
        if (stat.isSymbolicLink() || !stat.isFile())
          throw new UsageError('a spec path is not a regular file');
        return full;
      });
    } else {
      files = listSpecs(root);
    }

    const base = path.dirname(root);
    const display = (full) => path.relative(base, full).split(path.sep).join('/');
    let failures = 0;
    let noteCount = 0;

    if (files.length === 0) {
      out.push(`${display(root)}: E_NO_SPECS no *.spec.ts file was found under the root`);
      failures += 1;
    }
    for (const full of files) {
      const name = display(full);
      let text;
      const bytes = readFileSync(full);
      if (bytes.length > MAX_SPEC_BYTES) {
        out.push(`${name}:1:1 E_UNREADABLE the file is larger than 1 MiB`);
        failures += 1;
        continue;
      }
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        out.push(`${name}:1:1 E_UNREADABLE the file is not valid UTF-8`);
        failures += 1;
        continue;
      }
      const result = analyseText(ts, name, text);
      for (const finding of result.findings) {
        out.push(`${name}:${finding.line}:${finding.col} ${finding.code} ${finding.message}`);
        failures += 1;
      }
      for (const item of result.notes) {
        out.push(`${name}:${item.line}:${item.col} ${item.code} ${item.message}`);
        noteCount += 1;
      }
    }
    out.push(
      `check-env-gates: ${files.length} spec file(s), ${failures} finding(s), ${noteCount} note(s)`,
    );
    return { code: failures > 0 ? 1 : 0, out, err };
  } catch (error) {
    if (error instanceof UsageError) {
      err.push(`check-env-gates: ${error.message}`);
      return { code: 2, out, err };
    }
    err.push(`check-env-gates: unexpected error (${error?.name ?? 'Error'}); nothing was checked`);
    return { code: 2, out, err };
  }
}

// Runs only when started as this script (npm run check:env-gates, node scripts/check-env-gates.mjs);
// importing the module, as the isolated test does, runs nothing.
if (path.basename(process.argv[1] ?? '') === 'check-env-gates.mjs') {
  const result = await run(process.argv.slice(2));
  for (const line of result.out) process.stdout.write(`${line}\n`);
  for (const line of result.err) process.stderr.write(`${line}\n`);
  process.exitCode = result.code;
}
