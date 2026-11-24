---
description: Route one input (a Task 03 case.json bundle or a native Playwright JSON report) to evidence references, likely class, missing information, next check and a proposal or draft, in a separate no-tool claude -p worker, or run one reviewed --fleet round of three no-tool analysts in parallel (text only; never edits, runs tests, resets data, files issues or sends messages)
argument-hint: <evidence/agent-quality/fixtures/case-NN/case.json | evidence/fixtures/flaky/<…>.json | evidence/raw/week4/store-(api|ui)/<run>/run.json> | --fleet test-repair=<case.json> flaky-results=<flaky report.json> bug-report=<case.json>
disable-model-invocation: true
allowed-tools: Bash(node scripts/triage/triage-run.mjs:*)
---

The block below is the output of `scripts/triage/triage-run.mjs` (rule
`.claude/rules/80-triage-run.md`). The routing in it was written by a separate `claude -p` process
with no tools, no MCP servers, no settings and only the selected input as text. It is not yours to
rewrite.

!`node scripts/triage/triage-run.mjs "$ARGUMENTS"`

Reply with the block above unchanged. Then add only: the `TRIAGE-STATUS` line, the `record:` path if
any, `initTools`, `initMcpServers` and `toolUses` from the summary if present, and the final
`triage-run: exit …` line. Do not add, correct or extend the routing; do not run, edit or save
anything else. If the block shows `TRIAGE-STATUS: input-error`, report it and stop.

Fleet round (rule 80, "Fleet round"): for a `--fleet` argument the block holds one
round of three separate no-tool analysts. Add only: the `round:` line, each role's status line
(tools, MCP servers, slash commands, tool uses, worker session, interval), `overlap:`, the
`TRIAGE-STATUS` line, each `record:` path, the `proposed report (NOT REVIEWED, ignored):` path and
the final `triage-run: exit …` line. Do not compare, combine, correct or extend the replies, and do
not write a `triage-report.md`: the reviewed report is written later by the main conversation after
the owner's review and approval.
