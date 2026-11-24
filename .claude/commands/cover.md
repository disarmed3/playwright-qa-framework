---
description: Coverage only for one acceptance criterion with the test-designer agent (catalog IDs vs implemented tests vs dated run results); no new cases, never saves
argument-hint: <test-design/inputs/KEY-ACn.md>
allowed-tools: Read, Grep, Glob
disable-model-invocation: true
---

Report coverage for the input `$ARGUMENTS` (rule `.claude/rules/45-test-design.md`).

1. Check that `$ARGUMENTS` is a file under `test-design/inputs/` and that it exists. If not, stop and
   name what is missing.
2. Read the input. Check that every listed source path exists. If one is missing, stop and name it.
3. Delegate to the `test-designer` agent with: "Coverage mode. Input: `$ARGUMENTS`."
4. Show the agent's reply unchanged. Then summarize per catalog ID: in catalog, implemented test,
   last run with its evidence date; and list the Gaps and OPEN QUESTIONS.
5. Save nothing. If the owner wants the result kept, propose a path under `test-design/<KEY>/` and
   wait for the owner's yes.
