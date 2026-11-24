---
description: Draft a risk-based test design for one acceptance criterion with the test-designer agent (read-only); show it for review, never save
argument-hint: <test-design/inputs/KEY-ACn.md>
allowed-tools: Read, Grep, Glob
disable-model-invocation: true
---

Draft a test design for the input `$ARGUMENTS` (rule `.claude/rules/45-test-design.md`).

1. Check that `$ARGUMENTS` is a file under `test-design/inputs/` and that it exists. If not, stop and
   name what is missing.
2. Read the input. Check that every listed source path exists, including the contract snapshot under
   `test-design/contract/`. If one is missing, stop and name it; a missing snapshot needs an approved
   dev read by the main conversation first.
3. Delegate to the `test-designer` agent with: "Design mode. Input: `$ARGUMENTS`."
4. Show the agent's reply unchanged. Then list, in your own words, its Gap rows and OPEN QUESTIONS.
5. Propose the save path `test-design/<KEY>/AC<n>-design.md` and wait for the owner's review and yes.
   Do not save, and do not change `vault/sources/test-catalog/`.
