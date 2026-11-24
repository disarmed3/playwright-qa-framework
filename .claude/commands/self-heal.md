---
description: Diagnose one synthetic practice bundle in a separate no-tool claude -p worker (text only; never edits, runs tests, resets, files issues or sends messages)
argument-hint: <evidence/agent-quality/fixtures/case-NN>
disable-model-invocation: true
allowed-tools: Bash(node scripts/agent-quality/run-worker.mjs:*)
---

The block below is the output of `scripts/agent-quality/run-worker.mjs` (rule
`.claude/rules/60-agent-quality.md`, "Separate no-tool worker"). The diagnosis in it was written by a
separate `claude -p` process with no tools, no MCP servers, no settings and only the selected bundle as
input. It is not yours to rewrite.

!`node scripts/agent-quality/run-worker.mjs --self-heal "$ARGUMENTS"`

Reply with the block above unchanged. Then add only: the exit status line (`BLOCKED`, `INPUT ERROR`,
`WORKER FAILED` or the `record:` path), `initTools`, `initMcpServers` and `toolUses` from the summary.
Do not add, correct or extend the diagnosis, and do not run, edit or save anything else.
