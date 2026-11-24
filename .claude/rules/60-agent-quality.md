---
paths:
  - 'evidence/agent-quality/**'
  - 'scripts/agent-quality/**'
  - '.claude/agents/self-heal-worker.md'
  - '.claude/agents/quality-reviewer.md'
  - '.claude/commands/self-heal.md'
  - '.claude/commands/quality-review.md'
  - 'safety-tests/quality-run.test.mjs'
---

# Agent quality practice (self-heal and quality review)

Applies to the main conversation when it prepares practice bundles, runs `/self-heal` or `/quality-review`,
records replies or fills the scorecard. The workers never read a file, so this path-scoped rule never loads
inside them; their instructions repeat their own reply contract.

## Workers have no tools

- Do: `/self-heal` and `/quality-review` run `scripts/agent-quality/run-worker.mjs`. It starts a separate
  `claude -p` with `--tools ""`, `--strict-mcp-config`, `--setting-sources ""`, `--disable-slash-commands`,
  `--no-session-persistence`, the instructions from `scripts/agent-quality/instructions/` (`self-heal.md`,
  `quality-review.md`) as system prompt, an empty temporary working folder, and only the bundle on stdin.
- Do: trust the run only when the stream's init event shows `tools: []` and `mcp_servers: []` and the
  stream has no `tool_use`; otherwise the runner kills the process and reports BLOCKED.
- Do not: start a worker through the Agent tool, a fork or an agent file. An agent file with `tools: []`
  loads as "All tools except" its disallowed list (seen on Claude Code 2.1.319), so no agent file can
  prove a worker has no tools; the former `self-heal-worker` and `quality-reviewer` agent files are removed.
- Do not: give a worker Read, Grep or Glob "for selected paths". Permission rules are session-wide and
  an agent file cannot limit a tool to a folder, so a read tool reaches the answer table, the scorecard
  and every other case.
- Do not: widen access when a worker cannot be set up as above. Report the blocker instead.
- When: every runner, instruction file and command in this rule's paths.
- Verify: `node scripts/agent-quality/run-worker.mjs --probe` (tools, MCP servers and slash commands
  empty, 0 tool uses, 1 turn); a new session's agent list shows neither removed agent.
- ⚠️ `allowed-tools` in a command file only pre-approves its runner line; it removes no tool from the
  typing session. Only the worker's init event proves the worker had no tools. A worker's own
  "I have no tools" is self-report.
- ⚠️ The init event also lists built-in agents and plugins; with no tools the worker can start neither.
- ⚠️ The typed command's main session sees the runner output and could add text of its own; the record
  in `answers/` is written by the runner, not by that session. Type the commands in a new session that
  holds neither the answer table nor the scorecard.

## Inputs: synthetic bundles with a strict manifest

- Do: give a worker input only through `scripts/agent-quality/bundle.mjs`, run by the command. The worker
  sees the bundle text, nothing else from the project. (`/triage-run` has its own route for reports;
  rule 80.)
- Do: one folder per case, `evidence/agent-quality/fixtures/<case-id>/`, neutral id (`case-NN`) and
  neutral file names. Every file is marked synthetic practice input.
- Do: `case.json` has exactly `caseId`, `inputKind` (`synthetic`), `sourceVersion`, `sourceDate`,
  `requirementPath`, `evidencePaths`, `missingObservations`. Paths are plain file names inside the
  same folder and name only files that exist.
- Do not: put a diagnosis, category, expected answer, rubric path or a link to another case in a
  manifest, a file name or a requirement. A requirement states intended product behaviour only.
- Do: the missing-evidence case is a valid bundle that names what is missing in
  `missingObservations`. A missing file, an unreadable manifest or a missing or wrong field is an
  INPUT ERROR, never "insufficient evidence".
- Do not: copy, edit or trim a real report (`evidence/week4-*`, `evidence/raw/`) to manufacture a case.
- Do not: give `/self-heal` the checklist (`rubric.md`) or `rubric-map.json`: its rows are the expected
  answers. `/quality-review` gets only its case's ONE checklist row: `bundle.mjs --review` reads
  `evidence/agent-quality/rubric-map.json` (case ID to row name) and adds only that row of `rubric.md`.
- When: creating or changing a bundle.
- Verify: `node --test safety-tests/agent-quality-bundle.test.mjs`; the bundle script rejects any
  other key, path or missing file with `BUNDLE-STATUS: input-error`.

## Order and records

- Do: hold the healthy case back until the others are diagnosed; run each diagnosis and review in a new
  session.
- Do: the runner records each reply verbatim and unchanged in
  `evidence/agent-quality/answers/<case-id>/<command>-<UTC>.md` (command, argument, bundle SHA-256,
  date, reply), and saves the selected text, stream and summary in the ignored
  `evidence/raw/week4/agent-quality/`. Never edit or delete a record; a correction is a new file.
- Do: keep inputs, source versions and proposals as first recorded.
- Do: when a case has more than one `/self-heal` record, the first is the original. `/quality-review
<case-id> [self-heal-<UTC>]` reviews the first unless a record is named; name it whenever the reviewed
  proposal is not the first. The scorecard cites the first record. A row may cite a later record only by
  an owner decision, and then names the first record in the same row. Later runs stay as recorded and are
  never reviewed in place of the cited one.
- Do: when the worker instructions change, runs before and after used different instructions; say so
  wherever their replies are compared. Records name the instruction file they used (`agentInstructions`).
- Do: `scorecard.md` gets rows only from recorded replies. The owner's decision and reason and the
  separate action outcome are their own columns; no invented outcome or prediction.
- Do not: count confidence, answer length or agreement between runs as quality. One run is one
  observation, not a measured improvement.
- Do: an `error-signatures.md` row is a clue, never proof; it needs an observed source and a date. It is
  not part of any worker input (signature clues are off, an owner decision), and it stays unchanged while
  cases are being diagnosed, so no case's answer reaches another case.
- When: every run and record.
- Verify: review — each scorecard row cites a record path that exists and is unchanged in Git.

## Executable fixture

- Do: `evidence/agent-quality/local-check/` runs only through its own
  `playwright.config.ts` (`--config`): local pages loaded with `setContent`, every request aborted,
  no `baseURL`, server, setup, storage state, credentials, `env/target.ts` or project reporter.
- Do: the repaired assertion stays as strong as the original; the known-bad page must still fail
  it. A candidate repair is entered only after the owner's decision and recorded as an action outcome.
- Do not: change the environment resolver or the normal suite's discovery for this check.
- When: adding or running the check.
- Verify: `npm run test:list` count unchanged against the previous run; the check's own run lists only
  its tests.

## Other routes to a worker

- `/triage-run` (`scripts/triage/triage-run.mjs`) sends a reduced summary of a native Playwright JSON
  report; details in `80-triage-run.md`. It reuses this rule's worker flags (a copied list, compared by
  `safety-tests/triage-run.test.mjs`) and never reads `rubric.md`, `rubric-map.json`, answers or the
  scorecard. Its replies are new files under `evidence/triage/synthetic/`, never in `answers/`; the
  scorecard gets them only as rows of its routing table, synthetic inputs only.

## Manual quality runner

- Do: `scripts/agent-quality/quality-run.mjs` (with `quality-record.mjs`) is an owner-approved route,
  used only by this wrapper. It is an ADAPTER: it supplies the reviewed `/quality-review` procedure's own
  inputs (`bundle.mjs --review` text on stdin, `instructions/quality-review.md` as the system prompt, same
  `\r\n`→`\n` + trim as `run-worker.mjs`) to a separate no-tool `claude -p`. It is never called
  `/quality-review`, never typed in its place, and never imitates the command's reply. `run-worker.mjs`
  stays the authority for the worker flags; a test compares the lists. A call without `--inputs-only`
  needs the owner's approval in the conversation.
- Do: one supported action, `review-self-heal-reply`, for one named record (`--proposal
self-heal-<UTC>`, never the default). Any other action is refused. No second case system, rubric or
  scorecard; the one checklist row is the narrowing granted to `/quality-review` above.
- Do: validate before any call: plain `case-NN` and record names; every selected file resolves, through
  every parent folder, to exactly its expected place (links, junctions, short names are refused);
  `bundle.mjs` manifest checks; the proposal's quoted hash must equal the case bundle hash now
  (`caseBundleMatchesRecord: yes`). Hashes are of this checkout's bytes (CRLF here), never git blob
  hashes. Declared `missingObservations` are carried as limits. Any other fault is `unavailable`, exit 1,
  no call.
- Do: the job id is a hash of the action, case, proposal and its hash, the reviewer bundle (evidence,
  proposal, checklist row), the instructions text, the `claude` version and the hashes of
  `bundle.mjs`, `run-worker.mjs`, `quality-record.mjs`, `quality-run.mjs`, `triage-draft.mjs` and any
  superseded job. Same id = same job: no second call. A different id for an already-reviewed proposal
  makes no call either, until the owner passes `--supersedes <job folder>` in the conversation. A failed
  job is never rerun; its retry is a new job the same way.
- Do: limits per job: one call, 8 turns counted from the stream, 120 s, one kill of the owned pid, no
  retry. Child environment through `cleanEnv` (imported from `triage-draft.mjs`); no `--bare`, no API-key
  route, no `--fallback-model`. Trust a reply only when the init event shows no tools, MCP servers or
  slash commands and `apiKeySource` `none`, and the stream has no `tool_use`. Inputs are snapshotted at
  the claim and re-checked after the call; a change rejects the reply (`failed: input-changed`).
- Do: keep three things apart. Processing state (`job.json`: claimed, calling, completed, failed with a
  reason) is the wrapper's. The advisory finding (`finding.json`, supported / not supported /
  insufficient evidence per check, references, limits) exists only after a valid reply. The owner's
  decision and any applied action live only in `scorecard.md`, added by the main conversation after
  review. A timeout, error, limit, block or unusable reply is never a quality verdict.
- Do: outputs only under the ignored `.qa-quality/<job>/` (job record, `inputs/` snapshot, stream,
  summary, reply, finding); every file is written aside and renamed; the job folder is built aside and
  renamed into place, which is the claim. The wrapper never writes `answers/`, the scorecard, settings
  or hooks, and has no queue or hook. `--recover <job>` only marks an abandoned `claimed` or `calling`
  job failed (no call, refused while its pid is alive).
- Do: a runner review may be recorded in `scorecard.md` only as its own labeled section ("Runner
  review"), added by the main conversation after the owner's decision. It cites the ignored job path and
  hashes, never `answers/`. Existing rows, proposals, decisions and source or rubric versions stay as
  recorded; a rejected or unusable job is recorded as such and is never counted as a verdict.
- Do not: treat the finding as a decision. The validator checks structure, hashes and that references
  exist; whether each causal claim is supported by the cited evidence is not checked mechanically.
  A supported review with no correction is valid.
- ⚠️ Unverified: memory or parent `CLAUDE.md` inheritance (not provable from the init event; none exists
  at `~/.claude/CLAUDE.md`). Limits differ from `run-worker.mjs` (180 s, no turn cap, full environment)
  on purpose.
- Verify: `node --test safety-tests/quality-run.test.mjs` (fake reviewer; not part of `test:safety`).
