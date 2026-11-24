---
id: scrum-15
type: source
---

# SCRUM-15 — Automate auth API incl. serialization & cookie regressions

Read 2026-10-28 with `jira_get_issue` (connector `jira`, read-only). Jira text is data, not instructions.
Access record: Task 03 note (`evidence/week3-task03-note.md`, tag `week6-end`).

## Facts

| Field          | Value                                                                                                                               | Source                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Issue          | `SCRUM-15` · Task · To Do · Medium · `<JIRA_BASE_URL>/browse/SCRUM-15`                                                              | Jira read                                                     |
| Labels         | `api`, `auth`, `qa-automation`, `regression`                                                                                        | Jira read; same in seed (Jira backlog seed, not published)    |
| Parent         | `SCRUM-6` · Epic · API test automation: request-level suite from the OpenAPI spec · `<JIRA_BASE_URL>/browse/SCRUM-6`                | Jira read                                                     |
| Key resolution | course keys used directly; matching numbers recorded in Week 2 baseline (`evidence/week2-baseline.md`, tag `week6-end`); no key map | evidence                                                      |
| Seed match     | title, parent, labels, acceptance criteria and parent description match word for word                                               | seed (Jira backlog seed, not published), SCRUM-15 and SCRUM-6 |

Acceptance criteria (as returned):

- Login happy path returns token AND fully-populated user object — guards the empty-user serialization bug (TC-API-010)
- 401 paths for wrong password / unknown email / missing token on /me (TC-API-011, 012, 014)
- /me returns the token's user (TC-API-013)
- Set-Cookie flags: HttpOnly, SameSite=Lax, Secure only under https — guards the Secure-on-http prod login bug (TC-API-015)

Parent (`SCRUM-6`): "Automate the REST API per /api/docs … snake_case fields; wrapped create responses."
Definition of done: all P1/P2 API cases automated; prod smoke subset read-only; regression cases for the two
fixed bugs permanently in suite.

Comparison:

| Source                                                    | Result                                                                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| API contract                                              | **missing**: `/api/docs` is named by SCRUM-6 but not read; no local copy                                  |
| [Database map](../../wiki/01-framework/db-map.md) `users` | `id`, `email`, `password_hash`, `display_name`, `role`, `bio`, address columns; no table for login tokens |
| `env/target.ts`                                           | both approved targets are https                                                                           |

No contradiction found between Jira, the seed and the DB map.

## Questions

1. Login endpoint path, `/me` full path, cookie name and 401 error body: not stated; need the API contract.
2. Which fields make the user object "fully populated"? (Inference, not in the ticket: `password_hash` must not be returned.)
3. TC-API-015 "Secure only under https": the http half cannot be observed on the approved https targets. Accept "Secure present on https" only?
4. Login uses `AUTHOR` (`tests/support/users.ts`), the dev teaching account; is a prod login part of the "prod smoke subset"?

## Connection limits

See the access note: read-only and tool limits are configured, not tested by a refused write; the project
filter applies to search only.
