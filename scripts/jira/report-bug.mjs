#!/usr/bin/env node
// Bug-report PREVIEW (Week 5 Task 04, rule 55). Offline. It never creates or edits a Jira issue.
//
//   node scripts/jira/report-bug.mjs --tc <TC-ID> --reports <a.json,b.json,…> --provenance <a.txt,b.txt,…>
//                                    --dupes <duplicate-search.json> [--mapping <mapping.json>] [--root <dir>]
//
// It classifies what the saved native reports show (test, data, environment, product, undetermined),
// checks the duplicate-search result saved from the approved read-only connector, and prints a draft
// ONLY when all of these hold: the test failed in at least two saved runs with the same first error
// line, no run of it passed, the error is an assertion (not a timeout, network or locator problem), and
// a complete duplicate search found no candidate. A skip is never a defect. There is no quota. The draft
// is text for the owner; filing is a separate operation that this exercise does not enable.
//
// --dupes: { queries:[{ jql, complete, issues:[{ key, summary, issuetype, status }] }] } written from
// jira_search results. Missing or incomplete means the check was not done, so no draft.
//
// Exit: 0 preview printed (including "no draft"); 1 usage; 2 unusable input.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Refusal, credentialLike, readProvenance, readReport } from './lib.mjs';

export function errorKind(line) {
  if (!line) return { kind: 'undetermined', why: 'no error text in the report' };
  if (
    /net::ERR|ECONNREFUSED|ENOTFOUND|ECONNRESET|socket hang up|fetch failed|EAI_AGAIN/i.test(line)
  )
    return { kind: 'environment', why: 'network-level error text' };
  if (/Timeout \d+ms exceeded|Test timeout|timed out/i.test(line))
    return {
      kind: 'environment-or-test',
      why: 'a timeout; a slow environment and a weak wait look the same',
    };
  if (
    /strict mode violation|waiting for locator|locator resolved to|element\(s\) not found/i.test(
      line,
    )
  )
    return { kind: 'test', why: 'locator or strictness problem' };
  if (/\b(stock|allocation|seed|already exists|qa-auto-)/i.test(line))
    return { kind: 'data', why: 'error text mentions shared or seeded data' };
  if (/expect\(|Expected|Received|toBe|toEqual|toHave|toContain|toMatch/i.test(line))
    return {
      kind: 'assertion',
      why: 'an assertion on observed behaviour; product or test expectation, to be judged against the requirement',
    };
  return { kind: 'undetermined', why: 'error text matches no known pattern' };
}

const words = (s) =>
  new Set(
    String(s)
      .toLowerCase()
      .match(/[a-z]{4,}/g) || [],
  );
export function duplicateCandidates({ tcId, title, dupes, related = [] }) {
  const t = words(title);
  const found = [];
  for (const q of dupes.queries) {
    for (const i of q.issues || []) {
      const s = words(i.summary);
      const overlap =
        [...t].filter((w) => s.has(w)).length / Math.max(1, new Set([...t, ...s]).size);
      const reason = String(i.summary).includes(tcId)
        ? 'summary names the TC ID'
        : related.includes(i.key)
          ? 'named as related in the mapping'
          : overlap >= 0.3
            ? `wording overlap ${overlap.toFixed(2)}`
            : null;
      if (reason && !found.some((f) => f.key === i.key))
        found.push({
          key: i.key,
          summary: i.summary,
          status: i.status?.name ?? i.status ?? '?',
          reason,
        });
    }
  }
  return found;
}

export function catalogExpected(root, tcId) {
  const dir = join(root, 'vault', 'sources', 'test-catalog');
  if (!existsSync(dir)) return null;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    const lines = readFileSync(join(dir, f), 'utf8').split('\n');
    const at = lines.findIndex((l) => l.startsWith(`| **${tcId}**`));
    if (at < 0) continue;
    let h = at;
    while (h >= 0 && !/^\|\s*ID\s*\|/.test(lines[h])) h--;
    if (h < 0) return null;
    const head = lines[h].split('|').map((c) => c.trim());
    const cells = lines[at].split('|').map((c) => c.trim());
    const col = head.indexOf('Expected');
    return col > 0 ? cells[col] : null;
  }
  return null;
}

// Issue keys the catalog already ties to this TC ID as a bug or defect (paragraph that names both).
export function catalogRelated(root, tcId) {
  const dir = join(root, 'vault', 'sources', 'test-catalog');
  const keys = new Set();
  if (!existsSync(dir)) return [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.md')))
    for (const para of readFileSync(join(dir, f), 'utf8').split(/\n\s*\n/))
      if (para.includes(tcId) && /\b(bug|defect)\b/i.test(para))
        for (const m of para.matchAll(/\b[A-Z][A-Z0-9]+-\d+\b/g))
          if (!/^TC-/.test(m[0])) keys.add(m[0]);
  return [...keys];
}

export function assess({ tcId, runs, dupes, mapping, root }) {
  const evidence = runs.filter((r) => r.row);
  const outcomes = evidence.map((r) => r.row.outcome);
  const result = {
    tcId,
    runs: evidence.map((r) => ({
      utc: r.prov.utc,
      outcome: r.row.outcome,
      firstError: r.row.firstError,
      skipReason: r.row.skipReason,
      report: r.path,
    })),
    notes: [],
    draft: null,
  };
  if (evidence.length === 0) {
    result.verdict = 'no-evidence';
    result.notes.push('the TC ID is in none of the saved reports');
    return result;
  }
  if (outcomes.every((o) => o === 'skipped'))
    return {
      ...result,
      verdict: 'not-a-defect',
      notes: [
        'the test was skipped in every run; a skip is a blocked or unrun check, not a failure',
      ],
    };
  if (!outcomes.includes('failed'))
    return {
      ...result,
      verdict: 'no-failure',
      notes: [`outcomes: ${outcomes.join(', ')}; nothing to report`],
    };
  const failed = evidence.filter((r) => r.row.outcome === 'failed');
  const kinds = failed.map((r) => errorKind(r.row.firstError));
  result.classification = kinds[0];
  if (outcomes.includes('passed') || outcomes.includes('flaky')) {
    result.notes.push(
      'the same test passed or was flaky in another run: unstable, not a supported product defect',
    );
    return { ...result, verdict: 'unstable' };
  }
  if (failed.length < 2)
    return {
      ...result,
      verdict: 'insufficient',
      notes: ['one failing run is a signal, not a supported defect; more saved runs are needed'],
    };
  if (new Set(failed.map((r) => r.row.firstError)).size > 1)
    return {
      ...result,
      verdict: 'insufficient',
      notes: ['the failing runs show different first error lines'],
    };
  if (kinds[0].kind !== 'assertion')
    return {
      ...result,
      verdict: 'not-supported',
      notes: [`classified ${kinds[0].kind}: ${kinds[0].why}`],
    };
  if (!dupes || !dupes.queries?.length || dupes.queries.some((q) => q.complete !== true))
    return {
      ...result,
      verdict: 'duplicate-check-missing',
      notes: ['the duplicate search is missing or incomplete; no draft until it is done'],
    };
  const related = (mapping?.mappings || [])
    .filter((m) => m.tcId === tcId)
    .flatMap((m) => (m.related || []).map((x) => x.key));
  const title = failed[0].row.title;
  const cands = duplicateCandidates({ tcId, title, dupes, related });
  for (const key of catalogRelated(root, tcId))
    if (!cands.some((c) => c.key === key))
      cands.push({
        key,
        summary: '(not in the search result)',
        status: '?',
        reason: 'the test catalog ties this key to the TC ID as a bug',
      });
  result.duplicates = cands;
  if (cands.length)
    return {
      ...result,
      verdict: 'possible-duplicate',
      notes: ['an existing issue may already cover this; review it instead of filing'],
    };
  const observed = failed[0].row.firstError;
  const expected = catalogExpected(root, tcId);
  const text = [
    `Test: ${failed[0].row.identity}`,
    `Observed (first error line, ${failed.length} runs: ${failed.map((r) => r.prov.utc).join(', ')}): ${observed}`,
    `Expected (test catalog, verbatim): ${expected ?? 'not found in the catalog'}`,
    'Evidence: ' + failed.map((r) => r.path).join(', '),
    'Impact: not assessed here; the owner decides.',
  ];
  if (text.some(credentialLike))
    return {
      ...result,
      verdict: 'refused',
      notes: ['credential-like text in the draft; nothing shown'],
    };
  return {
    ...result,
    verdict: 'draft',
    draft: {
      project: mapping?.projectKey ?? null,
      type: 'Task (this project shows bugs as Tasks titled "[Bug] …"; a Bug type was not verified)',
      summary: `[Bug] ${title.replace(/^TC-[A-Z]+-\d+\s*/, '')}`,
      description: text,
    },
  };
}

export function run(argv, { root = process.cwd(), out = console.log } = {}) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2)
    if (argv[i]?.startsWith('--')) args[argv[i].slice(2)] = argv[i + 1];
  const finish = (code, verdict) => {
    out(`report-bug: exit ${code} ${verdict}`);
    return code;
  };
  try {
    if (!args.tc || !args.reports || !args.provenance)
      throw new Refusal(
        'usage: --tc <TC-ID> --reports <a,b> --provenance <a,b> --dupes <file> [--mapping <file>]',
        1,
      );
    const reports = args.reports.split(',');
    const provs = args.provenance.split(',');
    if (reports.length !== provs.length)
      throw new Refusal('give one provenance file per report', 1);
    const runs = reports.map((p, i) => {
      const r = readReport(p);
      return {
        path: p.replace(/\\/g, '/'),
        prov: readProvenance(provs[i], r.startTime),
        row: r.rows.find((x) => x.tcId === args.tc),
      };
    });
    let dupes = null;
    if (args.dupes) dupes = JSON.parse(readFileSync(args.dupes, 'utf8'));
    const mapping = args.mapping ? JSON.parse(readFileSync(args.mapping, 'utf8')) : null;
    const a = assess({ tcId: args.tc, runs, dupes, mapping, root });
    out(`PREVIEW ONLY — nothing is created or sent. ${args.tc}: ${a.verdict}`);
    for (const r of a.runs)
      out(
        `  run ${r.utc} ${r.outcome}${r.skipReason ? ` (${r.skipReason})` : ''}${r.firstError ? ` — ${r.firstError}` : ''}`,
      );
    if (a.classification)
      out(`  classification: ${a.classification.kind} — ${a.classification.why}`);
    for (const n of a.notes) out(`  note: ${n}`);
    for (const d of a.duplicates || [])
      out(`  duplicate candidate ${d.key} [${d.status}] "${d.summary}" (${d.reason})`);
    if (a.draft) {
      out('  DRAFT (for the owner; filing is not enabled):');
      out(`    project ${a.draft.project}; type ${a.draft.type}`);
      out(`    summary ${a.draft.summary}`);
      for (const l of a.draft.description) out(`    | ${l}`);
    } else out('  no draft.');
    return finish(0, a.verdict);
  } catch (e) {
    if (e instanceof Refusal) {
      out(`refused: ${e.message}`);
      return finish(e.code, 'refused');
    }
    out('error: unusable input (details hidden)');
    return finish(2, 'error');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = run(process.argv.slice(2));
