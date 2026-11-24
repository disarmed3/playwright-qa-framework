---
description: Prepare exact Jira result-comment rows from a saved native report. Preview only; execution is the owner's, in a terminal.
argument-hint: <sanitized report> <provenance.txt> <issue key> [<issue key> …] [--exercise]
disable-model-invocation: true
allowed-tools: mcp__jira__jira_get_issue, Write(evidence/raw/week5/jira/**), Bash(node scripts/jira/writeback.mjs propose:*)
---

Read `.claude/rules/55-integrations.md` first. This command PROPOSES. It never executes, never sends a
comment and never uses another write tool. Do not read `.env`; do not set `QA_JIRA_WRITE`.

1. Refresh each named issue with the read-only connector: `jira_get_issue`, fields
   `summary,status,labels,updated,issuetype,project`, `update_history: false`, `comment_limit: 0`.
   Do not assume a project key, an issue type or a status; use what the read returned.
2. Write `evidence/raw/week5/jira/<UTC>/mapping.json`:
   `{site, projectKey, readAt, issues:[{key, id, summary, issuetype, status:{name}, labels, updated}], mappings:[{tcId, issueKey, related?}]}`.
   `tcId` is the TC ID at the start of the issue summary, and must also be the start of one test title in
   the report. A case with no key stays unmapped; do not guess one. `related` only for a key the catalog or a
   read names (e.g. a known defect), with its source.
3. Run `node scripts/jira/writeback.mjs propose --report <report> --provenance <provenance> --mapping <mapping.json> --output evidence/raw/week5/jira/<UTC>/proposal.json` (add `--exercise` when asked).
4. Show the whole output unchanged: every row with its row ID, digest, issue, current state, outcome,
   destination, exact comment and evidence. Then say, once, that nothing was sent and that the digest is not
   an approval.
5. Stop. The owner decides which ONE row to approve and rejects the rest. Executing is theirs, in their own
   interactive terminal with the write credentials set there:

   `QA_JIRA_WRITE=1 node scripts/jira/writeback.mjs execute --proposal <proposal.json> --report <report> --approve-row <rowId> --approve <digest>`

   After it, read the approved issue and the rejected issues back through the read-only connector and record
   both the script's receipt and your own reads in the pull request description of the change. After an
   uncertain outcome run only `reconcile` (read-only), never a second `execute`.

Never reuse an earlier digest; a changed report, mapping, state or time means a new proposal.
