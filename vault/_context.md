---
id: context
type: guide
---

# Context

What is verified today, what the tooling cannot do, and what comes next. Each line names its source;
nothing here is newer than that source. Updated 2026-11-27, after this repository's first commit
(`0fc3b1c`). Counts are dated; recount before relying on one.

## Verified state

| What                                          | Result (2026-11-27 unless dated)                                                                         | Source                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Test listing (`npm run test:list`)            | `Total: 73 tests in 23 files`: blog UI and API, store UI and API, opt-in `tests/db`                      | local run                                                |
| Environment gates (`npm run check:env-gates`) | 23 spec files, 0 findings                                                                                | local run                                                |
| Isolated checks (`npm run test:safety`)       | 129 Playwright and 396 `node:test` checks passed (a Linux run skips 2 Windows-only checks)               | local run                                                |
| Git hook checks (`npm run test:git-hooks`)    | 59 of 59 passed                                                                                          | local run                                                |
| Spec notes and links                          | `vault:check` 23 of 23 fresh; `vault:validate` 0 broken                                                  | local run                                                |
| CI on dev                                     | static checks and the `@smoke` tests passed on the first commit (run 46056277209)                        | GitHub Actions                                           |
| Signed-in tests with environment logins       | the signed-in smoke test passed in CI with the repository secrets; locally the logins come from `.env`   | GitHub Actions                                           |
| Hooks live in Claude Code                     | recorder, guard, preflight, Stop, SessionEnd; the spec-note refresh after a Claude edit is live verified | [hook lifecycle map](03-framework/hook-lifecycle-map.md) |
| Database access                               | restricted connector; rights match the issued list, no elevated right (inspected 2026-10-26)             | [rule 40](../.claude/rules/40-db-postgres.md)            |
| Database map                                  | 12 tables in `public`, from schema metadata only (read 2026-10-28)                                       | [database map](wiki/01-framework/db-map.md)              |
| Dashboard                                     | `qa-dashboard validate`: 73 tests; dev enabled (70 available), prod disabled                             | local run                                                |

No run has changed data on prod; every spec is dev-only (`runIfEnv`) and the prod smoke allowlist is empty.

## Known product issues

Filed by hand in Jira and kept as failing or pinned tests, never weakened:

- SCRUM-163: a guest can read a draft article by id (TC-API-070 pins it; [blog API](sources/product/blog-api.md)).
- SCRUM-164: the API shows other authors' drafts, the dashboard only their own (TC-API-071, open question).
- SCRUM-165: a failed login puts the email in the redirect URL.
- SCRUM-166: cart lines show no product image (TC-SUI-020 fails until fixed).

## Limits

- The spec notes record titles and Page Object imports only. They do not read assertions; the human
  section of each note explains those.
- The generator accepts only the syntax the current specs use. A new construct is reported, not guessed;
  extend `scripts/vault-notes.mjs` and its tests first.
- Only Claude's own `Edit`/`Write` calls refresh a note at once. A spec saved in an editor, or changed by a
  shell command, leaves its note stale until `npm run vault:sync` or a commit that stages the spec. The
  optional `FileChanged` watcher is not configured.
- Pre-push checks the working copy, not the pushed commits.
- The link checker confirms that targets exist; it never checks headings or web addresses.
- `main` is protected: every change needs a pull request with a green `CI result` (admins included). A
  skipped dev-test job fails `CI result`, so draft pull requests and pull requests from forks (which never
  receive the secrets) cannot merge.
- Citations of "(tag `week6-end`)" or of an `evidence/…` note point to the private course history, which is
  not part of this repository (README, "History").
- The prod smoke workflow has never run; no page is approved as safe to read on prod.
- No Jira key map (`vault/sources/jira/key-map.md` does not exist); Jira keys match the backlog seed, which is
  not included here.

## Next work

1. Optional: rename `evidence/` to `fixtures/` (it now holds only tool inputs and records).
