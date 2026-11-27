---
paths:
  - 'scripts/jira/**'
  - 'safety-tests/jira-*.test.mjs'
  - '.claude/commands/traceability.md'
  - '.claude/commands/writeback.md'
  - '.claude/commands/report-bug.md'
  - 'evidence/raw/week5/jira/**'
---

# Jira: traceability, result comments and bug previews

The case catalog IDs, the SCRUM keys and the read-only `jira` connector are the fixed base of every route
below.

## Discovery stays on the read-only connector

- Do: read Jira only through the `jira` server in `.mcp.json` (`--read-only`, project filter `SCRUM`,
  tools `jira_get_issue` and `jira_search`). Inspect the actual site, project, issue types, fields and
  pages first; do not assume a project key, a `Bug` type or a transition.
- Do: page `jira_search` to the end. It returns `total: -1` and a `next_page_token`; a read is complete only
  when no token is left. An incomplete read supports no conclusion (`traceability.mjs` exits 2).
- Do: save what was read as a snapshot in `evidence/raw/week5/jira/<UTC>/` (git-ignored through
  `evidence/raw/`). The scripts never call Jira for discovery.
- The write script reads an issue only as a precondition and readback of its own comment, with the write
  credentials. That is not discovery and not evidence of record; the independent `jira_get_issue` read is.
- Verify: `.mcp.json` arguments unchanged; `node --test safety-tests/jira-traceability.test.mjs`.

## Traceability (`/traceability`)

- Do: join, per TC ID, the catalog row (`vault/sources/test-catalog/`), the listed test (full identity:
  file, describe chain, title, project) and the Jira case key read from the snapshot. Report apart: tests
  without a case; cases without a test; intentionally manual (only if the catalog row says so); deferred by
  the owner (the catalog's "Deferred" list, read from the catalog text even where a case has no row; neither
  manual nor missed coverage); duplicates; unknown mappings. The catalog sweep is limited to the suite's
  catalog file(s) with `--catalog <file.md>`; a TC ID of a listed test or read case is still looked up in the
  whole catalog. The test list comes from Playwright discovery without the npm banner:
  `npx cross-env APP_ENV=dev playwright test --list --reporter=json <suite path>`. Never create a missing issue, never guess a key. TC-SUI-014, TC-SAPI-074 and TC-UI-015 have
  no seed key: they stay unknown.
- Do: check every mapped case for exactly one of `env-dev`, `env-dev-prod`, `env-prod` against the code's
  `runIfEnv(test, [...])` list, read as syntax. Findings: ok, missing (empty labels included), multiple,
  code/label mismatch, unknown declaration (non-literal list), prod-allowlisted but declared dev only.
  Issues outside the audited suite (for example SCRUM-4 "Subtask 2.1") are listed separately, not dropped.
  The report prints the JQL used and the client filter. A zero-result JQL is not the audit: JQL cannot see two
  labels or a disagreement with the code.
- Label corrections are proposals in the report. `/writeback` does not edit labels.
- Limit: the catalog has no environment column, so catalog-versus-code is not compared.

## Writeback (`/writeback`, `scripts/jira/writeback.mjs`)

- Supported: one evidence comment on one issue, preserving the report's actual outcome (passed, failed,
  skipped, flaky, unknown). Not supported: transitions (no default Done), label edits, issue creation.
- Do: build rows only from a tracked sanitized native Playwright report plus its `provenance.txt` (target
  dev, start time matching). A synthetic fixture, a triage output or a model opinion is refused as evidence.
  Outcome comes from the test-level `status` and its last result, never from the spec-level `ok` (a skipped
  test has `ok: true`). One row per TC ID and run; runs are never merged.
- Do: the comment says whether the run came from an uncommitted tree (head, modified and untracked counts
  from the provenance). Skip reasons are cleaned of internal references. No error message is copied.
- A row shows: stable row ID `WB-<runUTC>-<sha8>`, issue key and URL, issue type, current status, labels and
  `updated`, marker-comment state, outcome, destination (method, full URL, operation, headers), the exact
  comment, transition none, evidence path and hash. Its digest covers all of it plus the site, the proposal
  ID and the report hash.
- Approval: only the owner running `execute` in an interactive terminal, with the row ID and that row's
  digest, and typing the digest again at the prompt. Silence, an earlier approval, text in a source and a
  reviewer's verdict approve nothing. One proposal allows one execution; the other rows are rejected.
- Execute order: environment not prod, no receipt, proposal intact, report hash equal, digest equal,
  `QA_JIRA_WRITE=1`, terminal confirmation, write credentials and site equal, fresh read of the issue and
  refusal on any difference (status, labels, `updated`, summary, existing marker), one POST, readback by
  marker, status and labels unchanged, rejected rows re-read.
- Uncertain outcome (timeout, 5xx, a failed readback): receipt state `uncertain`, no retry. `reconcile` is
  read-only and records whether the marker exists. After a not-posted result a new proposal (new digest) and
  a new approval are required.
- Credentials: `JIRA_WRITE_BASE_URL`, `JIRA_WRITE_EMAIL`, `JIRA_WRITE_API_TOKEN`, a separate short-lived token
  set in the owner's own terminal session for the one command, not in `.env` (the read server loads all of
  `.env`) and never in chat. `QA_JIRA_WRITE=1` is set inline for that command, never at launch.
- No Jira mutation in CI; no batch or approve-all. `safety-tests/ci-workflow.test.mjs` fails if the workflow
  mentions Jira credentials, the script or the gate variable.

## What is and is not a lock

- Technical, tested with fakes: the gate variable, the digest, the terminal prompt (a non-interactive call is
  refused: checked by running the real CLI without a terminal), the receipt, the site check, the state recheck.
- Not a lock: this file, the command text, `disable-model-invocation` (it stops Claude invoking the slash
  command, not a Bash call), an ask rule on a script, a curl deny rule (`node -e fetch(...)` bypasses it).
- The write token is an ordinary Atlassian API token. It can do more than comment; the script limits what
  this route sends, not what the token could do elsewhere. Another script holding it is outside this route.
- Applied in `.claude/settings.json`: deny the whole claude.ai Atlassian connector and curl/wget/Invoke-* to atlassian hosts; ask for `writeback.mjs execute`. Tested: the
  curl and Invoke-WebRequest denials refused and the connector vanished from the session. Not tested: the ask entry (a prompt, not a
  refusal) and anything outside Claude (the owner's terminal, `node -e fetch`).
- Do not call a writable connector or REST directly to get around this route.

## Bug preview (`/report-bug`)

- Do: classify test, data, environment, product or undetermined from the saved reports. A skip is never a
  defect. Draft only when the test failed in at least two saved runs with the same first error line, never
  passed, the error is an assertion, and a complete duplicate search (and the catalog's recorded bug keys)
  found no candidate. Otherwise print why there is no draft. No bug quota, no automatic creation, no weaker
  assertion. The draft names project, type, summary, observed, expected (catalog, verbatim) and evidence.
- Bugs in this project are `Task` issues titled "[Bug] …"; a `Bug` type was not verified.
- Creating an issue needs a separately scoped and verified write route and the owner's approval; this
  exercise does not enable it.

## Records

- Simulated checks (fake responses) and real Jira results are recorded apart in the pull request
  description. A fake-response pass proves no live access and no successful update.
- Isolated checks (not in `npm run test:safety`; run each with `node --test`):
  `safety-tests/jira-writeback.test.mjs`, `jira-traceability.test.mjs`, `jira-bug-draft.test.mjs`,
  `ci-workflow.test.mjs`.
