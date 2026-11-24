# Input — SCRUM-15 AC2: 401 paths

Prepared 2026-10-30 (Week 3 Task 08) for `/design-tests` and `/cover`. Sources were found through
[vault/\_map.md](../../vault/_map.md) (Sources). Key resolution reuses Task 03: course keys match, no
key map; `SCRUM-15` was read in Jira on 2026-10-28. No fresh Jira read is needed for this input.

## Acceptance criterion (exact, from the requirement note)

> 401 paths for wrong password / unknown email / missing token on /me (TC-API-011, 012, 014)

Out of scope: SCRUM-15 AC1 (login happy path), AC3 (`/me` identity), AC4 (cookie flags), and every
other issue.

## Scope of "missing token" (owner's working assumption, 2026-10-31, pending the mentor)

"Missing token" means either of two requests to `/me`, each its own case:

1. no `Authorization` header and no cookie (TC-API-014);
2. an `Authorization` header with an empty `Bearer` value and no cookie (one case for the empty-token
   group; its expected 401 is this assumption, not a requirement).

Questions only, no rows: a context that has just failed to log in (whether a rejected login leaves a
session), and any malformed, expired or foreign token.

## Sources to read

| Path                                               | Sections                                                                                                                         | Why                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `vault/sources/jira/SCRUM-15.md`                   | Facts (acceptance criteria, parent); Comparison; Questions → 1                                                                   | requirement and its open question on the 401 body                    |
| `evidence/week3-task03-note.md` (tag `week6-end`)  | Facts: reads; Connection limits                                                                                                  | how the issue was read; key resolution                               |
| `vault/sources/test-catalog/blog-api.md`           | Sources; Auth — SCRUM-15 → rows TC-API-011, TC-API-012, TC-API-014 only; Live sample — 2026-10-28; OPEN QUESTIONS → Q4, Q11, Q12 | canonical catalog                                                    |
| `vault/sources/test-catalog/baseline-map.md`       | row "Authentication success and rejection"                                                                                       | requirement → case map                                               |
| `vault/wiki/01-framework/db-map.md`                | Accounts → `users`                                                                                                               | account columns and constraints (metadata only)                      |
| `test-design/contract/openapi-dev-2026-10-30.json` | `paths` → `/api/auth/login` (`post`, responses `401`); `/api/auth/me` (`get`, `security`, responses); `components`               | current contract (see below)                                         |
| `tests/blog/api/auth.spec.ts`                      | tests titled `TC-API-011 …`, `TC-API-012 …`, `TC-API-014 …`                                                                      | implemented tests (not run results)                                  |
| `tests/support/api.ts`                             | fixtures `guestApi` and `freshApi`; `login()`                                                                                    | what a guest or fresh request context sends (dependency of the spec) |
| `evidence/week3-task05-note.md` (tag `week6-end`)  | Batch 1 run (2026-10-29)                                                                                                         | dated run result for the auth API spec                               |
| `evidence/week3-checks.md` (tag `week6-end`)       | Authentication → Identities and separation; Open issues                                                                          | guest `/me` observed in the UI fixtures; open issues                 |

Contract snapshot: dev `https://dev.ai-orchestration-courses.com/api/docs/json` (base address from
`env/target.ts`), read 2026-10-30 21:23 UTC, HTTP 200, 16,335 bytes, SHA-256
`8f2ef6955633222799ab685067bd0c44d32066a6ce8ee4298ce6ddc680c83350` — the same SHA the catalog records
for its 2026-10-28 read. Local and untracked; it holds example login values that must not be copied.

## Known unknowns for this criterion

Carried from the sources above; add any others you find, and keep them as questions.

- `/me` without a token: 401 is a requirement, not in the contract (catalog Q4).
- Error body: login 401 is documented as `{error, message}`; the live sample also saw
  `{statusCode, code, error, message}` for validation errors. Which shape should be asserted (Q12)?
- Error codes `invalid_credentials` and `unauthorized` were observed, not documented (Q4).
- Is a token rejected after logout? Not documented (Q11). Not part of AC2's text; a question only.
- Lockout or rate limiting after wrong-password attempts on the shared AUTHOR account: no source
  states it; the Task 04 live sample avoided a wrong-password login for that reason.
