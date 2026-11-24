---
description: Preview a bug draft for a supported product defect after checking evidence and duplicates. Creates nothing.
argument-hint: <TC-ID> <report,report,…> <provenance,provenance,…>
allowed-tools: mcp__jira__jira_search, Write(evidence/raw/week5/jira/**), Bash(node scripts/jira/report-bug.mjs:*)
---

Read `.claude/rules/55-integrations.md` and `.claude/rules/45-test-design.md` first. This command PREVIEWS. It
never files an issue and never changes a test or an assertion. There is no bug quota.

1. Check duplicates through the read-only `jira` connector only: `jira_search` on the TC ID, on the failing
   behaviour's key words and on `[Bug]` Tasks, page each to the end, and save
   `evidence/raw/week5/jira/<UTC>/dupes.json` as `{queries:[{jql, complete, issues:[{key, summary, issuetype, status}]}]}`.
   A query you could not finish is `complete: false`.
2. Run `node scripts/jira/report-bug.mjs --tc <TC-ID> --reports <a,b,…> --provenance <a,b,…> --dupes <dupes.json> [--mapping <mapping.json>]`.
3. Show the output unchanged. A skip, a pass, one failing run, an unstable test, a non-assertion error, a
   missing or incomplete duplicate search and any duplicate candidate each end with "no draft" and a reason;
   say so and stop. Do not turn a failed test into a bug claim yourself.
4. A draft is text for the owner. Filing needs a separately scoped and verified write route and the owner's
   explicit approval; this exercise has neither.
