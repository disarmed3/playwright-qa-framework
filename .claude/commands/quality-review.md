---
description: Review one case's recorded /self-heal reply (the first, or the one named) with that case's checklist row in a separate no-tool claude -p worker (supported / not supported / insufficient evidence; text only)
argument-hint: <case-NN> [self-heal-YYYYMMDDTHHMMSSZ]
disable-model-invocation: true
allowed-tools: Bash(node scripts/agent-quality/run-worker.mjs:*)
---

The block below is the output of `scripts/agent-quality/run-worker.mjs` (rule
`.claude/rules/60-agent-quality.md`, "Separate no-tool worker"). The finding in it was written by a
separate `claude -p` process with no tools, no MCP servers, no settings and only the case bundle plus
the recorded reply as input. It is not yours to rewrite.

!`node scripts/agent-quality/run-worker.mjs --review "$ARGUMENTS"`

Reply with the block above unchanged. Then add only: the exit status line (`BLOCKED`, `INPUT ERROR`,
`WORKER FAILED` or the `record:` path), `initTools`, `initMcpServers` and `toolUses` from the summary.
Do not add, correct or extend the finding, and do not run, edit or save anything else.
