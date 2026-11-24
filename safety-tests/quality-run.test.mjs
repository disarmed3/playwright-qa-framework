// Isolated checks for scripts/agent-quality/quality-run.mjs and quality-record.mjs (Week 5, rule 60
// "Manual quality runner"). node:test, no browser, no network, no model: every worker call goes to a FAKE
// caller injected through main(argv, { spawn, killTree, ... }); the real `claude` is never started.
// Every case runs in a temporary root built from synthetic files plus byte copies of the runner scripts;
// nothing under evidence/, .qa-quality/ or evidence/raw/ of this repository is read or written.
// Run: node --test safety-tests/quality-run.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { after, describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RUN = join(ROOT, 'scripts/agent-quality/quality-run.mjs');
const { main } = await import(pathToFileURL(RUN).href);
const rec = await import(
  pathToFileURL(join(ROOT, 'scripts/agent-quality/quality-record.mjs')).href
);

const REAL_QA = join(ROOT, '.qa-quality');
const realQaBefore = existsSync(REAL_QA);
const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

const COPY = [
  'scripts/agent-quality/bundle.mjs',
  'scripts/agent-quality/run-worker.mjs',
  'scripts/agent-quality/quality-record.mjs',
  'scripts/agent-quality/quality-run.mjs',
  'scripts/agent-quality/instructions/quality-review.md',
  'scripts/triage/triage-draft.mjs',
];
const CASE_DIR = 'evidence/agent-quality/fixtures/case-01';
const PROPOSAL = 'self-heal-20261108T211714Z';
const ANSWER = `evidence/agent-quality/answers/case-01/${PROPOSAL}.md`;
const ARGV = ['--action', 'review-self-heal-reply', '--case', 'case-01', '--proposal', PROPOSAL];

function put(root, rel, content) {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

function makeRoot({ missing = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'quality-run-test-'));
  temps.push(root);
  for (const rel of COPY) put(root, rel, readFileSync(join(ROOT, rel)));
  put(
    root,
    `${CASE_DIR}/case.json`,
    `${JSON.stringify({
      caseId: 'case-01',
      inputKind: 'synthetic',
      sourceVersion: 'v1',
      sourceDate: '2026-11-08',
      requirementPath: 'requirement.md',
      evidencePaths: ['test-excerpt.txt', 'run-summary.json'],
      missingObservations: missing,
    })}\n`,
  );
  put(
    root,
    `${CASE_DIR}/requirement.md`,
    'SYNTHETIC practice input.\nThe total equals price times quantity.\n',
  );
  put(root, `${CASE_DIR}/test-excerpt.txt`, 'SYNTHETIC\nline 2\nexpect total 15\n');
  put(
    root,
    `${CASE_DIR}/run-summary.json`,
    `${JSON.stringify({ test: { error: 'expected 15, got 7.5', steps: ['a', 'b'] } })}\n`,
  );
  put(
    root,
    'evidence/agent-quality/rubric-map.json',
    `${JSON.stringify({ 'case-01': 'Product' })}\n`,
  );
  put(
    root,
    'evidence/agent-quality/rubric.md',
    '# Synthetic checklist\n\n| Practice case | Supplied review checklist |\n|---|---|\n| Product | A useful proposal keeps the assertion. |\n',
  );
  const self = spawnSync(
    process.execPath,
    [join(root, 'scripts/agent-quality/bundle.mjs'), '--self-heal', CASE_DIR],
    { encoding: 'utf8' },
  );
  const hash = (self.stdout.match(/^bundleSha256: ([0-9a-f]{64})$/m) ?? [])[1];
  assert.ok(hash, 'case bundle hash for the synthetic answer');
  put(
    root,
    ANSWER,
    `# /self-heal reply (original, verbatim)\n\n- Argument: x\n- bundleSha256: ${hash}\n\n## Reply\n\nA synthetic proposal.\n`,
  );
  return root;
}

const GIT_LINES = ` M ${CASE_DIR}/requirement.md\n?? scripts/agent-quality/quality-run.mjs\n`;
const fakeGit = (_root, args) => {
  if (args[0] === 'rev-parse' && args[1] === 'HEAD') return { status: 0, stdout: 'abc123def456\n' };
  if (args[0] === 'rev-parse') return { status: 0, stdout: 'week-5\n' };
  if (args[0] === 'status') return { status: 0, stdout: GIT_LINES };
  return { status: 1, stdout: '' };
};

const INIT = {
  type: 'system',
  subtype: 'init',
  session_id: 's-1',
  tools: [],
  mcp_servers: [],
  slash_commands: [],
  apiKeySource: 'none',
  claude_code_version: '2.1.322',
  model: 'fake-model',
};
const assistant = (extra = []) => ({
  type: 'assistant',
  message: { content: [{ type: 'text', text: 'x' }, ...extra] },
});
const result = (text, over = {}) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 1,
  result: text,
  ...over,
});

function replyFor(input, over = {}) {
  const sha = over.sha ?? (input.match(/^bundleSha256: ([0-9a-f]{64})$/m) ?? [])[1];
  const verdicts = over.verdicts ?? [
    'supported',
    'supported',
    'supported',
    'supported',
    'supported',
  ];
  const names = [
    'Preserved requirement',
    'Relevance',
    'Assumptions',
    'Proposed action',
    'Checklist row',
  ];
  const rows = names
    .map((name, i) =>
      over.skip === i
        ? null
        : `| ${i + 1}. ${name} | ${verdicts[i]} | ${over.refs ?? 'requirement.md#1-2; run-summary.json#test.error; original-answer §1'} | A reason. |`,
    )
    .filter(Boolean);
  return [
    ...(over.noHash ? [] : [`bundleSha256: ${sha}`]),
    `answerRecord: ${ANSWER}`,
    '',
    '| Check | Verdict | References | Reason |',
    '|---|---|---|---|',
    ...rows,
    '',
    ...(over.noOverall
      ? []
      : [`**Overall**: ${over.overall ?? 'supported'}. References: requirement.md#1`]),
    '',
    ...(over.noNotChecked
      ? []
      : ['**Not checked**:', '- Whether the page source calculates totals.']),
  ].join('\n');
}

const emit = (child, events, closeAfter = 10) => {
  for (const event of events) child.stdout.write(`${JSON.stringify(event)}\n`);
  setTimeout(() => child.emit('close', 0), closeAfter);
};
const goodScript =
  (over = {}) =>
  (child, { input }) =>
    emit(child, [INIT, assistant(), result(replyFor(input, over))]);

function makeSpawn(script, calls) {
  return (cmd, args, opts) => {
    const child = new EventEmitter();
    child.pid = 4242;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    let input = '';
    child.stdin.on('data', (chunk) => {
      input += chunk;
    });
    child.stdin.on('end', () => {
      calls.push({ cmd, args, cwd: opts.cwd, env: opts.env, input });
      script(child, { input, opts });
    });
    return child;
  };
}

async function run(
  root,
  argv = ARGV,
  { script = goodScript(), calls = [], kills = [], over = {} } = {},
) {
  const res = await main(argv, {
    root,
    outRoot: root,
    spawn: makeSpawn(script, calls),
    killTree: (child) => {
      kills.push(child.pid);
      child.emit('close', 1);
    },
    git: fakeGit,
    claudeVersion: () => '2.1.322 (Claude Code)',
    env: { PATH: 'x', ANTHROPIC_API_KEY: 'k', MY_TOKEN: 't', CLAUDE_CODE_OAUTH_TOKEN: 'o' },
    timeoutMs: 5000,
    pidAlive: () => false,
    ...over,
  });
  return { ...res, text: res.out.join('\n'), calls, kills };
}

const jobsDir = (root) => join(root, '.qa-quality');
const folders = (root) =>
  existsSync(jobsDir(root)) ? readdirSync(jobsDir(root)).filter((n) => !n.startsWith('.')) : [];
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const jobOf = (root, name = folders(root)[0]) => readJson(join(jobsDir(root), name, 'job.json'));
const sha = (path) => rec.sha256(readFileSync(path));

describe('valid run', () => {
  test('one call, complete record, restricted worker, nothing outside .qa-quality written', async () => {
    const root = makeRoot();
    const answerBefore = sha(join(root, ANSWER));
    const r = await run(root);
    assert.equal(r.code, 0, r.text);
    assert.equal(r.calls.length, 1);
    const [call] = r.calls;
    assert.equal(call.cmd, 'claude');
    assert.ok(
      call.args.includes('--tools') &&
        call.args.includes('--strict-mcp-config') &&
        call.args.includes('--disable-slash-commands'),
    );
    assert.ok(
      !call.args.includes('--bare') &&
        !call.args.includes('--fallback-model') &&
        !call.args.some((a) => /dangerously/.test(a)),
    );
    assert.ok(
      !('ANTHROPIC_API_KEY' in call.env) &&
        !('MY_TOKEN' in call.env) &&
        call.env.CLAUDE_CODE_OAUTH_TOKEN === 'o',
    );
    assert.ok(call.input.startsWith('BUNDLE-STATUS: ok\nmode: review'));
    assert.ok(!/scorecard|error-signatures/i.test(call.input));
    assert.ok(!call.cwd.startsWith(root), 'worker runs in its own empty temp folder');
    assert.deepEqual(folders(root).length, 1);
    const name = folders(root)[0];
    const dir = join(jobsDir(root), name);
    for (const file of [
      'job.json',
      'finding.json',
      'reply.md',
      'summary.json',
      'stream.jsonl',
      'inputs/selected-text.txt',
      'inputs/system-prompt.txt',
    ]) {
      assert.ok(existsSync(join(dir, file)), file);
    }
    assert.ok(readdirSync(dir).every((n) => !n.endsWith('.tmp')));
    const job = jobOf(root);
    rec.validateJobRecord(job);
    assert.equal(job.state.status, 'completed');
    assert.equal(job.action, 'review-self-heal-reply');
    assert.equal(job.caseId, 'case-01');
    assert.equal(job.procedure.route, 'adapter');
    assert.equal(job.procedure.maxTurns, 8);
    assert.equal(job.procedure.model, 'fake-model');
    assert.equal(job.proposal.ref, ANSWER);
    assert.ok(
      job.checksRun.includes('case-bundle-hash-matches-record') &&
        job.checksRun.includes('paths-in-scope-realpath'),
    );
    assert.ok(
      job.evidence.some((e) => e.role === 'original-answer') &&
        job.evidence.some((e) => e.role === 'rubric-row'),
    );
    assert.equal(job.source.head, 'abc123def456');
    const paths = job.dirty.map((e) => e.path);
    assert.deepEqual(
      paths.sort(),
      [`${CASE_DIR}/requirement.md`, 'scripts/agent-quality/quality-run.mjs'].sort(),
    );
    assert.ok(job.dirty.every((e) => /^[0-9a-f]{64}$/.test(e.sha256)));
    assert.equal(job.supersedes, null);
    const finding = readJson(join(dir, 'finding.json'));
    assert.equal(finding.advisory, true);
    assert.equal(finding.overall, 'supported');
    assert.equal(finding.checks.length, 5);
    assert.equal(sha(join(root, ANSWER)), answerBefore, 'the original proposal is unchanged');
    assert.ok(!existsSync(join(root, 'evidence/agent-quality/scorecard.md')));
    assert.deepEqual(readdirSync(join(root, 'evidence/agent-quality/answers/case-01')), [
      `${PROPOSAL}.md`,
    ]);
  });

  test('a supported review with no correction is valid; mixed verdicts are kept as given', async () => {
    const root = makeRoot();
    const mixed = await run(root, ARGV, {
      script: goodScript({
        verdicts: ['supported', 'not supported', 'supported', 'insufficient evidence', 'supported'],
        overall: 'not supported',
      }),
    });
    assert.equal(mixed.code, 0, mixed.text);
    const finding = readJson(join(jobsDir(root), folders(root)[0], 'finding.json'));
    assert.deepEqual(
      finding.checks.map((c) => c.verdict),
      ['supported', 'not supported', 'supported', 'insufficient evidence', 'supported'],
    );
    assert.equal(finding.overall, 'not supported');
  });

  test('unresolved references are warnings for the owner, not a failure and not a verdict change', async () => {
    const root = makeRoot();
    const r = await run(root, ARGV, {
      script: goodScript({ refs: 'requirement.md#9; ghost.txt#1; run-summary.json#test.nope' }),
    });
    assert.equal(r.code, 0, r.text);
    const finding = readJson(join(jobsDir(root), folders(root)[0], 'finding.json'));
    assert.equal(finding.referenceCheck.unresolved.length, 3);
    assert.equal(finding.warnings.length, 1);
    assert.match(finding.causalClaims, /not mechanically verified/);
  });

  test('declared missing observations are kept as limits and the call still happens', async () => {
    const root = makeRoot({ missing: ['page snapshot at the failing step'] });
    const r = await run(root);
    assert.equal(r.code, 0, r.text);
    assert.equal(r.calls.length, 1);
    assert.deepEqual(jobOf(root).declaredMissingObservations, [
      'page snapshot at the failing step',
    ]);
  });

  test('--inputs-only makes no call and writes nothing', async () => {
    const root = makeRoot();
    const r = await run(root, ['--inputs-only', ...ARGV]);
    assert.equal(r.code, 0, r.text);
    assert.equal(r.calls.length, 0);
    assert.ok(!existsSync(jobsDir(root)));
    assert.match(r.text, /nothing written/);
  });
});

describe('invalid input stops before a model call', () => {
  const cases = {
    'unknown action': (root, argv) => [
      root,
      ['--action', 'other', ...argv.slice(2)],
      /unsupported-action/,
    ],
    'default proposal (not named)': (root) => [
      root,
      ['--action', 'review-self-heal-reply', '--case', 'case-01'],
      /--proposal/,
    ],
    'case with a path': (root) => [
      root,
      ['--action', 'review-self-heal-reply', '--case', '../case-01', '--proposal', PROPOSAL],
      /case-NN/,
    ],
    'unknown flag': (root, argv) => [root, [...argv, '--bare'], /unknown argument/],
    'missing proposal record': (root) => [
      root,
      [
        '--action',
        'review-self-heal-reply',
        '--case',
        'case-01',
        '--proposal',
        'self-heal-20990101T000000Z',
      ],
      /missing-file|no-answer/,
    ],
  };
  for (const [name, build] of Object.entries(cases)) {
    test(name, async () => {
      const [root, argv, pattern] = build(makeRoot(), ARGV);
      const r = await run(root, argv);
      assert.equal(r.code, 1, r.text);
      assert.match(r.text, pattern);
      assert.equal(r.calls.length, 0);
      assert.ok(!existsSync(jobsDir(root)));
    });
  }

  const bundleFaults = {
    'manifest with an unknown key': (root) => {
      const path = join(root, CASE_DIR, 'case.json');
      writeFileSync(
        path,
        readFileSync(path, 'utf8').replace('"caseId"', '"diagnosis":"x","caseId"'),
      );
    },
    'missing evidence file': (root) => rmSync(join(root, CASE_DIR, 'test-excerpt.txt')),
    'secret-like text in evidence': (root) =>
      writeFileSync(join(root, CASE_DIR, 'test-excerpt.txt'), `pass${'word'}: hunter2\n`),
    'rubric-map without the case': (root) =>
      writeFileSync(join(root, 'evidence/agent-quality/rubric-map.json'), '{}\n'),
    'empty instructions': (root) =>
      writeFileSync(join(root, 'scripts/agent-quality/instructions/quality-review.md'), '\n'),
  };
  for (const [name, fault] of Object.entries(bundleFaults)) {
    test(name, async () => {
      const root = makeRoot();
      fault(root);
      const r = await run(root);
      assert.equal(r.code, 1, r.text);
      assert.equal(r.calls.length, 0);
      assert.ok(!existsSync(jobsDir(root)));
    });
  }

  test('stale: the proposal quotes a case hash that no longer matches the case files', async () => {
    const root = makeRoot();
    writeFileSync(
      join(root, CASE_DIR, 'requirement.md'),
      'SYNTHETIC practice input.\nChanged after the proposal was recorded.\n',
    );
    const r = await run(root);
    assert.equal(r.code, 1);
    assert.match(r.text, /stale-input/);
    assert.equal(r.calls.length, 0);
  });

  test('a folder junction above the case files is refused by the resolved path (not only the final entry)', async (t) => {
    const root = makeRoot();
    const fixtures = join(root, 'evidence/agent-quality/fixtures');
    mkdirSync(join(root, 'elsewhere'));
    renameSync(fixtures, join(root, 'elsewhere/fixtures'));
    try {
      symlinkSync(join(root, 'elsewhere/fixtures'), fixtures, 'junction');
    } catch {
      t.skip('cannot create a junction here');
      return;
    }
    const r = await run(root);
    assert.equal(r.code, 1, r.text);
    assert.match(r.text, /path-escape/);
    assert.equal(r.calls.length, 0);
  });

  test('a linked file is refused', async (t) => {
    const root = makeRoot();
    const target = join(root, 'elsewhere.txt');
    writeFileSync(target, 'SYNTHETIC\n');
    rmSync(join(root, CASE_DIR, 'test-excerpt.txt'));
    try {
      symlinkSync(target, join(root, CASE_DIR, 'test-excerpt.txt'), 'file');
    } catch {
      t.skip('cannot create a file link here');
      return;
    }
    const r = await run(root);
    assert.equal(r.code, 1, r.text);
    assert.equal(r.calls.length, 0);
  });

  test('claude not answering --version is unavailable, no call', async () => {
    const r = await run(makeRoot(), ARGV, { over: { claudeVersion: () => null } });
    assert.equal(r.code, 1);
    assert.match(r.text, /claude-missing/);
  });
});

describe('records: malformed, altered, duplicate, changed', () => {
  test('a malformed job record stops every run before a call', async () => {
    const root = makeRoot();
    mkdirSync(join(jobsDir(root), 'aaaaaaaaaaaaaaaa'), { recursive: true });
    writeFileSync(join(jobsDir(root), 'aaaaaaaaaaaaaaaa/job.json'), '{ "schema": ');
    const r = await run(root);
    assert.equal(r.code, 1);
    assert.match(r.text, /malformed-record/);
    assert.equal(r.calls.length, 0);
  });

  test('an altered record (id no longer matches its fields) is malformed, not trusted', async () => {
    const root = makeRoot();
    await run(root);
    const path = join(jobsDir(root), folders(root)[0], 'job.json');
    const job = readJson(path);
    job.procedure.claudeVersion = '9.9.9';
    writeFileSync(path, JSON.stringify(job));
    const again = await run(root);
    assert.equal(again.code, 1);
    assert.match(again.text, /malformed-record/);
    assert.equal(again.calls.length, 0);
  });

  test('a duplicate makes no second call and shows the finished job', async () => {
    const root = makeRoot();
    const first = await run(root);
    const second = await run(root);
    assert.equal(first.calls.length, 1);
    assert.equal(second.calls.length, 0);
    assert.equal(second.code, 0);
    assert.match(second.text, /already completed; no second call/);
    assert.equal(folders(root).length, 1);
  });

  test('a changed requirement file is a new input: no silent reuse, no call without --supersedes', async () => {
    const root = makeRoot();
    await run(root);
    const old = folders(root)[0];
    const oldJob = sha(join(jobsDir(root), old, 'job.json'));
    // Keep the proposal's quoted hash valid for the new text by re-recording it (a new owner decision).
    writeFileSync(
      join(root, CASE_DIR, 'requirement.md'),
      'SYNTHETIC practice input.\nThe total equals price times quantity, rounded.\n',
    );
    const self = spawnSync(
      process.execPath,
      [join(root, 'scripts/agent-quality/bundle.mjs'), '--self-heal', CASE_DIR],
      { encoding: 'utf8' },
    );
    const hash = self.stdout.match(/^bundleSha256: ([0-9a-f]{64})$/m)[1];
    const answer = join(root, ANSWER);
    writeFileSync(
      answer,
      readFileSync(answer, 'utf8').replace(
        /- bundleSha256: [0-9a-f]{64}/,
        `- bundleSha256: ${hash}`,
      ),
    );
    const r = await run(root);
    assert.equal(r.code, 5, r.text);
    assert.equal(r.calls.length, 0);
    assert.match(r.text, /--supersedes/);
    assert.equal(folders(root).length, 1);
    assert.equal(sha(join(jobsDir(root), old, 'job.json')), oldJob, 'the old record is untouched');
    const next = await run(root, [...ARGV, '--supersedes', old]);
    assert.equal(next.code, 0, next.text);
    assert.equal(next.calls.length, 1);
    assert.equal(folders(root).length, 2);
    assert.equal(sha(join(jobsDir(root), old, 'job.json')), oldJob);
    const created = jobOf(
      root,
      folders(root).find((n) => n !== old),
    );
    assert.equal(created.supersedes, jobOf(root, old).jobId);
  });

  for (const [name, edit] of [
    [
      'runner script hash (run-worker.mjs)',
      (root) =>
        writeFileSync(
          join(root, 'scripts/agent-quality/run-worker.mjs'),
          `${readFileSync(join(root, 'scripts/agent-quality/run-worker.mjs'), 'utf8')}\n// changed\n`,
        ),
    ],
    [
      'instructions text',
      (root) =>
        writeFileSync(
          join(root, 'scripts/agent-quality/instructions/quality-review.md'),
          `${readFileSync(join(root, 'scripts/agent-quality/instructions/quality-review.md'), 'utf8')}\nExtra line.\n`,
        ),
    ],
  ]) {
    test(`a changed ${name} is a new job and needs --supersedes`, async () => {
      const root = makeRoot();
      await run(root);
      edit(root);
      const r = await run(root);
      assert.equal(r.code, 5, r.text);
      assert.equal(r.calls.length, 0);
    });
  }

  test('a different claude version is a new job and needs --supersedes', async () => {
    const root = makeRoot();
    await run(root);
    const r = await run(root, ARGV, { over: { claudeVersion: () => '2.2.0 (Claude Code)' } });
    assert.equal(r.code, 5, r.text);
    assert.equal(r.calls.length, 0);
  });

  test('--supersedes must name an existing, finished job of the same proposal', async () => {
    const root = makeRoot();
    const none = await run(root, [...ARGV, '--supersedes', 'bbbbbbbbbbbbbbbb']);
    assert.equal(none.code, 1);
    assert.match(none.text, /bad-supersedes/);
    assert.equal(none.calls.length, 0);
    assert.ok(rec.jobIdFor({ action: 'a' }) !== rec.jobIdFor({ action: 'a', supersedes: 'x' }));
  });

  test('the job id changes with every input it names', () => {
    const base = {
      action: 'a',
      caseId: 'c',
      proposalRef: 'p',
      proposalSha256: '1',
      reviewerBundleSha256: '2',
      instructionsSha256: '3',
      rubricRowSha256: '4',
      claudeVersion: 'v',
      bundleScriptSha256: '5',
      runWorkerSha256: '6',
      qualityRecordSha256: '7',
      qualityRunSha256: '8',
      triageDraftSha256: '9',
      supersedes: null,
    };
    const id = rec.jobIdFor(base);
    for (const key of Object.keys(base))
      assert.notEqual(rec.jobIdFor({ ...base, [key]: 'changed' }), id, key);
  });
});

describe('claims, interruption and recovery', () => {
  test('simultaneous claims make exactly one call', async () => {
    const root = makeRoot();
    const calls = [];
    const [a, b] = await Promise.all([run(root, ARGV, { calls }), run(root, ARGV, { calls })]);
    assert.equal(calls.length, 1);
    assert.deepEqual([a.code, b.code].sort(), [0, 5]);
    assert.equal(folders(root).length, 1);
  });

  test('a claim lost at the last moment never overwrites the winner and makes no call', async () => {
    const root = makeRoot();
    const r = await run(root, ARGV, {
      over: {
        beforeClaim: (dir) => {
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, 'winner.txt'), 'x');
        },
      },
    });
    assert.equal(r.calls.length, 0);
    assert.notEqual(r.code, 0);
    assert.ok(existsSync(join(jobsDir(root), folders(root)[0], 'winner.txt')));
    assert.ok(
      readdirSync(jobsDir(root)).every((n) => !n.startsWith('.tmp-')),
      'no half-built folder is left behind',
    );
  });

  test('interruption stops the owned child once, marks the job failed:interrupted, and is not a verdict', async () => {
    const root = makeRoot();
    const controller = new globalThis.AbortController();
    const kills = [];
    const calls = [];
    const r = await run(root, ARGV, {
      calls,
      kills,
      script: (child) => {
        child.stdout.write(`${JSON.stringify(INIT)}\n`);
        setTimeout(() => controller.abort(), 20);
      },
      over: { signal: controller.signal },
    });
    assert.equal(r.code, 2, r.text);
    assert.deepEqual(kills, [4242]);
    assert.equal(calls.length, 1);
    const job = jobOf(root);
    assert.equal(job.state.status, 'failed');
    assert.equal(job.state.failure, 'interrupted');
    assert.ok(!existsSync(join(jobsDir(root), folders(root)[0], 'finding.json')));
  });

  test('a job left in "calling" is never replayed; --recover changes only its state; a retry needs --supersedes', async () => {
    const root = makeRoot();
    await run(root);
    const name = folders(root)[0];
    const path = join(jobsDir(root), name, 'job.json');
    const job = readJson(path);
    job.state = { ...job.state, status: 'calling', ownerPid: 99999 };
    writeFileSync(path, JSON.stringify(job));
    const stuck = await run(root);
    assert.equal(stuck.code, 5);
    assert.equal(stuck.calls.length, 0);
    assert.match(stuck.text, /--recover/);
    const alive = await run(root, ['--recover', name], { over: { pidAlive: () => true } });
    assert.equal(alive.code, 5);
    assert.equal(jobOf(root, name).state.status, 'calling');
    const recovered = await run(root, ['--recover', name]);
    assert.equal(recovered.code, 0, recovered.text);
    assert.equal(recovered.calls.length, 0);
    assert.match(jobOf(root, name).state.failure, /interrupted/);
    const again = await run(root);
    assert.equal(again.code, 5);
    assert.equal(again.calls.length, 0);
    assert.match(again.text, /--supersedes/);
    const retry = await run(root, [...ARGV, '--supersedes', name]);
    assert.equal(retry.code, 0, retry.text);
    assert.equal(retry.calls.length, 1);
    assert.equal(folders(root).length, 2);
  });

  test('--recover refuses a finished job and bad names', async () => {
    const root = makeRoot();
    await run(root);
    const done = await run(root, ['--recover', folders(root)[0]]);
    assert.equal(done.code, 5);
    const bad = await run(root, ['--recover', 'nope']);
    assert.equal(bad.code, 1);
  });
});

describe('worker failures are processing states, never verdicts', () => {
  const events = (init) => [init, assistant(), result('ignored')];
  const blocked = {
    'init lists a tool': events({ ...INIT, tools: ['Bash'] }),
    'init lists an MCP server': events({ ...INIT, mcp_servers: [{ name: 'x' }] }),
    'init lists slash commands': events({ ...INIT, slash_commands: ['help'] }),
    'init shows an API-key route': events({ ...INIT, apiKeySource: 'user' }),
    'init does not show the route at all': events({ ...INIT, apiKeySource: undefined }),
    'a tool call': [INIT, assistant([{ type: 'tool_use', name: 'Read' }]), result('ignored')],
  };
  for (const [name, stream] of Object.entries(blocked)) {
    test(`blocked: ${name}`, async () => {
      const root = makeRoot();
      const r = await run(root, ARGV, { script: (child) => emit(child, stream) });
      assert.equal(r.code, 2, r.text);
      assert.equal(r.calls.length, 1);
      assert.deepEqual(r.kills, [4242]);
      const dir = join(jobsDir(root), folders(root)[0]);
      assert.equal(jobOf(root).state.status, 'failed');
      assert.ok(!existsSync(join(dir, 'finding.json')) && !existsSync(join(dir, 'reply.md')));
    });
  }

  test('a ninth turn is a turn-limit failure', async () => {
    const root = makeRoot();
    const r = await run(root, ARGV, {
      script: (child) =>
        emit(child, [INIT, ...Array.from({ length: 9 }, () => assistant()), result('x')]),
    });
    assert.equal(r.code, 2);
    assert.equal(jobOf(root).state.failure, 'turn-limit');
    assert.deepEqual(r.kills, [4242]);
  });

  const unavailable = {
    is_error: [
      INIT,
      assistant(),
      result('Something broke', { is_error: true, subtype: 'error_during_execution' }),
    ],
    'rate-limit text': [INIT, assistant(), result('Usage limit reached', { is_error: true })],
    'unknown result shape': [INIT, assistant(), { type: 'result', subtype: 'success' }],
    'no result event': [INIT, assistant()],
    'empty reply': [INIT, assistant(), result('   ')],
  };
  for (const [name, stream] of Object.entries(unavailable)) {
    test(`unavailable: ${name}; no replay`, async () => {
      const root = makeRoot();
      const calls = [];
      const r = await run(root, ARGV, { calls, script: (child) => emit(child, stream) });
      assert.equal(r.code, 3, r.text);
      assert.equal(calls.length, 1);
      assert.equal(jobOf(root).state.status, 'failed');
      assert.ok(!existsSync(join(jobsDir(root), folders(root)[0], 'finding.json')));
      assert.match(r.text, /not a review verdict/);
      const again = await run(root, ARGV, { calls });
      assert.equal(again.code, 5);
      assert.equal(calls.length, 1, 'no automatic paid replay');
    });
  }

  test('a hung worker is stopped at the deadline: one kill of the owned pid, no retry', async () => {
    const root = makeRoot();
    const calls = [];
    const r = await run(root, ARGV, { calls, script: () => {}, over: { timeoutMs: 40 } });
    assert.equal(r.code, 2, r.text);
    assert.deepEqual(r.kills, [4242]);
    assert.equal(calls.length, 1);
    assert.equal(jobOf(root).state.failure, 'deadline');
  });

  const badReplies = {
    'a check is missing': { skip: 2 },
    'a verdict is not allowed': {
      verdicts: ['supported', 'probably', 'supported', 'supported', 'supported'],
    },
    'the hash header is missing': { noHash: true },
    'the hash header is wrong': { sha: 'f'.repeat(64) },
    'no overall verdict': { noOverall: true },
    'no "Not checked" section': { noNotChecked: true },
  };
  for (const [name, over] of Object.entries(badReplies)) {
    test(`bad reply: ${name} is kept aside and is no verdict`, async () => {
      const root = makeRoot();
      const r = await run(root, ARGV, { script: goodScript(over) });
      assert.equal(r.code, 3, r.text);
      const dir = join(jobsDir(root), folders(root)[0]);
      assert.equal(jobOf(root).state.failure, 'bad-reply');
      assert.ok(existsSync(join(dir, 'rejected-reply.md')));
      assert.ok(!existsSync(join(dir, 'finding.json')) && !existsSync(join(dir, 'reply.md')));
    });
  }

  test('inputs changed during the call: the reply is rejected and not kept', async () => {
    const root = makeRoot();
    const r = await run(root, ARGV, {
      script: (child, { input }) => {
        appendTo(join(root, CASE_DIR, 'test-excerpt.txt'), 'edited while the reviewer ran\n');
        emit(child, [INIT, assistant(), result(replyFor(input))]);
      },
    });
    assert.equal(r.code, 3, r.text);
    assert.equal(jobOf(root).state.failure, 'input-changed');
    const dir = join(jobsDir(root), folders(root)[0]);
    assert.ok(!existsSync(join(dir, 'finding.json')) && !existsSync(join(dir, 'reply.md')));
  });
});

function appendTo(path, text) {
  writeFileSync(path, `${readFileSync(path, 'utf8')}${text}`);
}

describe('reply validation and writes', () => {
  test('writeAtomic leaves the whole file and no temporary file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'quality-atomic-'));
    temps.push(dir);
    const path = join(dir, 'x.json');
    rec.writeAtomic(path, 'one');
    rec.writeAtomic(path, 'two');
    assert.equal(readFileSync(path, 'utf8'), 'two');
    assert.deepEqual(readdirSync(dir), ['x.json']);
  });

  test('validateFinding accepts a clean reply and names structure problems', () => {
    const sha = 'a'.repeat(64);
    const files = [{ label: 'requirement', name: 'requirement.md', text: 'a\nb\n' }];
    const ctx = { reviewerBundleSha256: sha, answerRecord: ANSWER, files };
    const ok = rec.validateFinding(replyFor('', { sha, refs: 'requirement.md#1-2' }), ctx);
    assert.equal(ok.ok, true, ok.problems.join());
    assert.deepEqual(ok.finding.referenceCheck.unresolved, []);
    const bad = rec.validateFinding('nothing useful', ctx);
    assert.equal(bad.ok, false);
    assert.ok(bad.problems.length >= 5);
  });
});

describe('boundaries of the wrapper itself', () => {
  const runSource = readFileSync(RUN, 'utf8');
  const flagList = (text) =>
    (text.match(/const args = \[([\s\S]*?)\];/) ?? [])[1]?.replace(/\s+/g, '');

  test('worker flags equal run-worker.mjs and triage-draft.mjs (copied lists, compared)', () => {
    const mine = flagList(runSource);
    assert.ok(mine && mine.includes("'--tools'"));
    assert.equal(
      mine,
      flagList(readFileSync(join(ROOT, 'scripts/agent-quality/run-worker.mjs'), 'utf8')),
    );
    assert.equal(
      mine,
      flagList(readFileSync(join(ROOT, 'scripts/triage/triage-draft.mjs'), 'utf8')),
    );
  });

  test('instructions are normalised like run-worker.mjs, and the environment cleaner is the triage one', () => {
    assert.match(runSource, /replace\(\/\\r\\n\/g, '\\n'\)\.trim\(\)/);
    assert.match(
      runSource,
      /import \{ cleanEnv, classifyWorker \} from '\.\.\/triage\/triage-draft\.mjs'/,
    );
    assert.ok(
      !/--bare|--fallback-model|dangerously|ANTHROPIC_API_KEY\s*=/.test(
        runSource.replace(/\/\/.*$/gm, ''),
      ),
    );
  });

  test('the runner never writes outside its own folder, answers/, the scorecard, settings or hooks', () => {
    const code = (text) => text.replace(/\/\/.*$/gm, '');
    for (const text of [
      code(runSource),
      code(readFileSync(join(ROOT, 'scripts/agent-quality/quality-record.mjs'), 'utf8')),
    ]) {
      const writes = text
        .split('\n')
        .filter((line) => /writeAtomic\(|writeFileSync\(|renameSync\(|rmSync\(/.test(line));
      assert.ok(writes.length > 0);
      for (const line of writes)
        assert.ok(!/answer|scorecard|settings|hook|husky|claude/i.test(line), line.trim());
      assert.ok(!/fetch\(|node:https?|node:net|WebSocket|jira|slack/i.test(text));
    }
  });

  test('.qa-quality/ is ignored in this repository, and these tests created nothing there', () => {
    assert.match(readFileSync(join(ROOT, '.gitignore'), 'utf8'), /^\.qa-quality\/$/m);
    assert.equal(existsSync(REAL_QA), realQaBefore);
  });
});

describe('reference forms added after the first real review (2026-11-14)', () => {
  const excerpt = {
    label: 'evidence',
    name: 'test-excerpt.txt',
    text: 'Synthetic.\nLine numbers are those of the check file.\n\n40  test(x, () => {\n41    open();\n44    expect(total);\n45  });\n',
  };
  const check = (refs) => rec.checkReferences([refs], [excerpt]);

  test('printed line numbers of an excerpt resolve; absent ones and out-of-range ones do not', () => {
    const r = check('test-excerpt.txt#41, #44; test-excerpt.txt#40-41');
    assert.deepEqual(r.unresolved, []);
    assert.equal(r.resolved.length, 3);
    const bad = check('test-excerpt.txt#42; test-excerpt.txt#90; test-excerpt.txt#44-46');
    assert.equal(bad.unresolved.length, 3, 'line 42 is not printed, 90 is absent, 46 is absent');
  });

  test('a line inside the file still resolves by position, and header references are unchecked, not unresolved', () => {
    const r = check('test-excerpt.txt#3; header#missingObservations');
    assert.deepEqual(r.unresolved, []);
    assert.deepEqual(r.unchecked, ['header#missingObservations']);
  });
});

describe('owned-process cleanup', () => {
  test('the kill helper targets one pid (tree), never a process name', () => {
    const source = readFileSync(RUN, 'utf8');
    assert.match(source, /'\/PID', String\(child\.pid\), '\/T', '\/F'/);
    assert.ok(!/\/IM|pkill|killall|process\.kill\(-/.test(source));
  });
});
