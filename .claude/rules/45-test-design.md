---
paths:
  - 'test-design/**'
  - 'vault/sources/test-catalog/**'
---

# Test design (designer agent)

Applies to the main conversation when it prepares a requirement input, runs `/design-tests` or `/cover`,
or saves a reviewed design. The agent file (`.claude/agents/test-designer.md`) repeats its own output
contract, because this path-scoped rule loads in the designer only after it reads a file under
`test-design/` (checked with a control run on `README.md`).

## The designer drafts, the main conversation saves

- Do: delegate design to the `test-designer` agent; it has Read, Grep, Glob and `jira_get_issue` only
  and returns text. Show its text unchanged, then wait for the owner's review.
- Do: save only after review and the owner's yes, only to `test-design/<KEY>/AC<n>-design.md`.
- Do not: save designer output to `vault/sources/test-catalog/`. A catalog save is a separate approved
  step under rule 50; `NEW-n` labels stay until that step allocates IDs.
- When: every design or coverage run.
- Verify: review — the conversation shows the draft, the review and the approval before any save.
- ⚠️ The tool list is not path isolation. Read can open any path the deny list in
  `.claude/settings.json` misses (e.g. `.playwright-mcp/`); the agent's instructions and review cover that.

## One source-linked input per acceptance criterion

- Do: write `test-design/inputs/<KEY>-AC<n>.md` with the criterion quoted exactly, the approved source
  paths with the sections to read, the genuine unknowns that apply, and what is out of scope.
- Do: find sources through `vault/_map.md`; do not create another map or copy unrelated notes.
- Do: use the Jira keys as they are (the backlog keys match the seed; no key map). A key without a
  requirement note under `vault/sources/jira/` needs a new approved read first; report it as a missing
  source until then.
- When: before `/design-tests` or `/cover`.
- Verify: every listed path exists; the criterion matches the requirement note word for word.

## Contract from a dated local snapshot

- Do: the designer reads `test-design/contract/openapi-dev-<YYYY-MM-DD>.json`. It has no web or shell
  tool; a new snapshot is one approved dev `GET` by the main conversation, base address from
  `env/target.ts`, recorded with date, status, bytes and SHA-256 in the pull request description.
- Do: keep snapshots untracked (`test-design/contract/` is in `.gitignore`) and out of Prettier. They
  hold the contract's example login values, which rule 50 forbids copying.
- When: a design needs the contract.
- Verify: `git check-ignore test-design/contract/<file>` prints the path; the recorded SHA matches the file.
- ⚠️ A missing or changed snapshot is reported, never guessed. A SHA that differs from the catalog's
  is an open question.

## Output: Covered, New, Gap, OPEN QUESTIONS

- Do: Covered cites an existing catalog ID; New uses a temporary label (`NEW-1`); Gap is a required
  behavior with no case; OPEN QUESTIONS stay visible. No quota for any of them, no invented requirement.
- Do: keep three facts apart: a catalog row, an implemented test (`spec:title`) and a dated run result
  (a saved report or a CI run). A catalog "passed" note is a claim until a run confirms it.
- Do: list the sources and sections actually read; a link alone does not prove a read. A conflict or
  an outdated source is an open question.
- Do: choose techniques by risk (boundaries, input groups, states, authorization, validation, async
  behavior, idempotency, integrity), each with one plain reason; skip what does not fit.
- Do: classify the same way every time: Covered = the test asserts the row's Expected; Gap = stated by the requirement, or `required`/documented in the contract, but
  not asserted or without a case; New = inside the criterion's wording with no case; outside the
  wording, a property not marked `required`, or an undocumented observed value = question only.
- Do: the designer reads only the files the input lists; a missing source goes under
  "Not done", so every needed dependency belongs in the input.
- When: every designer reply.
- Verify: review the reply against this list.

## Write-boundary check

- Do: after any change to the agent's tools, run it once on `test-design/fixtures/write-boundary-input.md`
  (local, no Jira) and confirm `test-design/fixtures/_probe-output.md` does not exist, `git status`
  shows nothing new, and today's `vault/_changelog/` has no `_probe-output` entry.
- When: the agent file changes, and once before first use.
- Verify: the check results in the pull request description.
