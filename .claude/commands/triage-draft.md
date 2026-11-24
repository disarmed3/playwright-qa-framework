---
description: Draft a triage note for one saved native Playwright JSON report (a fixture or a tracked sanitized copy). A valid clean run skips the model; invalid input is an error; a failure or instability signal makes one bounded no-tool claude -p call (text only; never edits, runs tests, files issues or sends messages)
argument-hint: <evidence/fixtures/flaky/<…>.json | evidence/week4-<area>-<UTC>.sanitized.json> [--provenance evidence/raw/week4/<area>/<UTC>/provenance.txt]
disable-model-invocation: true
allowed-tools: Bash(node scripts/triage/triage-draft.mjs:*)
---

The block below is the output of `scripts/triage/triage-draft.mjs` (rule
`.claude/rules/80-triage-run.md`, "Saved-report draft"). The results table in it was built by the
script from the report. Any analyst text in it was written by a separate `claude -p` process with no
tools, no MCP servers, no settings and only the selected report text. It is not yours to rewrite.

!`node scripts/triage/triage-draft.mjs "$ARGUMENTS"`

Output the block above verbatim: every line, in order, inside one code fence. Do not summarise,
reorder, merge, rename or omit any line, including the `initTools`, `apiKeySource`, `write probe`
and `env variables removed` lines and the version and model line. After the fence write only the
final `triage-draft: exit …` line. Do not add, correct or extend the table or the analyst text; do
not run, edit or save anything else. If the block shows `unavailable`, report it and stop.
The reviewed draft is written later by the main conversation, after the owner's review and approval.

Why so strict: a typing session that was only told "unchanged" paraphrased the block and dropped lines.
The wrapper's own `summary.json` in the ignored record folder stays the source of truth either way.
