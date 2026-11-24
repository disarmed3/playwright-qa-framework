#!/usr/bin/env node
// Traceability report (Week 5 Task 04, rule 55). Offline: it joins local files only.
//
//   node scripts/jira/traceability.mjs --snapshot <jira-snapshot.json> --list <playwright-list.json> [--out <report.md>]
//
// Inputs
//   --snapshot  written by the main conversation from the approved read-only Jira connector (jira_search,
//               jira_get_issue) and nothing else: { site, projectKey, readAt, route, queries:[{jql, pages,
//               complete}], issues:[{key, summary, issuetype, status, labels, parent}] }
//   --list      `npm run test:list -- --reporter=json` output saved to a file (lists tests, runs none)
//   catalog     vault/sources/test-catalog/*.md, rows that start with | **TC-…** |
//   code        the `runIfEnv(test, [...])` declaration around each listed test, read as syntax with the
//               project's own `typescript` package; a non-literal list is "unknown declaration"
// It never calls Jira, never reads .env and never creates or edits anything in Jira. Label corrections
// are printed as proposals only.
//
// Exit: 0 report written (findings are not failures); 1 usage; 2 unusable input or INCOMPLETE paging
// (a partial read supports no conclusion).

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { Refusal, isFileTitle, tcOf } from './lib.mjs';

const ENV_LABELS = ['env-dev', 'env-dev-prod', 'env-prod'];
const LABEL_FOR = { dev: 'env-dev', 'dev,prod': 'env-dev-prod', prod: 'env-prod' };

// ---------- inputs ----------

export function readSnapshot(path) {
  if (!existsSync(path)) throw new Refusal('snapshot not found', 2);
  let s;
  try {
    s = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Refusal('snapshot is not valid JSON', 2);
  }
  if (!s || !Array.isArray(s.issues) || !Array.isArray(s.queries) || s.queries.length === 0)
    throw new Refusal('snapshot needs queries[] and issues[]', 2);
  return s;
}

// `npm run test:list` puts npm's own banner (lines that start with `>`, and blank lines) before the
// JSON. Only those leading lines are dropped; anything else before the JSON is still refused.
export function stripNpmBanner(text) {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && (lines[i].trim() === '' || lines[i].startsWith('>'))) i++;
  return lines.slice(i).join('\n');
}

export function readList(path) {
  if (!existsSync(path)) throw new Refusal('test list not found', 2);
  let r;
  try {
    r = JSON.parse(stripNpmBanner(readFileSync(path, 'utf8')));
  } catch {
    throw new Refusal('test list is not valid JSON', 2);
  }
  if (!Array.isArray(r?.suites)) throw new Refusal('not a Playwright JSON list', 2);
  const tests = [];
  const walk = (suite, chain) => {
    const here = suite.title && !isFileTitle(suite.title) ? [...chain, suite.title] : chain;
    for (const spec of suite.specs || [])
      for (const t of spec.tests || [])
        tests.push({
          file: (spec.file || suite.file).replace(/\\/g, '/'),
          title: spec.title,
          tcId: tcOf(spec.title),
          project: t.projectName || null,
          identity: `${(spec.file || suite.file).replace(/\\/g, '/')} > ${[...here, spec.title].join(' > ')} [${t.projectName || 'project?'}]`,
        });
    for (const c of suite.suites || []) walk(c, here);
  };
  for (const s of r.suites) walk(s, []);
  return tests;
}

// IDs a catalog file lists as deferred: the paragraph that has "Deferred … :" followed by a list such as
// "TC-SUI-010, 014, 015, 001 to 006, 040, 050 and 051." (the family is the last full ID seen). An ID the
// file says was "taken out of the deferred list" is removed again.
export function deferredIds(text) {
  const ids = new Set();
  for (const para of text.split(/\n\s*\n/)) {
    const m = para.replace(/\s+/g, ' ').match(/Deferred[^:]*:\s*(.*?)\.(?:\s|$)/);
    if (!m) continue;
    let family = null;
    for (const t of m[1].matchAll(/(?:TC-([A-Z]+)-)?(\d{3})(?:\s+to\s+(\d{3}))?/g)) {
      if (t[1]) family = t[1];
      if (!family) continue;
      const from = Number(t[2]);
      const to = t[3] ? Number(t[3]) : from;
      for (let n = from; n <= to; n++) ids.add(`TC-${family}-${String(n).padStart(3, '0')}`);
    }
  }
  for (const m of text
    .replace(/\s+/g, ' ')
    .matchAll(/(TC-[A-Z]+-\d+) was taken out of the deferred list/g))
    ids.delete(m[1]);
  return ids;
}

// `only`: catalog file names to read (for example ['store-ui.md']); default every file. An ID the
// catalog lists as deferred but has no row for is kept as `rowless` so it is not called unknown.
export function readCatalog(root, only = null) {
  const dir = join(root, 'vault', 'sources', 'test-catalog');
  const rows = new Map();
  rows.scope = only;
  if (!existsSync(dir)) return rows;
  for (const f of readdirSync(dir).filter(
    (n) => n.endsWith('.md') && (!only || only.includes(n)),
  )) {
    const text = readFileSync(join(dir, f), 'utf8');
    const file = `vault/sources/test-catalog/${f}`;
    for (const line of text.split('\n')) {
      const m = line.match(/^\|\s*\*\*(TC-[A-Z]+-\d+)\*\*\s*\|/);
      if (!m) continue;
      const entry = { file, manual: /intentionally manual|manual only|stays manual/i.test(line) };
      if (rows.has(m[1])) rows.get(m[1]).duplicates = (rows.get(m[1]).duplicates || 0) + 1;
      else rows.set(m[1], entry);
    }
    for (const id of deferredIds(text)) {
      if (rows.has(id)) rows.get(id).deferred = true;
      else rows.set(id, { file, manual: false, deferred: true, rowless: true });
    }
  }
  return rows;
}

// ---------- code declarations ----------

function listOf(call) {
  const arg = call.arguments[1];
  if (!arg || !ts.isArrayLiteralExpression(arg)) return 'unknown';
  const vals = [];
  for (const e of arg.elements) {
    if (!ts.isStringLiteral(e) || !['dev', 'prod'].includes(e.text)) return 'unknown';
    vals.push(e.text);
  }
  return vals.length ? [...new Set(vals)].sort().join(',') : 'unknown';
}
const isRunIfEnv = (st) =>
  ts.isExpressionStatement(st) &&
  ts.isCallExpression(st.expression) &&
  ts.isIdentifier(st.expression.expression) &&
  st.expression.expression.text === 'runIfEnv';

// title -> env ('dev' | 'dev,prod' | 'prod' | 'unknown' | 'undeclared')
export function declarations(text, fileName = 'x.spec.ts') {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const byTitle = new Map();
  const visit = (node, env) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      const fn = node.arguments.find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
      if (callee === 'test.describe' && fn && ts.isBlock(fn.body)) {
        const decl = fn.body.statements.find(isRunIfEnv);
        const inner = decl ? listOf(decl.expression) : env;
        ts.forEachChild(fn.body, (c) => visit(c, inner));
        return;
      }
      if (callee === 'test') {
        const first = node.arguments[0];
        if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)))
          byTitle.set(first.text, env);
        return;
      }
    }
    ts.forEachChild(node, (c) => visit(c, env));
  };
  visit(sf, 'undeclared');
  return byTitle;
}

// ---------- the join ----------

// `catalog`: the rows swept for cases with neither a test nor a Jira case (the scope). `fullCatalog`: where a
// TC ID of a listed test or a read Jira case is looked up (default: the same map), so a case whose row lives
// in another catalog file is not called unknown.
export function analyse({
  snapshot,
  tests,
  catalog,
  fullCatalog = catalog,
  envOf,
  allowlist = [],
}) {
  const cases = snapshot.issues
    .filter((i) => tcOf(i.summary))
    .map((i) => ({ ...i, tcId: tcOf(i.summary) }));
  const casesByTc = new Map();
  for (const c of cases) casesByTc.set(c.tcId, [...(casesByTc.get(c.tcId) || []), c]);
  const testsByTc = new Map();
  for (const t of tests) if (t.tcId) testsByTc.set(t.tcId, [...(testsByTc.get(t.tcId) || []), t]);

  const r = {
    testsWithoutCase: [],
    casesWithoutTest: [],
    manual: [],
    deferred: [],
    duplicates: [],
    unknown: [],
    audit: [],
    outsideScope: [],
    proposals: [],
  };
  for (const t of tests) {
    if (!t.tcId) r.testsWithoutCase.push({ test: t.identity, reason: 'no TC ID in the title' });
    else if (!casesByTc.has(t.tcId))
      r.testsWithoutCase.push({
        test: t.identity,
        tcId: t.tcId,
        reason: 'no Jira case with this TC ID',
      });
  }
  for (const [tc, list] of casesByTc) {
    const tested = testsByTc.has(tc);
    const cat = fullCatalog.get(tc);
    if (!tested && cat?.manual)
      for (const c of list) r.manual.push({ tcId: tc, key: c.key, source: cat.file });
    else if (!tested && cat?.deferred)
      for (const c of list)
        r.deferred.push({ tcId: tc, key: c.key, source: cat.file, rowless: Boolean(cat.rowless) });
    else if (!tested)
      for (const c of list)
        r.casesWithoutTest.push({ tcId: tc, key: c.key, inCatalog: Boolean(cat) });
    if (list.length > 1)
      r.duplicates.push({
        kind: 'TC ID on several Jira issues',
        tcId: tc,
        keys: list.map((c) => c.key),
      });
    if (!cat)
      for (const c of list)
        r.unknown.push({
          what: 'Jira case whose TC ID is not in the catalog',
          tcId: tc,
          key: c.key,
        });
  }
  for (const [tc, list] of testsByTc) {
    if (list.length > 1)
      r.duplicates.push({
        kind: 'TC ID on several tests',
        tcId: tc,
        tests: list.map((t) => t.identity),
      });
    if (!fullCatalog.has(tc))
      r.unknown.push({
        what: 'test whose TC ID is not in the catalog',
        tcId: tc,
        test: list[0].identity,
      });
  }
  for (const [tc, cat] of catalog) {
    if (cat.duplicates)
      r.duplicates.push({ kind: 'TC ID twice in the catalog', tcId: tc, file: cat.file });
    if (!testsByTc.has(tc) && !casesByTc.has(tc) && cat.deferred && !cat.manual)
      r.deferred.push({ tcId: tc, key: null, source: cat.file, rowless: Boolean(cat.rowless) });
    else if (!testsByTc.has(tc) && !casesByTc.has(tc) && !cat.manual)
      r.unknown.push({
        what: 'catalog case with neither a test nor a Jira case',
        tcId: tc,
        source: cat.file,
      });
  }

  // Environment labels: every mapped case (a test and a Jira case share the TC ID).
  const audited = new Set();
  for (const t of tests) {
    const list = casesByTc.get(t.tcId);
    if (!t.tcId || !list) continue;
    for (const c of list) {
      audited.add(c.key);
      const labels = (c.labels || []).filter((l) => ENV_LABELS.includes(l));
      const declared = envOf(t);
      const expected = LABEL_FOR[declared] || 'unknown';
      let finding = 'ok';
      if (expected === 'unknown') finding = 'unknown declaration';
      else if (labels.length === 0) finding = 'missing label';
      else if (labels.length > 1) finding = 'multiple labels';
      else if (labels[0] !== expected) finding = 'code/label mismatch';
      const prodListed = allowlist.some((a) => JSON.stringify(a).includes(t.tcId));
      if (prodListed && finding === 'ok' && expected !== 'env-dev-prod' && expected !== 'env-prod')
        finding = 'prod-allowlisted but declared dev only';
      r.audit.push({
        key: c.key,
        tcId: t.tcId,
        test: t.identity,
        declared,
        expected,
        labels,
        allLabels: c.labels || [],
        finding,
      });
      if (finding !== 'ok' && expected !== 'unknown')
        r.proposals.push({
          key: c.key,
          now: c.labels || [],
          proposed: [...(c.labels || []).filter((l) => !ENV_LABELS.includes(l)), expected].sort(),
          because: finding,
        });
    }
  }
  for (const i of snapshot.issues) {
    if (audited.has(i.key)) continue;
    const labels = (i.labels || []).filter((l) => ENV_LABELS.includes(l));
    if (labels.length !== 1)
      r.outsideScope.push({
        key: i.key,
        summary: i.summary,
        issuetype: i.issuetype,
        envLabels: labels.length ? labels : [],
      });
  }
  return r;
}

const complete = (s) => s.queries.every((q) => q.complete === true);

export function format({ snapshot, tests, catalog, result }) {
  const L = [];
  const sect = (t, rows, fmt) => {
    L.push('', `## ${t} (${rows.length})`);
    if (!rows.length) L.push('none');
    for (const x of rows) L.push(`- ${fmt(x)}`);
  };
  L.push(
    `# Traceability — ${snapshot.projectKey ?? '?'} (${snapshot.site ?? 'site not recorded'})`,
  );
  L.push(
    '',
    '## Scope and access',
    `- Jira read at ${snapshot.readAt ?? '?'} through ${snapshot.route ?? 'route not recorded'}`,
  );
  L.push(
    `- ${snapshot.issues.length} issues read; ${tests.length} tests listed; ${catalog.size} catalog cases${catalog.scope ? ` (catalog limited to ${catalog.scope.join(', ')})` : ' (every catalog file)'}`,
  );
  for (const q of snapshot.queries)
    L.push(`- query \`${q.jql}\` — ${q.pages} page(s), ${q.complete ? 'complete' : 'INCOMPLETE'}`);
  L.push(
    '- client filter: env labels = labels in {env-dev, env-dev-prod, env-prod}; declared environment from `runIfEnv(test, [...])` in the spec; all mapped cases, then issues outside the audited suite',
  );
  sect(
    'Tests without a Jira case',
    result.testsWithoutCase,
    (x) => `${x.tcId ?? '(no TC ID)'} ${x.reason}: ${x.test}`,
  );
  sect(
    'Jira cases without a test',
    result.casesWithoutTest,
    (x) => `${x.key} ${x.tcId}${x.inCatalog ? '' : ' (not in the catalog)'}`,
  );
  sect(
    'Intentionally manual (catalog says so)',
    result.manual,
    (x) => `${x.key} ${x.tcId} — ${x.source}`,
  );
  sect(
    'Deferred by the owner (the catalog lists them as deferred: neither manual nor missed coverage)',
    result.deferred,
    (x) =>
      `${x.tcId} ${x.key ?? '(no Jira case in the snapshot)'} — ${x.source}${x.rowless ? ' (named in the deferred list, no catalog row)' : ''}`,
  );
  sect(
    'Duplicates',
    result.duplicates,
    (x) => `${x.kind}: ${x.tcId} ${JSON.stringify(x.keys ?? x.tests ?? x.file)}`,
  );
  sect(
    'Unknown mappings',
    result.unknown,
    (x) => `${x.what}: ${x.tcId} ${x.key ?? x.test ?? x.source}`,
  );
  L.push('', `## Environment labels (${result.audit.length} mapped cases)`);
  const counts = {};
  for (const a of result.audit) counts[a.finding] = (counts[a.finding] || 0) + 1;
  L.push(
    `- findings: ${
      Object.entries(counts)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ') || 'none'
    }`,
  );
  for (const a of result.audit.filter((x) => x.finding !== 'ok'))
    L.push(
      `- ${a.key} ${a.tcId}: ${a.finding} — labels [${a.labels.join(', ')}] (all [${a.allLabels.join(', ')}]), code declares ${a.declared}, expected ${a.expected}`,
    );
  sect(
    'Issues outside the audited suite without exactly one env label',
    result.outsideScope,
    (x) => `${x.key} ${x.issuetype} "${x.summary}" env labels [${x.envLabels.join(', ')}]`,
  );
  sect(
    'Label correction PROPOSALS (nothing is applied; /writeback does not edit labels)',
    result.proposals,
    (x) => `${x.key}: [${x.now.join(', ')}] -> [${x.proposed.join(', ')}] because ${x.because}`,
  );
  return L.join('\n');
}

// ---------- CLI ----------

export function run(argv, { root = process.cwd(), out = console.log } = {}) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2)
    if (argv[i]?.startsWith('--')) args[argv[i].slice(2)] = argv[i + 1];
  const finish = (code, verdict) => {
    out(`traceability: exit ${code} ${verdict}`);
    return code;
  };
  try {
    if (!args.snapshot || !args.list)
      throw new Refusal(
        'usage: --snapshot <file> --list <file> [--catalog <file.md,...>] [--out <file>]',
        1,
      );
    const snapshot = readSnapshot(args.snapshot);
    if (!complete(snapshot))
      throw new Refusal(
        'INCOMPLETE ACCESS: a query has more pages or is marked incomplete; no conclusion is drawn',
        2,
      );
    const tests = readList(args.list);
    const only = args.catalog ? args.catalog.split(',') : null;
    const catalog = readCatalog(root, only);
    const cache = new Map();
    const envOf = (t) => {
      if (!cache.has(t.file)) {
        const p = join(root, 'tests', t.file);
        cache.set(t.file, existsSync(p) ? declarations(readFileSync(p, 'utf8'), p) : new Map());
      }
      return cache.get(t.file).get(t.title) ?? 'unknown';
    };
    let allowlist = [];
    const al = join(root, 'scripts', 'prod-smoke-allowlist.json');
    if (existsSync(al)) allowlist = JSON.parse(readFileSync(al, 'utf8')).approved || [];
    const fullCatalog = only ? readCatalog(root) : catalog;
    const result = analyse({ snapshot, tests, catalog, fullCatalog, envOf, allowlist });
    const text = format({ snapshot, tests, catalog, result });
    out(text);
    if (args.out) writeFileSync(args.out, text + '\n');
    return finish(0, 'report');
  } catch (e) {
    if (e instanceof Refusal) {
      out(`refused: ${e.message}`);
      return finish(e.code, 'refused');
    }
    out('error: unexpected failure (details hidden)');
    return finish(1, 'error');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = run(process.argv.slice(2));
