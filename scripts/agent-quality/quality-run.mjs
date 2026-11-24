#!/usr/bin/env node
// Manual quality runner (Week 5, rule 60 "Manual quality runner"). Node built-ins only.
//
//   node scripts/agent-quality/quality-run.mjs --inputs-only --action review-self-heal-reply --case case-01 --proposal self-heal-<UTC>
//   node scripts/agent-quality/quality-run.mjs --action review-self-heal-reply --case case-01 --proposal self-heal-<UTC> [--supersedes <job folder>]
//   node scripts/agent-quality/quality-run.mjs --recover <job folder>
//
// One supported action: review one recorded /self-heal reply with that case's checklist row, the same
// check /quality-review makes. `/quality-review` itself is disable-model-invocation and a no-tool worker
// cannot type it, so this is an ADAPTER: it hands the reviewed procedure's own inputs (bundle.mjs --review
// output on stdin, instructions/quality-review.md as the system prompt) to a separate no-tool `claude -p`.
// The job record names the exact files and hashes it used. It is never recorded as a typed /quality-review.
//
// It never writes answers/, the scorecard, settings or hooks. It writes only `.qa-quality/<job>/`
// (ignored). One job = one model call, at most 8 turns, a 120 s deadline, no retry. A failed, blocked,
// interrupted or timed-out job is a processing state, never a quality verdict. A duplicate makes no
// call. Changed inputs make a new job id and still need the owner's explicit `--supersedes`.
//
// Exit: 0 completed (or already completed), 1 input invalid (no call), 2 blocked, 3 worker failed or
// reply unusable or inputs changed during the call, 4 internal, 5 no call made (duplicate, earlier job
// needs --supersedes, or a job is still marked in progress).

import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanEnv, classifyWorker } from '../triage/triage-draft.mjs';
import {
  ACTION,
  QualityError,
  SCHEMA,
  TASK_ID,
  checkInScope,
  fingerprint,
  jobIdFor,
  parseBundle,
  recordIdMatches,
  sha256,
  validateFinding,
  validateJobRecord,
  writeAtomic,
} from './quality-record.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUT_DIR = '.qa-quality';
const INSTRUCTIONS = 'scripts/agent-quality/instructions/quality-review.md';
const TIMEOUT_MS = 120_000;
const MAX_TURNS = 8;
const RUNNER_FILES = {
  bundleScriptSha256: 'scripts/agent-quality/bundle.mjs',
  runWorkerSha256: 'scripts/agent-quality/run-worker.mjs',
  qualityRecordSha256: 'scripts/agent-quality/quality-record.mjs',
  qualityRunSha256: 'scripts/agent-quality/quality-run.mjs',
  triageDraftSha256: 'scripts/triage/triage-draft.mjs',
};
const PROPOSAL = /^self-heal-\d{8}T\d{6}Z$/;
const CASE = /^case-\d{2}$/;
const FOLDER = /^[0-9a-f]{16}$/;

// ---------- real dependencies (tests inject fakes) ----------

function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
  } else {
    child.kill('SIGKILL');
  }
}

function realDeps(over = {}) {
  return {
    root: ROOT,
    outRoot: ROOT,
    spawn,
    killTree,
    now: () => new Date(),
    env: process.env,
    timeoutMs: TIMEOUT_MS,
    signal: undefined,
    git: (root, args) => {
      const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
      return { status: r.status, stdout: r.stdout ?? '' };
    },
    claudeVersion: () => {
      const r = spawnSync('claude', ['--version'], { encoding: 'utf8', windowsHide: true });
      if (r.status !== 0 || typeof r.stdout !== 'string' || r.stdout.trim() === '') return null;
      return r.stdout.trim().slice(0, 80);
    },
    pidAlive: (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    },
    beforeClaim: undefined,
    ...over,
  };
}

// ---------- arguments ----------

function parseArgs(argv) {
  const args = {
    inputsOnly: false,
    recover: null,
    action: null,
    caseId: null,
    proposal: null,
    supersedes: null,
  };
  const takes = {
    '--action': 'action',
    '--case': 'caseId',
    '--proposal': 'proposal',
    '--supersedes': 'supersedes',
    '--recover': 'recover',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--inputs-only') args.inputsOnly = true;
    else if (takes[a]) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--'))
        throw new QualityError('usage', `${a} needs a value`);
      args[takes[a]] = value;
      i += 1;
    } else throw new QualityError('usage', `unknown argument ${a.slice(0, 40)}`);
  }
  if (args.recover !== null) {
    if (!FOLDER.test(args.recover))
      throw new QualityError('usage', '--recover needs a 16-hex job folder name');
    if (args.inputsOnly || args.action || args.caseId || args.proposal || args.supersedes) {
      throw new QualityError('usage', '--recover takes no other argument');
    }
    return args;
  }
  if (args.action !== ACTION)
    throw new QualityError('unsupported-action', `only "${ACTION}" is supported`);
  if (!CASE.test(args.caseId ?? '')) throw new QualityError('usage', '--case must be case-NN');
  if (!PROPOSAL.test(args.proposal ?? '')) {
    throw new QualityError(
      'usage',
      '--proposal must name a record: self-heal-YYYYMMDDTHHMMSSZ (never the default)',
    );
  }
  if (args.supersedes !== null && !FOLDER.test(args.supersedes)) {
    throw new QualityError('usage', '--supersedes needs a 16-hex job folder name');
  }
  return args;
}

// ---------- inputs: one snapshot of everything the review rests on ----------

function snapshot(d, args) {
  const { root } = d;
  const caseDir = `evidence/agent-quality/fixtures/${args.caseId}`;
  const answerRel = `evidence/agent-quality/answers/${args.caseId}/${args.proposal}.md`;
  const fixed = [
    `${caseDir}/case.json`,
    answerRel,
    'evidence/agent-quality/rubric.md',
    'evidence/agent-quality/rubric-map.json',
    INSTRUCTIONS,
    ...Object.values(RUNNER_FILES),
  ];
  const checks = [];
  for (const rel of fixed) checkInScope(root, rel);
  checks.push('paths-in-scope-realpath');

  const run = spawnSync(
    process.execPath,
    [join(root, RUNNER_FILES.bundleScriptSha256), '--review', `${args.caseId} ${args.proposal}`],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  if (run.status !== 0 || typeof run.stdout !== 'string')
    throw new QualityError('input-invalid', 'bundle.mjs did not run');
  const selectedText = run.stdout;
  const { header, files } = parseBundle(selectedText);
  checks.push('bundle-ok');
  if (header.caseId !== args.caseId || header.inputKind !== 'synthetic')
    throw new QualityError('input-invalid', 'bundle header does not match the job');
  if (header.answerRecord !== answerRel)
    throw new QualityError('input-invalid', 'bundle reviewed a different answer record');
  if (header.caseBundleMatchesRecord !== 'yes') {
    throw new QualityError(
      'stale-input',
      `the proposal's quoted case hash does not match the case files now (${header.caseBundleMatchesRecord})`,
    );
  }
  checks.push('case-bundle-hash-matches-record');

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(root, `${caseDir}/case.json`), 'utf8'));
  } catch {
    throw new QualityError('input-invalid', 'case.json is not valid JSON');
  }
  const names = [manifest.requirementPath, ...manifest.evidencePaths];
  const evidence = [{ role: 'manifest', ...fingerprint(root, `${caseDir}/case.json`) }];
  names.forEach((name, i) => {
    const fp = fingerprint(root, `${caseDir}/${name}`);
    const inBundle = files.find((f) => f.name === name);
    if (!inBundle || inBundle.sha256 !== fp.sha256)
      throw new QualityError('stale-input', `${fp.path} differs from the bundle's copy`);
    evidence.push({ role: i === 0 ? 'requirement' : 'evidence', ...fp });
  });
  const answer = fingerprint(root, answerRel);
  const answerInBundle = files.find((f) => f.label === 'original-answer');
  if (!answerInBundle || answerInBundle.sha256 !== answer.sha256)
    throw new QualityError('stale-input', 'the proposal differs from the bundle copy');
  evidence.push({ role: 'original-answer', ...answer });
  evidence.push({
    role: 'rubric-map',
    ...fingerprint(root, 'evidence/agent-quality/rubric-map.json'),
  });
  const rubricFile = fingerprint(root, 'evidence/agent-quality/rubric.md');
  const row = files.find((f) => f.label === 'rubric-row');
  if (!row) throw new QualityError('input-invalid', 'bundle has no checklist row');
  evidence.push({
    role: 'rubric-row',
    path: rubricFile.path,
    sha256: row.sha256,
    bytes: row.bytes,
  });
  checks.push('selected-files-fingerprinted');

  const prompt = readFileSync(join(root, INSTRUCTIONS), 'utf8').replace(/\r\n/g, '\n').trim();
  if (!prompt) throw new QualityError('input-invalid', `${INSTRUCTIONS} is empty`);
  const runner = {};
  for (const [key, rel] of Object.entries(RUNNER_FILES))
    runner[key] = fingerprint(root, rel).sha256;
  const claudeVersion = d.claudeVersion();
  if (!claudeVersion) throw new QualityError('claude-missing', '`claude --version` gave no answer');
  checks.push('runner-and-instructions-hashed');

  // Dirty or untracked files among the selected ones only.
  const selected = [
    ...new Set([...evidence.map((e) => e.path), INSTRUCTIONS, ...Object.values(RUNNER_FILES)]),
  ];
  const headR = d.git(root, ['rev-parse', 'HEAD']);
  const branchR = d.git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const gitOk = headR.status === 0;
  const dirty = [];
  if (gitOk) {
    const st = d.git(root, [
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
      '--',
      ...selected,
    ]);
    if (st.status === 0) {
      for (const line of st.stdout.split('\n')) {
        if (line.trim() === '') continue;
        const path = line.slice(3).replace(/^"|"$/g, '');
        let sha;
        try {
          sha = fingerprint(root, path).sha256;
        } catch {
          sha = null;
        }
        dirty.push({ path, state: line.slice(0, 2).trim(), sha256: sha });
      }
    }
  }
  checks.push(gitOk ? 'git-state-read' : 'git-unavailable');

  const missing = Array.isArray(manifest.missingObservations) ? manifest.missingObservations : [];
  return {
    selectedText,
    prompt,
    files,
    header,
    evidence,
    dirty,
    missing,
    checks,
    caseId: args.caseId,
    answerRel,
    answerSha: answer.sha256,
    rubricRowSha: row.sha256,
    rubricFileSha: rubricFile.sha256,
    rubricRowName: (row.text.match(/^Practice case: (.+)$/m) ?? [])[1] ?? 'unknown',
    reviewerSha: header.bundleSha256,
    selectedTextSha: sha256(selectedText),
    runner,
    claudeVersion,
    source: {
      head: gitOk ? headR.stdout.trim() : null,
      branch: gitOk ? branchR.stdout.trim() : null,
      sourceVersion: header.sourceVersion,
      sourceDate: header.sourceDate,
      gitAvailable: gitOk,
    },
  };
}

/** What must not change between the claim and the end of the call. */
const comparable = (s) =>
  JSON.stringify({
    r: s.reviewerSha,
    t: s.selectedTextSha,
    e: s.evidence,
    p: sha256(s.prompt),
    x: s.runner,
    c: s.claudeVersion,
  });

function buildJob(d, snap, supersedesFull) {
  const id = jobIdFor({
    action: ACTION,
    caseId: snap.caseId,
    proposalRef: snap.answerRel,
    proposalSha256: snap.answerSha,
    reviewerBundleSha256: snap.reviewerSha,
    instructionsSha256: sha256(snap.prompt),
    rubricRowSha256: snap.rubricRowSha,
    claudeVersion: snap.claudeVersion,
    ...snap.runner,
    supersedes: supersedesFull,
  });
  return {
    schema: SCHEMA,
    jobId: id,
    action: ACTION,
    taskId: TASK_ID,
    caseId: snap.caseId,
    inputKind: 'synthetic',
    source: snap.source,
    dirty: snap.dirty,
    evidence: snap.evidence,
    declaredMissingObservations: snap.missing,
    proposal: {
      ref: snap.answerRel,
      sha256: snap.answerSha,
      caseBundleSha256: snap.header.caseBundleSha256,
      recordedBundleSha256: snap.header.recordedBundleSha256,
    },
    rubric: {
      map: 'evidence/agent-quality/rubric-map.json',
      row: snap.rubricRowName,
      rowSha256: snap.rubricRowSha,
      version: `rubric.md sha256 ${snap.rubricFileSha} (supplied checklist, hashes of this checkout's line endings)`,
    },
    reviewerBundleSha256: snap.reviewerSha,
    procedure: {
      route: 'adapter',
      note: 'bundle.mjs --review text on stdin and instructions/quality-review.md as system prompt; not a typed /quality-review run',
      instructions: INSTRUCTIONS,
      instructionsSha256: sha256(snap.prompt),
      ...snap.runner,
      claudeVersion: snap.claudeVersion,
      timeoutMs: d.timeoutMs,
      maxTurns: MAX_TURNS,
      model: null,
    },
    checksRun: snap.checks,
    state: { status: 'claimed', failure: null, claimedAt: d.now().toISOString(), ownerPid: null },
    supersedes: supersedesFull,
    createdAt: d.now().toISOString(),
  };
}

// ---------- the job store ----------

const jobsRoot = (d) => join(d.outRoot, OUT_DIR);
const folderOf = (job) => job.jobId.slice(0, 16);

function readJob(dir) {
  let job;
  try {
    job = JSON.parse(readFileSync(join(dir, 'job.json'), 'utf8'));
  } catch {
    throw new QualityError('malformed-record', `${dir.slice(-16)} has no readable job.json`);
  }
  validateJobRecord(job);
  if (!recordIdMatches(job) || !dir.endsWith(folderOf(job))) {
    throw new QualityError(
      'malformed-record',
      `${dir.slice(-16)}: job id does not match its own fields`,
    );
  }
  return job;
}

function listJobs(d) {
  const base = jobsRoot(d);
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((name) => !name.startsWith('.'))
    .map((name) => {
      if (!FOLDER.test(name))
        throw new QualityError(
          'malformed-record',
          `unexpected entry in ${OUT_DIR}/: ${name.slice(0, 30)}`,
        );
      return { dir: join(base, name), name, job: readJob(join(base, name)) };
    });
}

function saveState(dir, job, patch) {
  job.state = { ...job.state, ...patch };
  writeAtomic(join(dir, 'job.json'), `${JSON.stringify(job, null, 2)}\n`);
}

// ---------- the worker (flags identical to run-worker.mjs; a test compares the lists) ----------

async function runWorker(prompt, input, d) {
  const work = mkdtempSync(join(tmpdir(), 'quality-worker-'));
  const args = [
    '-p',
    '--tools',
    '',
    '--strict-mcp-config',
    '--setting-sources',
    '',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--output-format',
    'stream-json',
    '--verbose',
    '--system-prompt',
    prompt,
  ];
  const { env, removed } = cleanEnv(d.env);
  const lines = [];
  const state = {
    init: null,
    toolUses: 0,
    turns: 0,
    result: null,
    blocked: null,
    stderr: '',
    envRemoved: removed,
    workFiles: [],
    ms: 0,
  };
  const started = Date.now();
  try {
    await new Promise((done) => {
      let child;
      const stop = (why) => {
        state.blocked ??= why;
        d.killTree(child);
      };
      try {
        child = d.spawn('claude', args, {
          cwd: work,
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } catch {
        state.blocked = 'claude could not start';
        done();
        return;
      }
      const timer = setTimeout(() => stop('timeout'), d.timeoutMs);
      const onAbort = () => stop('interrupted');
      if (d.signal) {
        if (d.signal.aborted) onAbort();
        else d.signal.addEventListener('abort', onAbort, { once: true });
      }
      const finish = () => {
        clearTimeout(timer);
        d.signal?.removeEventListener('abort', onAbort);
        done();
      };
      let buffer = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        buffer += chunk;
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          if (!line) continue;
          lines.push(line);
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.type === 'system' && event.subtype === 'init') {
            state.init = event;
            const tools = Array.isArray(event.tools) ? event.tools : ['<missing tool list>'];
            const servers = Array.isArray(event.mcp_servers) ? event.mcp_servers : ['<missing>'];
            const commands = Array.isArray(event.slash_commands)
              ? event.slash_commands
              : ['<missing>'];
            if (tools.length > 0 || servers.length > 0) stop('init lists tools or MCP servers');
            else if (commands.length > 0) stop('init lists slash commands');
            else if (event.apiKeySource !== 'none')
              stop('init does not show the subscription route (apiKeySource)');
          }
          if (event.type === 'assistant') {
            state.turns += 1;
            const uses = Array.isArray(event.message?.content)
              ? event.message.content.filter((part) => part.type === 'tool_use').length
              : 0;
            if (uses > 0) {
              state.toolUses += uses;
              stop('worker attempted a tool call');
            } else if (state.turns > MAX_TURNS) stop('turn cap exceeded');
          }
          if (event.type === 'result') state.result = event;
        }
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        state.stderr += chunk;
      });
      child.on('error', () => {
        state.blocked ??= 'claude could not start';
        finish();
      });
      child.on('close', finish);
      child.stdin.end(input);
    });
  } finally {
    state.ms = Date.now() - started;
    try {
      state.workFiles = readdirSync(work);
    } catch {
      state.workFiles = [];
    }
    rmSync(work, { recursive: true, force: true });
  }
  state.stream = `${lines.join('\n')}\n`;
  return state;
}

function workerSummary(state) {
  const init = state.init ?? {};
  return {
    claudeVersion: init.claude_code_version ?? 'unknown',
    model: init.model ?? 'unknown',
    initTools: init.tools ?? null,
    initMcpServers: init.mcp_servers ?? null,
    initSlashCommands: init.slash_commands ?? null,
    apiKeySource: init.apiKeySource ?? 'not shown',
    toolUses: state.toolUses,
    assistantTurns: state.turns,
    numTurns: state.result?.num_turns ?? null,
    resultSubtype: state.result?.subtype ?? null,
    isError: state.result?.is_error ?? null,
    envVarsRemoved: state.envRemoved,
    workFilesLeft: state.workFiles,
    wallClockMs: state.ms,
    blocked: state.blocked,
  };
}

function failureReason(state, cls) {
  if (state.blocked === 'timeout') return 'deadline';
  if (state.blocked === 'interrupted') return 'interrupted';
  if (state.blocked === 'turn cap exceeded' || /turn cap/.test(cls.status)) return 'turn-limit';
  if (cls.code === 2) return `blocked: ${state.blocked ?? cls.status}`;
  return `worker: ${cls.status}`;
}

// ---------- main ----------

const kv = (k, v) => `${k}: ${v}`;

export async function main(argv, over = {}) {
  const d = realDeps(over);
  const out = [];
  const done = (code, line) => {
    out.push(`quality-run: exit ${code} — ${line}`);
    return { code, out };
  };
  try {
    const args = parseArgs(argv);
    if (args.recover !== null) return recover(d, args, out, done);

    const snap = snapshot(d, args);
    const jobs = listJobs(d);
    let supersedesFull = null;
    if (args.supersedes !== null) {
      const target = jobs.find((j) => j.name === args.supersedes);
      if (!target) throw new QualityError('bad-supersedes', 'no such job folder to supersede');
      if (target.job.caseId !== args.caseId || target.job.proposal.ref !== snap.answerRel) {
        throw new QualityError('bad-supersedes', 'that job reviewed a different case or proposal');
      }
      if (!['failed', 'completed'].includes(target.job.state.status)) {
        throw new QualityError(
          'bad-supersedes',
          `that job is ${target.job.state.status}; recover it first (no call is made)`,
        );
      }
      supersedesFull = target.job.jobId;
    }
    const job = buildJob(d, snap, supersedesFull);
    const folder = folderOf(job);
    const related = jobs.filter(
      (j) => j.job.caseId === args.caseId && j.job.proposal.ref === snap.answerRel,
    );
    const existing = jobs.find((j) => j.job.jobId === job.jobId);

    out.push('QUALITY-RUN-STATUS: ok');
    out.push(kv('action', ACTION), kv('case', job.caseId), kv('proposal', job.proposal.ref));
    out.push(kv('job', folder), kv('reviewerBundleSha256', job.reviewerBundleSha256));
    out.push(
      kv('route', 'adapter (not a typed /quality-review run)'),
      kv('claude', snap.claudeVersion),
    );
    out.push(kv('declaredMissingObservations', job.declaredMissingObservations.length));
    out.push(kv('dirty selected files', job.dirty.length));

    if (existing) return duplicate(existing, out, done);
    if (related.length > 0 && args.supersedes === null) {
      out.push(
        kv(
          'earlier jobs for this proposal',
          related.map((j) => `${j.name}:${j.job.state.status}`).join(', '),
        ),
      );
      return done(
        5,
        'inputs or procedure differ from every earlier job; no call made. A new review needs your explicit decision: --supersedes <job folder>',
      );
    }
    if (args.inputsOnly)
      return done(0, 'inputs ok; a model call would be made on a real run; nothing written');

    // Claim: build the folder aside, then rename it into place. The rename is the atomic claim.
    const base = jobsRoot(d);
    mkdirSync(base, { recursive: true });
    const tmp = join(base, `.tmp-${process.pid}-${Math.random().toString(16).slice(2, 8)}`);
    const dir = join(base, folder);
    mkdirSync(join(tmp, 'inputs'), { recursive: true });
    writeAtomic(join(tmp, 'inputs', 'selected-text.txt'), snap.selectedText);
    writeAtomic(join(tmp, 'inputs', 'system-prompt.txt'), `${snap.prompt}\n`);
    writeAtomic(join(tmp, 'job.json'), `${JSON.stringify(job, null, 2)}\n`);
    d.beforeClaim?.(dir);
    try {
      renameSync(tmp, dir);
    } catch (error) {
      rmSync(tmp, { recursive: true, force: true });
      if (existsSync(dir)) return duplicate({ dir, name: folder, job: readJob(dir) }, out, done);
      throw error;
    }

    saveState(dir, job, {
      status: 'calling',
      callStartedAt: d.now().toISOString(),
      ownerPid: process.pid,
    });
    const worker = await runWorker(snap.prompt, snap.selectedText, d);
    const summary = workerSummary(worker);
    writeAtomic(join(dir, 'stream.jsonl'), worker.stream);
    writeAtomic(join(dir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    out.push(
      kv(
        'worker',
        `tools ${JSON.stringify(summary.initTools)}, MCP ${JSON.stringify(summary.initMcpServers)}, slash ${JSON.stringify(summary.initSlashCommands)}, apiKeySource ${summary.apiKeySource}`,
      ),
    );
    out.push(
      kv(
        'turns',
        `${summary.numTurns ?? summary.assistantTurns}, tool uses ${summary.toolUses}, ${(summary.wallClockMs / 1000).toFixed(1)} s, model ${summary.model}`,
      ),
    );

    const fail = (reason, code, line) => {
      saveState(dir, job, {
        status: 'failed',
        failure: reason,
        finishedAt: d.now().toISOString(),
        ownerPid: null,
      });
      return done(code, line);
    };
    const cls = classifyWorker(worker);
    if (cls.code !== 0) {
      const reason = failureReason(worker, cls);
      return fail(
        reason,
        cls.code,
        `${reason}; this is a processing failure, not a review verdict. No automatic retry.`,
      );
    }

    // Inputs must be unchanged since the claim; otherwise the result is rejected, not kept.
    let after;
    try {
      after = snapshot(d, args);
    } catch (error) {
      if (!(error instanceof QualityError)) throw error;
      return fail(
        'input-changed',
        3,
        `input-changed (${error.code}); reply rejected. A new review needs --supersedes and your decision.`,
      );
    }
    if (comparable(after) !== comparable(snap)) {
      return fail(
        'input-changed',
        3,
        'input-changed during the call; reply rejected. A new review needs --supersedes and your decision.',
      );
    }

    const reply = worker.result.result;
    const verdict = validateFinding(reply, {
      reviewerBundleSha256: snap.reviewerSha,
      answerRecord: snap.answerRel,
      files: snap.files,
    });
    if (!verdict.ok) {
      writeAtomic(join(dir, 'rejected-reply.md'), `${reply.trimEnd()}\n`);
      return fail(
        'bad-reply',
        3,
        `bad-reply (${verdict.problems.join('; ')}); not a verdict. No automatic retry.`,
      );
    }
    writeAtomic(join(dir, 'reply.md'), `${reply.trimEnd()}\n`);
    writeAtomic(
      join(dir, 'finding.json'),
      `${JSON.stringify({ jobId: job.jobId, ...verdict.finding }, null, 2)}\n`,
    );
    job.procedure.model = summary.model;
    saveState(dir, job, {
      status: 'completed',
      finishedAt: d.now().toISOString(),
      ownerPid: null,
      turns: summary.numTurns,
      ms: summary.wallClockMs,
    });
    out.push(kv('overall (advisory)', verdict.finding.overall));
    out.push(kv('reference warnings', verdict.finding.referenceCheck.unresolved.length));
    out.push(kv('finding', `${OUT_DIR}/${folder}/finding.json`));
    return done(
      0,
      "completed; the finding is advisory. Decision and action are the owner's, recorded only in the scorecard.",
    );
  } catch (error) {
    if (error instanceof QualityError) {
      out.push(
        `QUALITY-RUN-STATUS: unavailable ${error.code}`,
        error.message,
        'No model call was made.',
      );
      return done(1, `unavailable ${error.code}`);
    }
    out.push('QUALITY-RUN-STATUS: internal-error');
    return done(4, 'internal-error');
  }
}

function duplicate(existing, out, done) {
  const { job, name } = existing;
  const status = job.state.status;
  out.push(
    kv('existing job', `${name}: ${status}${job.state.failure ? ` (${job.state.failure})` : ''}`),
  );
  if (status === 'completed')
    return done(0, `already completed; no second call. finding: ${OUT_DIR}/${name}/finding.json`);
  if (status === 'failed')
    return done(
      5,
      `duplicate of a failed job; no call made. A retry needs your approval and --supersedes ${name}`,
    );
  return done(
    5,
    `job is marked ${status}; no call made. If the process is gone, run --recover ${name} (no call)`,
  );
}

function recover(d, args, out, done) {
  const dir = join(jobsRoot(d), args.recover);
  const job = readJob(dir);
  const { status, ownerPid } = job.state;
  if (!['claimed', 'calling'].includes(status))
    return done(5, `job is ${status}; nothing to recover`);
  if (ownerPid && d.pidAlive(ownerPid))
    return done(5, `process ${ownerPid} that owns this job is still alive; nothing changed`);
  saveState(dir, job, {
    status: 'failed',
    failure: 'interrupted (recovered without a call)',
    finishedAt: d.now().toISOString(),
    ownerPid: null,
  });
  out.push('QUALITY-RUN-STATUS: recovered', kv('job', args.recover));
  return done(
    0,
    'marked failed: interrupted. No model call was made and nothing was replayed. A retry needs --supersedes.',
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new globalThis.AbortController();
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => controller.abort());
  const result = await main(process.argv.slice(2), { signal: controller.signal });
  process.stdout.write(`${result.out.join('\n')}\n`);
  process.exitCode = result.code;
}
