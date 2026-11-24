---
paths:
  - 'scripts/triage/**'
  - '.claude/commands/triage-run.md'
  - 'safety-tests/triage-run.test.mjs'
  - '.claude/commands/triage-draft.md'
  - 'safety-tests/triage-draft.test.mjs'
  - 'evidence/triage/**'
  - 'vault/wiki/02-playbooks/**'
---

# Triage router (`/triage-run`), saved-report draft (`/triage-draft`) and playbooks

Every rule in `01-guardrails.md`, `60-agent-quality.md` and `70-flaky-triage.md` still applies; this file
adds to them.

## Command and worker

- Do: `/triage-run <input-path>` runs only `node scripts/triage/triage-run.mjs`. The command has
  `disable-model-invocation: true`: the owner types it in a new session; Claude never runs the router
  in its place and never imitates its reply.
- Do: the worker is a separate `claude -p` with the same flags as
  `scripts/agent-quality/run-worker.mjs` (`--tools ""`, `--strict-mcp-config`, `--setting-sources ""`,
  `--disable-slash-commands`, `--no-session-persistence`), an empty temp working folder,
  `scripts/triage/instructions/router.md` as system prompt and only the selected text on stdin.
  Trusted only when the init event lists no tools, no MCP servers and no slash commands and the stream
  has no `tool_use`; otherwise BLOCKED.
- Do: when either runner's flag list changes, change both; the safety test compares them.
- Do: `router.md` forbids proposing that anyone opens or reads secrets or login state.
- ⚠️ `allowed-tools` pre-approves the router line only and removes no tool from the typing session;
  the command text, this rule and the playbooks are instructions, not a permission boundary. Only
  the worker's init event proves the worker had no tools.
- ⚠️ `"$ARGUMENTS"` is expanded into a shell line, as in `/self-heal`. The script refuses any
  argument outside `[A-Za-z0-9._/-]`, but the shell sees the text first; type only a plain path.
- ⚠️ Unverified: whether a slash command's `!` line has a timeout below its worker's deadline (180 s for
  `/triage-run`, 120 s for `/triage-draft`); the records stay on disk either way.

## Inputs

- Do: one input, decided by its path before anything is read:
  `evidence/agent-quality/fixtures/case-NN/case.json` (synthetic, read only through
  `bundle.mjs --self-heal`, unchanged), `evidence/fixtures/flaky/**/<name>.json` (synthetic) or
  `evidence/raw/week4/store-(api|ui)/<run>/run.json` (real, needs its `provenance.txt`). Anything
  else, a link anywhere on the path, an escape, a refused name (`.env*`, `.auth`, storage state,
  keys, `test-results`) or a label that contradicts the provenance is an input error: no worker.
- Do: Playwright JSON is gated by `scripts/flaky-triage.ts` unchanged; its error kind (from its last
  line) becomes the input error. Only stats, statuses, first error lines, locations and attachment
  names are sent; trace and attachment contents are never read.
- Do: a valid bundle that declares `missingObservations` is routed (insufficient evidence /
  unclassified when it decides the class); a missing file, malformed or unknown manifest field,
  unsupported report or unresolved path is an input error, never a diagnosis.
- Do: error text is redacted (local paths, addresses, cookie and token values); text that still looks
  like a secret refuses the input, and its temporary gate folder is removed. Nothing is trimmed to make
  it pass.
- Do not: read or send `rubric.md`, `rubric-map.json`, `scorecard.md`, `answers/` or
  `error-signatures.md`. Signature clues are off (an owner decision); turning them on is a separate
  decision, and a row is never a clue for the run it came from.
- Do: a real input is sent to the model API as redacted text; each real `/triage-run` needs the
  owner's approval in the conversation first, like any outside action.

## Records

- Do: the router writes `selected-text.txt`, `stream.jsonl`, `summary.json` (with the worker's
  `sessionId`) and `flaky/` in the ignored `evidence/raw/week4/triage/<UTC>-<input-id>/`. A synthetic reply
  is written verbatim as a new file `evidence/triage/synthetic/<input-id>/triage-run-<UTC>.md`; a real
  reply stays in the ignored folder (`reply.md`). Never edit or delete a record.
- Do: input IDs keep their source: `case-NN` for bundles (with `sourceVersion` and `sourceDate`
  from the manifest), `flaky-<folder path>` for flaky fixtures (no source version exists; for
  `empty/` and `malformed/` the path is the only synthetic marker), `real-<area>-<run>` for real runs.
- Do: synthetic routing rows go to the routing table in `evidence/agent-quality/scorecard.md`, citing the
  tracked record; real rows go to the pull request description with path, hash and route only. Original
  proposals stay as recorded.
- Do: when an instruction file or the provenance reader changes, records before and after differ (each
  record names its `instructionsSha256`; older records lack `sessionId`, and older provenance reads show
  `exit_code=unknown`). Say so wherever records are compared; never compare headers field by field.
- Do: `evidence/triage/synthetic/` is in `.prettierignore`, like `answers/`: records stay byte-for-byte.

## Playbooks and practice traces

- Do: `vault/wiki/02-playbooks/trace-debugging.md` and `pom-refactoring.md` state only what was
  observed, marked seen / absent / not checked, with their sources. A procedure is not a verified
  repair.
- Do: a practice trace comes only from `evidence/agent-quality/local-check/` through its own config, into
  the ignored `evidence/raw/week4/practice/<UTC>/` (passed with `--output …/test-results`) with a
  `provenance.txt` saying `synthetic: true`. Real traces stay local and are never uploaded. Rule 70's ban on
  fixtures under `evidence/raw/` covers the flaky fixtures, not practice traces.
- Do: a practice exercise counts as complete only while its trace exists and was inspected.
- ⚠️ `test-results/` is emptied by every Playwright run that uses the default output folder, so a trace
  kept there is lost.
- Do: a proposal that touches a locator is reviewed against `10-playwright-pom.md` (verified test id
  first). The analysts do not receive project rules, so the main conversation checks this at review.

## Isolated check

- Do: run `node --test safety-tests/triage-run.test.mjs` after any change in this rule's paths, and
  `npm run test:safety`. It uses `--inputs-only` (no worker, nothing recorded), reads the existing
  synthetic inputs and temp projects only, and never reads a real `run.json`.
- ⚠️ This narrows `01-guardrails.md` "Safety checks stay isolated" for this one file, as rule 70 does:
  it lives in `safety-tests/` but is not in the `node --test` list of `test:safety` (that list is in
  `package.json`, CRITICAL). `npm run test:safety` exits 0 without it.
- Verify: the command exits 0 with every test passed; compare the count with the previous run (74 tests
  when this rule was last revised); a drop needs an explanation.

## Fleet round

- Narrows "Do: one input" (Inputs): `/triage-run --fleet test-repair=<case.json>
flaky-results=<flaky report.json> bug-report=<case.json>` takes three inputs, one per role, each
  role exactly once and no input twice. The argument is one quoted string that starts with exactly
  `--fleet `; every path passes the same text checks, path checks and readers as a single input.
  Single-input, `--probe` and `--inputs-only <path>` behaviour is unchanged.
- Do: a fleet round takes synthetic inputs only (a real `run.json` is refused before it is read),
  a case bundle for `test-repair` and `bug-report` and a flaky report for `flaky-results`. Any
  input error stops the round before a worker starts.
- Do: one parallel round. The three workers use the same `runWorker` (one flag list), start
  together and are all awaited; there is no second round and no combining model. Each role has its
  own question and instructions (`scripts/triage/instructions/test-repair.md`, `flaky-results.md`,
  `bug-report.md`); `router.md` stays the single-input instructions.
- Narrows the record layout (Records): a round writes the ignored
  `evidence/raw/week4/triage/<UTC>-fleet/` (per role `selected-text.txt`, `stream.jsonl`,
  `summary.json`, `flaky/`; plus `round.json` and `triage-report.proposed.md`, marked NOT
  REVIEWED) and, only when all three completed unblocked, `evidence/triage/synthetic/fleet-<UTC>/`
  (`<role>.md`, `round.md`). Those tracked files are verbatim runner records, written by the router
  as single `/triage-run` records are; they are not the reviewed report.
- Do: the reviewed `triage-report.md` (support, disagreement, missing facts, limits) is written only
  by the main conversation, after the owner's review and approval, into the round's folder. The
  rubric and scorecard are used only at that step.
- Do: identify a round by its round ID (`fleet-<UTC>`), each worker's `session_id` from its init
  event and its interval on the router's clock (spawn to close; overlap = two intervals intersect).
  The workers are not subagents and load no project settings, so `.claude/fleet-log.txt` never
  records them; check instead that no fleet-log line has a `ts` inside the round's interval.
- ⚠️ The `flaky-results` input `retry-flaky` shows its class in its path, its `[flaky]` status and its
  test title; its reply is not a measure of analyst quality. For a test marked `[expected]` the summary
  does not list passed attempts.
- ⚠️ Through the slash command, `--inputs-only --fleet …` arrives as one string and is a usage error;
  check fleet inputs from a shell.
- Verify: `node --test safety-tests/triage-run.test.mjs`, and the inputs-only check of the approved round
  from a shell.

## No subagents

- The init event of a `claude -p --agents …` parent lists the subagent names only, never their tools
  (seen on Claude Code 2.1.317). With rule 60's finding for agent files, a subagent's loaded tools cannot
  be proven, so the fleet never uses subagents, agent files or the Agent tool; it runs only as
  `/triage-run --fleet`. Re-check this with a new probe after a Claude Code update before changing the
  route.

## Fresh sessions

- ⚠️ This rule loads only for its `paths:`, not for `vault/_context.md` or `scorecard.md`.
  The hand-off's "Read first" names it, so a fresh session reads it on purpose.
- Do: keep each decision in its own place before a session ends: rules and limits in this rule or
  rule 60/70, results and approvals in the pull request description, case decisions in
  `evidence/agent-quality/scorecard.md`, procedures in the playbooks. A decision that exists only
  in a conversation is not saved.
- Do: end a work block with a `## Handoff` section in `vault/_context.md`: branch and
  commit, completed / blocked / failed / not verified, open questions, one next bounded action, and
  the exact paths to read. Replace the section's content rather than adding a second handoff file
  (git history keeps earlier versions).
- Do: a fresh conversation reads those paths again and runs the section's "Verify before acting"
  checks before changing anything; a difference is reported first.
- Do not: rely on an earlier conversation, the session scratch folder (temporary) or memory for
  results, decisions or baselines.
- Verify: review — the fresh conversation cites the files it read and the result of each check.

## Saved-report draft (`/triage-draft`)

The router, `/self-heal`, `/quality-review` and `/flaky-triage` are unchanged by this command.

- Do: `/triage-draft <report> [--provenance <file>]` runs only `node scripts/triage/triage-draft.mjs`
  (`disable-model-invocation: true`; the owner types it). Claude never runs it in its place and never
  imitates its reply. `--inputs-only` (no model, nothing recorded) is for checks; `--probe` is one real
  call and needs approval like any other.
- Do: input is one explicitly named report: a synthetic fixture under `evidence/fixtures/flaky/`, or a
  tracked `evidence/week4-<area>[-<UTC>].sanitized.json`. A raw `run.json` is out of scope for this
  command. `--provenance` takes only `evidence/raw/week4/(store-api|store-ui|blog-ui)/<UTC>/provenance.txt`
  whose area and UTC match the sanitized name; only `run_id`, `target_env`, `head`, `synthetic`,
  `exit_code` and `end_utc` are read from it (git status and diff blocks, commands and every other line
  are never read or sent). The capture files' own names `target`, `exit` and `utc_end` are read as
  `target_env`, `exit_code` and `end_utc`; with no `run_id`, the run id is the folder name, labelled
  "from the folder name". No provenance means `unverified`, never an error and never guessed.
- Do: the analyst gets up to six error lines per failed attempt (as the router does) and the report's
  `errorLocation` as `at: <file>:<line>:<column>`; the table keeps the first line only.
- Do: missing, malformed, empty, unsupported, interrupted, incomplete, stats-mismatched, zero-test and
  all-skipped input is `unavailable` (exit 1). It is never reported as zero failures. The gate is
  `scripts/flaky-triage.ts` unchanged; the completion rules copy `scripts/slack-report.ts` `evaluate()`
  in the same order, plus a start time and duration.
- Do: a valid run with no unexpected, flaky or retried result prints the table and skips the model
  ("clean-skipped"). Skips stay in the table. A clean report is not proof the product works.
- Do: one bounded call otherwise, with the owner's approval: the router's worker flags (a test compares
  them), an empty temp folder, a 120 s deadline, at most 8 turns counted from the stream (`--max-turns` is
  not in `claude --help` for 2.1.322), no retry, only the sanitized selected text on stdin. A deadline or
  limit stops the owned process by pid (`taskkill /T` on Windows), never by name.
- Do: the child's environment drops `ANTHROPIC_*`, third-party provider switches, `SLACK_*`, `JIRA_*`,
  database variables and any name containing token, secret, password, api key or credential (names are
  recorded, values never). `CLAUDE_CODE_OAUTH_TOKEN` is kept: it is the subscription route. An init
  `apiKeySource` of `user`, `project`, `org` or `temporary` blocks the run. No `--bare`, no
  `--dangerously-skip-permissions`, no `--fallback-model`, no API-key route.
- Do: trust a reply only when the init event lists no tools, MCP servers or slash commands, the stream
  has no `tool_use`, and the result event has the expected fields. Any other shape is `unavailable`.
- Do: the results table is built by the script. TC IDs come from the test title only (`TC-<LETTERS>-<n>`,
  every distinct one shown); otherwise `unknown`. Never from the file name or the catalog.
- Do: raw output goes to the ignored `evidence/raw/week5/triage-draft/<UTC>-<input-id>/`
  (`selected-text.txt`, `stream.jsonl`, `summary.json`, `results-table.md`, `reply.md`). Only the script
  saves the returned text. The reviewed draft is written by the main conversation after the owner's
  review, into the pull request description. Original inputs are never changed.
- Do not: read or send `error-signatures.md` (clues off for this command too), `rubric*`,
  `scorecard.md`, `answers/` or any `run.json`.
- ⚠️ Unverified by the init event: whether a user-level or parent-folder `CLAUDE.md` or memory is
  loaded. None exists at `~/.claude/CLAUDE.md`. The probe asks the worker to report any such context.
- ⚠️ Real error and limit states cannot be triggered harmlessly; fake streams cover them.
- Verify: `node --test safety-tests/triage-draft.test.mjs` (68 tests when this rule was last revised;
  fake caller, no `claude`, no network, no `evidence/raw/` read). Not part of `test:safety`
  (`package.json` is CRITICAL).
