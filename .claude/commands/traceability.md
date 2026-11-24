---
description: Join catalog TC IDs, listed tests and real Jira cases; audit env labels. Read only; creates nothing in Jira.
argument-hint: <the bounded suite as a tests/ path, e.g. tests/store/ui>
allowed-tools: mcp__jira__jira_search, mcp__jira__jira_get_issue, Bash(npx cross-env APP_ENV=dev playwright test --list:*), Bash(node scripts/jira/traceability.mjs:*), Write(evidence/raw/week5/jira/**)
---

Read `.claude/rules/55-integrations.md` first. Use ONLY the read-only `jira` connector for Jira; no
other Atlassian tool, no REST call, no `.env`. Never create or change an issue.

The argument is the bounded suite (a `tests/…` path). Without one, ask which suite; do not default to every test.

1. Inspect, do not assume: one `jira_get_issue` on a known case key for site, project, issue type and
   fields. Find the Jira parent tasks of the suite from the catalog rows of its tests (the Requirement
   column) and their sibling tasks in the same catalog file, then `jira_search` with
   `project = <the project read> AND issuetype = Subtask AND parent in (<those parents>)`, fields
   `summary,labels,status,issuetype,parent`, limit 50. A mapped test whose case sits under another parent
   (for example an API case checked through the UI) is read with `jira_get_issue`. Follow `next_page_token`
   until none is left. Also run the missing-label query
   `... AND (labels is EMPTY OR labels not in (env-dev, env-dev-prod, env-prod))` and page it too. If a page
   fails, mark the query `complete: false`.
2. Write the snapshot to `evidence/raw/week5/jira/<UTC>/snapshot.json`:
   `{site, projectKey, readAt, route, queries:[{jql, pages, complete}], issues:[{key, summary, issuetype, status, labels, parent}], notes:[…]}`
   with only values the reads returned. Do not fill a field the read did not return; if a read leaves out
   `labels` (the missing-label query does for an issue with none), write `[]` and say so in `notes`.
3. List the tests (Playwright discovery; lists, runs nothing), saved without the npm banner that
   `npm run test:list` prints: `npx cross-env APP_ENV=dev playwright test --list --reporter=json <suite path> > evidence/raw/week5/jira/<UTC>/list.json`
4. Run `node scripts/jira/traceability.mjs --snapshot <snapshot.json> --list <list.json> --catalog <catalog file(s) of the suite, e.g. store-ui.md> --out evidence/raw/week5/jira/<UTC>/report.md`
   and show its output unchanged. Report incomplete access as a blocker, not as a result.

Meanings stay apart: "deferred" (the catalog lists the case as deferred), "intentionally manual" (the catalog
says so) and "without a test" are different findings; none of them is a pass, and a deferred or manual case
is not missing coverage by itself. The report's label corrections are proposals only. Do not apply them; do
not offer a write.
