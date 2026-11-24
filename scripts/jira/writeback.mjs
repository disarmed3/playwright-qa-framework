#!/usr/bin/env node
// Guarded Jira result-comment gateway (Week 5 Task 04, rule 55). Node built-ins only.
//
//   node scripts/jira/writeback.mjs propose  --report <sanitized report> --provenance <provenance.txt>
//                                            --mapping <mapping.json> --output <proposal.json> [--exercise]
//   node scripts/jira/writeback.mjs execute  --proposal <proposal.json> --report <the same report>
//                                            --approve-row <rowId> --approve <12 hex>
//   node scripts/jira/writeback.mjs reconcile --proposal <proposal.json>
//
// propose: reads local files only. No network, no .env, no environment variable. It prints every
//   row in full and a digest per row. A digest is not an approval.
// execute: adds ONE result comment to ONE issue. It needs ALL of: QA_JIRA_WRITE=1 in the process
//   (set inline for the one command, never at launch), the row's exact digest, the original report,
//   an interactive terminal where the digest is typed again, and the separate credentials
//   JIRA_WRITE_BASE_URL, JIRA_WRITE_EMAIL, JIRA_WRITE_API_TOKEN. It refreshes the issue first, refuses
//   on any difference from the displayed state, writes a receipt before sending, reads the comment
//   back, and re-reads the rejected rows. One proposal allows one execution, ever.
// reconcile: read-only. After an uncertain outcome it looks for the row's marker comment and records
//   what it found. It never sends a comment.
//
// Supported write: an evidence comment. Not supported: transitions, label edits, issue creation.
//
// Exit: 0 done; 1 refused (approval, state, receipt, usage); 2 invalid input; 3 write gate, terminal
// or credentials missing; 4 Jira refused or unreachable (no comment sent); 5 outcome uncertain;
// 6 rate limited (no comment sent). The last stdout line is `jira-writeback: exit <n> <mode> <verdict>`.

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  Refusal,
  adf,
  adfText,
  canonical,
  credentialLike,
  digest12,
  readProvenance,
  readReport,
  sha256,
  siteOrigin,
  tcOf,
} from './lib.mjs';

const HEADERS_SHOWN = {
  Accept: 'application/json',
  Authorization: 'Basic <built from JIRA_WRITE_EMAIL and JIRA_WRITE_API_TOKEN; never shown>',
  'Content-Type': 'application/json',
};
const STATE_FIELDS = 'summary,status,labels,updated,issuetype,project';

// ---------- proposal ----------

const issueKeyOk = (k, project) => new RegExp(`^${project}-\\d+$`).test(k);
const labelsSorted = (l) => [...(l || [])].sort();
const stamp = (s) => Date.parse(s);

export function readMapping(path) {
  if (!existsSync(path)) throw new Refusal('mapping file not found', 2);
  let m;
  try {
    m = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Refusal('mapping is not valid JSON', 2);
  }
  if (!m || !Array.isArray(m.issues) || !Array.isArray(m.mappings) || !m.projectKey || !m.site)
    throw new Refusal('mapping needs site, projectKey, issues[] and mappings[]', 2);
  const site = siteOrigin(m.site);
  if (!/^[A-Z][A-Z0-9]+$/.test(m.projectKey)) throw new Refusal('projectKey is not a Jira key', 2);
  return { ...m, site };
}

export function buildProposal({
  provenance,
  mapping,
  reportPath,
  exercise = false,
  now = new Date(),
  proposalId,
}) {
  const read = readReport(reportPath);
  const prov = readProvenance(provenance, read.startTime);
  const map = typeof mapping === 'string' ? readMapping(mapping) : mapping;
  const issueByKey = new Map(map.issues.map((i) => [i.key, i]));
  const id =
    proposalId ||
    `P-${now.toISOString().replace(/[-:.]/g, '').slice(0, 15)}Z-${randomBytes(3).toString('hex')}`;

  const blocked = [];
  const mapped = new Map();
  const seenKeys = new Map();
  for (const m of map.mappings) {
    const reason = [];
    const issue = issueByKey.get(m.issueKey);
    if (!m.tcId || !m.issueKey) reason.push('mapping lacks tcId or issueKey');
    else if (!issueKeyOk(m.issueKey, map.projectKey))
      reason.push('issue key is outside the approved project');
    else if (!issue) reason.push('issue was not read from Jira');
    else if (tcOf(issue.summary) !== m.tcId)
      reason.push('the issue summary does not start with this TC ID');
    else if (
      !issue.status?.name ||
      !Array.isArray(issue.labels) ||
      !issue.updated ||
      !issue.issuetype
    )
      reason.push('current Jira state is incomplete');
    if (mapped.has(m.tcId) || seenKeys.has(m.issueKey)) reason.push('duplicate mapping');
    if (reason.length)
      blocked.push({
        tcId: m.tcId ?? null,
        issueKey: m.issueKey ?? null,
        reason: reason.join('; '),
      });
    else {
      mapped.set(m.tcId, { ...m, issue });
      seenKeys.set(m.issueKey, m.tcId);
    }
  }
  const dupMap = new Set(
    [...blocked].filter((b) => b.reason.includes('duplicate')).map((b) => b.tcId),
  );

  const perTc = new Map();
  for (const r of read.rows) if (r.tcId) perTc.set(r.tcId, (perTc.get(r.tcId) || 0) + 1);
  const rows = [];
  const unmapped = [];
  for (const r of read.rows) {
    if (!r.tcId)
      unmapped.push({
        identity: r.identity,
        outcome: r.outcome,
        reason: 'no TC ID in the test title',
      });
    else if (!mapped.has(r.tcId) || dupMap.has(r.tcId))
      unmapped.push({
        identity: r.identity,
        tcId: r.tcId,
        outcome: r.outcome,
        reason: 'no verified Jira case mapping',
      });
    else if (perTc.get(r.tcId) > 1)
      unmapped.push({
        identity: r.identity,
        tcId: r.tcId,
        outcome: r.outcome,
        reason: 'several tests in this report carry the TC ID',
      });
    else {
      const m = mapped.get(r.tcId);
      const rowId = `WB-${prov.utc}-${sha256(r.identity).slice(0, 8)}`;
      const lines = [
        `[qa-writeback ${rowId}]`,
        'Automated result from a saved Playwright report (dev).',
        `Test: ${r.identity}`,
        `Outcome: ${r.outcome}${r.retries ? ` (retries used: ${r.retries})` : ''}`,
        ...(r.skipReason ? [`Skip reason: ${r.skipReason}`] : []),
        `Run: ${prov.utc} on dev, commit ${prov.head}${prov.uncommitted ? ` plus an uncommitted tree (${prov.modified} modified, ${prov.untracked} untracked files)` : ' (clean tree)'}`,
        `Evidence: ${reportPath.replace(/\\/g, '/')} sha256 ${read.sha256.slice(0, 16)}`,
        ...(m.related || []).map((x) => `Related issue (${x.source}): ${x.key}`),
        'No status change is proposed or made by this comment.',
      ];
      if (lines.some(credentialLike))
        throw new Refusal(`credential-like text in the comment for ${rowId}; nothing issued`, 2);
      const row = {
        rowId,
        tcId: r.tcId,
        test: { identity: r.identity, project: r.project },
        outcome: r.outcome,
        issue: {
          key: m.issueKey,
          id: m.issue.id ?? null,
          url: `${map.site}/browse/${m.issueKey}`,
          summary: m.issue.summary,
          type: m.issue.issuetype,
        },
        current: {
          status: m.issue.status.name,
          labels: labelsSorted(m.issue.labels),
          updated: m.issue.updated,
          markerPresent: false,
        },
        destination: {
          operation: 'add-comment',
          method: 'POST',
          url: `${map.site}/rest/api/3/issue/${m.issueKey}/comment`,
          headers: HEADERS_SHOWN,
        },
        payload: { body: adf(lines) },
        transition: null,
        evidence: { report: reportPath.replace(/\\/g, '/'), sha256: read.sha256, provenance: prov },
      };
      row.approvalId = rowDigest(
        { proposalId: id, site: map.site, report: { sha256: read.sha256 } },
        row,
      );
      rows.push(row);
    }
  }
  if (rows.length === 0)
    throw new Refusal('no report row has a verified Jira case mapping; nothing to propose', 2);
  if (exercise && rows.length < 2)
    throw new Refusal('the exercise needs at least two mapped rows', 2);
  return {
    version: 1,
    proposalId: id,
    createdAt: now.toISOString(),
    site: map.site,
    projectKey: map.projectKey,
    mappingReadAt: map.readAt ?? null,
    report: { path: reportPath.replace(/\\/g, '/'), sha256: read.sha256, stats: read.stats },
    provenance: prov,
    rows,
    blocked,
    unmapped,
  };
}

// The digest covers everything the preview shows for the row (identity, outcome, issue, current
// state, destination, headers, payload, transition, evidence), the site, the proposal and the report
// hash. Any later-added field is part of `row`, so it changes the digest too.
export function rowDigest(proposal, row) {
  const shown = { ...row };
  delete shown.approvalId;
  return digest12({
    proposalId: proposal.proposalId,
    site: proposal.site,
    reportSha: proposal.report.sha256,
    row: shown,
  });
}

export function formatProposal(p) {
  const out = [
    `proposal ${p.proposalId}  site ${p.site}  project ${p.projectKey}  rows ${p.rows.length}`,
    `report ${p.report.path}  sha256 ${p.report.sha256.slice(0, 16)}…  run ${p.provenance.utc}`,
    'This preview sends nothing and reads nothing from Jira. A digest is not an approval: the owner approves one row by',
    'running the execute command in an interactive terminal and typing that row’s digest again.',
  ];
  for (const r of p.rows) {
    out.push(
      '',
      `ROW ${r.rowId}   approvalId ${r.approvalId}`,
      `  test         ${r.test.identity}`,
      `  outcome      ${r.outcome} (from the report; not changed)`,
      `  issue        ${r.issue.key} ${r.issue.url}`,
      `  issue type   ${r.issue.type}   summary: ${r.issue.summary}`,
      `  state now    status "${r.current.status}", labels [${r.current.labels.join(', ')}], updated ${r.current.updated}, marker comment present: no`,
      `  destination  ${r.destination.method} ${r.destination.url}  (${r.destination.operation})`,
      `  headers      ${canonical(r.destination.headers)}`,
      `  transition   none`,
      `  comment (exact text):`,
      ...adfText(r.payload.body)
        .split('\n')
        .map((l) => `    | ${l}`),
      `  evidence     ${r.evidence.report} sha256 ${r.evidence.sha256.slice(0, 16)}…`,
    );
  }
  for (const b of p.blocked)
    out.push('', `BLOCKED mapping ${b.tcId ?? '?'} ${b.issueKey ?? '?'}: ${b.reason}`);
  for (const u of p.unmapped)
    out.push(`NOT PROPOSED ${u.tcId ?? '(no TC ID)'} ${u.outcome}: ${u.reason}  [${u.identity}]`);
  return out.join('\n');
}

// ---------- Jira REST (injected fetch) ----------

async function call(fetchImpl, url, init, timeoutMs) {
  const ctl = new globalThis.AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...init, signal: ctl.signal });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* no body */
    }
    return { status: res.status, json };
  } catch {
    return { status: 0, json: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function readIssueState({ fetchImpl, site, auth, key, rowId, timeoutMs = 15000 }) {
  const base = { headers: { Accept: 'application/json', Authorization: auth }, method: 'GET' };
  const issue = await call(
    fetchImpl,
    `${site}/rest/api/3/issue/${key}?fields=${STATE_FIELDS}`,
    base,
    timeoutMs,
  );
  if (issue.status !== 200 || !issue.json?.fields) return { ok: false, http: issue.status };
  const comments = [];
  for (let start = 0; ;) {
    const page = await call(
      fetchImpl,
      `${site}/rest/api/3/issue/${key}/comment?startAt=${start}&maxResults=100`,
      base,
      timeoutMs,
    );
    if (page.status !== 200 || !Array.isArray(page.json?.comments))
      return { ok: false, http: page.status };
    comments.push(...page.json.comments.map((c) => ({ id: c.id, text: adfText(c.body) })));
    start += page.json.comments.length;
    if (page.json.comments.length === 0 || start >= (page.json.total ?? start)) break;
  }
  const f = issue.json.fields;
  return {
    ok: true,
    key: issue.json.key,
    id: issue.json.id,
    project: f.project?.key,
    summary: f.summary,
    status: f.status?.name,
    labels: labelsSorted(f.labels),
    updated: f.updated,
    commentCount: comments.length,
    marker: rowId ? comments.find((c) => c.text.includes(`[qa-writeback ${rowId}]`)) || null : null,
  };
}

function sameState(row, live) {
  const diffs = [];
  if (live.key !== row.issue.key) diffs.push('issue key');
  if (row.issue.id && live.id !== row.issue.id) diffs.push('issue id');
  if (live.status !== row.current.status) diffs.push('status');
  if (canonical(live.labels) !== canonical(row.current.labels)) diffs.push('labels');
  if (!(stamp(live.updated) === stamp(row.current.updated))) diffs.push('updated');
  if (tcOf(live.summary) !== row.tcId) diffs.push('summary');
  if (live.marker) diffs.push('marker comment already present');
  return diffs;
}

// ---------- commands ----------

const receiptPathOf = (proposalPath) => `${proposalPath}.receipt.json`;
function saveJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
function loadProposal(path) {
  if (!path || !existsSync(path)) throw new Refusal('proposal file not found', 2);
  let p;
  try {
    p = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Refusal('proposal is not valid JSON', 2);
  }
  if (!p?.proposalId || !Array.isArray(p.rows) || !p.report?.sha256)
    throw new Refusal('not a proposal file', 2);
  for (const r of p.rows)
    if (rowDigest(p, r) !== r.approvalId)
      throw new Refusal(`proposal was edited: row ${r.rowId} no longer matches its digest`, 1);
  return p;
}

function credentials(env, proposal) {
  const { JIRA_WRITE_BASE_URL: base, JIRA_WRITE_EMAIL: email, JIRA_WRITE_API_TOKEN: token } = env;
  if (!base || !email || !token)
    throw new Refusal(
      'JIRA_WRITE_BASE_URL, JIRA_WRITE_EMAIL and JIRA_WRITE_API_TOKEN are required; no request made',
      3,
    );
  const site = siteOrigin(base);
  if (site !== proposal.site)
    throw new Refusal('the write site differs from the proposal’s site; renewed review needed', 1);
  return { site, auth: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}` };
}

export async function execute({
  args,
  env,
  fetchImpl,
  confirm,
  out,
  now = () => new Date(),
  timeoutMs = 15000,
}) {
  if (env.APP_ENV === 'prod') throw new Refusal('APP_ENV is prod; no Jira write', 1);
  const proposalPath = args.proposal;
  const receiptPath = receiptPathOf(proposalPath || '');
  if (proposalPath && existsSync(receiptPath)) {
    let state = 'unreadable';
    try {
      state = JSON.parse(readFileSync(receiptPath, 'utf8')).state;
    } catch {
      /* keep */
    }
    throw new Refusal(
      `a receipt exists for this proposal (state ${state}); replay is blocked. Run reconcile, then propose again`,
      1,
    );
  }
  const proposal = loadProposal(proposalPath);
  if (!args['approve-row'] || !args.approve || !args.report)
    throw new Refusal('execute needs --report, --approve-row and --approve', 1);
  const read = readReport(args.report);
  if (read.sha256 !== proposal.report.sha256)
    throw new Refusal('the report differs from the one the proposal was built from', 1);
  const row = proposal.rows.find((r) => r.rowId === args['approve-row']);
  if (!row) throw new Refusal('no such row in the proposal', 1);
  if (args.approve !== row.approvalId)
    throw new Refusal('the approval digest does not match this row', 1);
  if (env.QA_JIRA_WRITE !== '1')
    throw new Refusal('live Jira writes are off: QA_JIRA_WRITE=1 is not set for this command', 3);
  const typed = await confirm(
    `About to POST the comment above to ${row.issue.key} (${row.destination.url}). Type the digest ${row.approvalId} to confirm: `,
  );
  if (typed.trim() !== row.approvalId)
    throw new Refusal('terminal confirmation did not match; nothing sent', 1);
  const { site, auth } = credentials(env, proposal);

  const live = await readIssueState({
    fetchImpl,
    site,
    auth,
    key: row.issue.key,
    rowId: row.rowId,
    timeoutMs,
  });
  if (!live.ok)
    throw new Refusal(
      `could not read the issue before writing (HTTP ${live.http || 'no response'}); nothing sent`,
      4,
    );
  const diffs = sameState(row, live);
  if (diffs.length)
    throw new Refusal(
      `stale approval: ${diffs.join(', ')} changed since the proposal; renewed review needed` +
        (diffs.includes('updated')
          ? ` (updated: proposal ${row.current.updated}, live ${live.updated})`
          : ''),
      1,
    );
  const text = adfText(row.payload.body);
  if (text.split('\n').some(credentialLike))
    throw new Refusal('credential-like text in the outgoing comment; nothing sent', 2);

  const receipt = {
    proposalId: proposal.proposalId,
    rowId: row.rowId,
    approvalId: row.approvalId,
    issue: row.issue.key,
    startedAt: now().toISOString(),
    state: 'attempting',
  };
  saveJson(receiptPath, receipt);
  const post = await call(
    fetchImpl,
    row.destination.url,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(row.payload),
    },
    timeoutMs,
  );
  if (post.status >= 400 && post.status < 500 && ![408, 429].includes(post.status)) {
    saveJson(receiptPath, { ...receipt, state: 'refused', http: post.status });
    throw new Refusal(`Jira refused the comment (HTTP ${post.status}); nothing was written`, 4);
  }
  if (post.status === 429) {
    saveJson(receiptPath, { ...receipt, state: 'rate-limited', http: 429 });
    throw new Refusal('Jira rate limited the request; nothing was written', 6);
  }
  if (post.status !== 201) {
    saveJson(receiptPath, { ...receipt, state: 'uncertain', http: post.status || null });
    throw new Refusal(
      'the outcome is uncertain; no retry. Run reconcile (read-only) before anything else',
      5,
    );
  }
  const after = await readIssueState({
    fetchImpl,
    site,
    auth,
    key: row.issue.key,
    rowId: row.rowId,
    timeoutMs,
  });
  const rejected = [];
  for (const other of proposal.rows.filter((r) => r.rowId !== row.rowId)) {
    const o = await readIssueState({
      fetchImpl,
      site,
      auth,
      key: other.issue.key,
      rowId: other.rowId,
      timeoutMs,
    });
    rejected.push(
      o.ok
        ? {
            rowId: other.rowId,
            issue: other.issue.key,
            unchanged: sameState(other, o).length === 0,
            differences: sameState(other, o),
          }
        : { rowId: other.rowId, issue: other.issue.key, readback: 'failed' },
    );
  }
  const verified =
    after.ok &&
    after.marker &&
    after.marker.text === text &&
    after.status === row.current.status &&
    canonical(after.labels) === canonical(row.current.labels);
  const final = {
    ...receipt,
    state: verified ? 'posted-verified' : 'posted-unverified',
    http: 201,
    commentId: post.json?.id ?? after.marker?.id ?? null,
    finishedAt: now().toISOString(),
    readback: after.ok
      ? {
          commentPresent: Boolean(after.marker),
          textEqual: Boolean(after.marker && after.marker.text === text),
          status: after.status,
          labels: after.labels,
          commentCount: after.commentCount,
        }
      : { failed: true },
    rejectedRows: rejected,
  };
  saveJson(receiptPath, final);
  out(
    `posted to ${row.issue.key}; readback ${verified ? 'matches the approved text, status and labels unchanged' : 'DOES NOT fully match'}`,
  );
  for (const r of rejected)
    out(
      `rejected row ${r.rowId} (${r.issue}): ${r.readback === 'failed' ? 'readback failed' : r.unchanged ? 'unchanged' : `changed: ${r.differences.join(', ')}`}`,
    );
  if (!verified)
    throw new Refusal(
      'the comment was sent but the readback does not match; reconcile before anything else',
      5,
    );
  return 'posted-verified';
}

export async function reconcile({
  args,
  env,
  fetchImpl,
  out,
  now = () => new Date(),
  timeoutMs = 15000,
}) {
  const proposal = loadProposal(args.proposal);
  const receiptPath = receiptPathOf(args.proposal);
  if (!existsSync(receiptPath)) throw new Refusal('no receipt: nothing to reconcile', 1);
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  const row = proposal.rows.find((r) => r.rowId === receipt.rowId);
  if (!row) throw new Refusal('the receipt names a row that is not in the proposal', 1);
  const { site, auth } = credentials(env, proposal);
  const live = await readIssueState({
    fetchImpl,
    site,
    auth,
    key: row.issue.key,
    rowId: row.rowId,
    timeoutMs,
  });
  if (!live.ok)
    throw new Refusal(
      `could not read the issue (HTTP ${live.http || 'no response'}); still unreconciled`,
      4,
    );
  const found = Boolean(live.marker);
  saveJson(receiptPath, {
    ...receipt,
    reconciledAt: now().toISOString(),
    state: found ? 'reconciled-posted' : 'reconciled-not-posted',
    commentId: live.marker?.id ?? null,
  });
  out(
    found
      ? `marker comment found on ${row.issue.key}; the earlier request did write. No retry.`
      : `no marker comment on ${row.issue.key}; the earlier request did not write. A new proposal and a new approval are required.`,
  );
  return found ? 'reconciled-posted' : 'reconciled-not-posted';
}

// ---------- CLI ----------

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      if (k === 'exercise') args[k] = true;
      else args[k] = argv[++i];
    } else args._.push(argv[i]);
  }
  return args;
}

async function ttyConfirm(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Refusal(
      'execute needs an interactive terminal to confirm; none is attached, nothing sent',
      3,
    );
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

export async function run(
  argv,
  {
    env = process.env,
    fetchImpl = globalThis.fetch,
    confirm = ttyConfirm,
    out = console.log,
    now,
  } = {},
) {
  const args = parseArgs(argv);
  const mode = args._[0];
  const finish = (code, verdict) => {
    out(`jira-writeback: exit ${code} ${mode ?? 'none'} ${verdict}`);
    return code;
  };
  try {
    if (mode === 'propose') {
      if (!args.report || !args.provenance || !args.mapping || !args.output)
        throw new Refusal('propose needs --report, --provenance, --mapping and --output', 1);
      const p = buildProposal({
        reportPath: args.report,
        provenance: args.provenance,
        mapping: args.mapping,
        exercise: Boolean(args.exercise),
        now: now ? now() : new Date(),
      });
      saveJson(args.output, p);
      out(formatProposal(p));
      return finish(0, 'proposed');
    }
    if (mode === 'execute')
      return finish(0, await execute({ args, env, fetchImpl, confirm, out, now }));
    if (mode === 'reconcile') return finish(0, await reconcile({ args, env, fetchImpl, out, now }));
    throw new Refusal(
      'usage: propose | execute | reconcile (see the header of this file). Writes are never the default.',
      1,
    );
  } catch (e) {
    if (e instanceof Refusal) {
      out(`refused: ${e.message}`);
      return finish(e.code, 'refused');
    }
    out('error: unexpected failure (details hidden)');
    return finish(1, 'error');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run(process.argv.slice(2));
}
