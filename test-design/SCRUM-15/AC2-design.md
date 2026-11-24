# SCRUM-15 AC2 — test design (reviewed)

- Input: `test-design/inputs/SCRUM-15-AC2.md`, SHA-256 `aee0f028bb30cacbabe2df120c10dc5e5df701b91a3a6cd0022fa17df8872c7a`
- Contract: `test-design/contract/openapi-dev-2026-10-30.json`, SHA-256 `8f2ef6955633222799ab685067bd0c44d32066a6ce8ee4298ce6ddc680c83350` (untracked, local)
- Proposal: `test-designer` run C, 2026-10-31, delegation "Design mode. Input: `test-design/inputs/SCRUM-15-AC2.md`." (the `/design-tests` steps); run D agreed on every row
- Review: owner and main conversation, 2026-10-31. Nothing here allocates an ID, changes the catalog or records a run.
- Run times are UTC, with local time (UTC+2) in brackets where a source uses it.

## 1. Original proposal (run C, text unchanged; Prettier aligned table spacing and added two blank lines)

## Design draft: SCRUM-15 AC2 (401 paths). Mode: design. Nothing saved, because I cannot write files.

> 401 paths for wrong password / unknown email / missing token on /me (TC-API-011, 012, 014)

I did not call Jira. The input says no fresh read is needed.

### 1. Sources read

| Path                                               | Section                                                                               | Facts used                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test-design\inputs\SCRUM-15-AC2.md`               | whole file                                                                            | The exact AC text. What is out of scope (AC1, AC3, AC4). The owner's two meanings of "missing token" (2026-10-31). Topics that get questions only. The snapshot SHA. The known unknowns.                                                                                                                                                                                                                                                          |
| `vault/sources/jira/SCRUM-15.md`                   | Facts; Comparison; Questions → 1                                                      | The AC2 wording matches the input word for word. Parent is SCRUM-6. Q1: the 401 error body is not stated by the ticket. The Comparison row says "API contract **missing**", which is now outdated (see question 9).                                                                                                                                                                                                                               |
| `evidence/week3-task03-note.md` (tag `week6-end`)  | Facts: reads; Connection limits                                                       | SCRUM-15 was read on 2026-10-28 with `update_history: false` and `comment_limit: 0`. Course keys are used directly, with no key map. Read-only access is configured but no refused write has proved it.                                                                                                                                                                                                                                           |
| `vault/sources/test-catalog/blog-api.md`           | Sources; Auth rows TC-API-011, 012, 014; Live sample 2026-10-28; Q4, Q11, Q12         | OAS read 2026-10-28, SHA `8f2ef695…c83350`. Expected values: 011 = 401 with `error` and `message` as strings and no `token`. 012 = 401 with the same `error` as 011. 014 = 401 (requirement, not in OAS). Live sample: `/me` without a token gave 401 `unauthorized`; an unknown address gave 401 `invalid_credentials`. The sample did not compare 012 with 011.                                                                                 |
| `vault/sources/test-catalog/baseline-map.md`       | row "Authentication success and rejection"                                            | Maps to TC-API-010 to 015 in `tests/blog/api/auth.spec.ts`. Result cell: passed 2026-10-29 (Batch 1). Its Blockers cell still says "missing implementation" (question 8).                                                                                                                                                                                                                                                                         |
| `vault/wiki/01-framework/db-map.md`                | Accounts → `users`                                                                    | `email` is UNIQUE and NOT NULL. `password_hash` is NOT NULL. There is no table for login tokens, so whether a token is still valid after logout cannot be seen in the database.                                                                                                                                                                                                                                                                   |
| `test-design/contract/openapi-dev-2026-10-30.json` | `/api/auth/login` post, 401; `/api/auth/me` get, security and responses; `components` | Login 401 body is `{error: string, message: string}`, with no `required` list. Login 200 also sets an httpOnly session cookie. `/me` has security `bearerAuth` and documents only a 200 with no body schema. `bearerAuth` is http bearer, format JWT. `schemas` is empty. I did not copy the example login values.                                                                                                                                |
| `tests/blog/api/auth.spec.ts`                      | tests TC-API-011, 012, 014                                                            | **011:** status 401, `error` and `message` are strings, no `token`. **012:** both logins return 401, `unknown.error` is a string and equals `known.error`, no `token` on the unknown-email response. It does not check `message`. Each run sends two wrong-password logins as `AUTHOR` (one in 011, one in 012). **014:** `guestApi` GET `/api/auth/me` returns 401 and the body has no `user`. Every test starts with `runIfEnv(test, ['dev'])`. |
| `tests/support/api.ts`                             | `guestApi`, `freshApi`, `newApi`, `login()`                                           | Each context starts with no cookies. `extraHTTPHeaders` is empty unless a bearer is passed. `newApi({ bearer: '' })` would send the header `Bearer ` with nothing after it. `login()` posts `{email, password}` to `/api/auth/login`.                                                                                                                                                                                                             |
| `evidence/week3-task05-note.md` (tag `week6-end`)  | Batch 1 run                                                                           | Owner approved the run. Ran 2026-10-28 22:05:54–22:05:58 UTC (2026-10-29 local): 6 passed, exit 0. TC-API-011, 012 and 014 passed. Its Limits note says the 014 401 is not in the contract (Q4).                                                                                                                                                                                                                                                  |
| `evidence/week3-checks.md` (tag `week6-end`)       | Identities and separation; Open issues                                                | TC-UI-015 run at 20:27 UTC passed. A guest browser context got 401 from `/me`. After the author's cookies were cleared, author `/me` gave 401. Open issues include Q11 (logout revocation untested) and Q4 (`/me` 401 not in contract).                                                                                                                                                                                                           |

I opened every listed source. The rule files I used are the ones loaded into this session: 01, 10, 20, 30, 40, 45 and 50.

### 2. Risks (most serious first)

1. **Auth bypass on `/me`.** `/me` answers 200 to a request with no credentials or an empty `Bearer` value. That exposes the "current user" endpoint to anyone.
2. **A rejected login still hands out a credential.** A 401 login could still return a `token` or a `Set-Cookie` session. The tests check that no `token` field is returned, but no source says whether a cookie may be set.
3. **Account enumeration.** If a wrong password and an unknown email differ in `error`, `message` or status, an attacker can tell which emails have accounts. 012 compares only `error`.
4. **Empty token mishandled.** An empty bearer could be treated as valid or cause a 500 instead of a 401. 014 does not cover this; the current suite has no case for it.
5. **Shared `AUTHOR` account locked.** Every run sends two wrong-password logins as `AUTHOR`. If a lockout or rate limit exists, this could block every signed-in test for every student. No source says whether one exists.
6. **A 401 for the wrong reason.** A test could pass because the context accidentally sent nothing, or the route is wrong. TC-API-014's `guestApi` is constructed to send nothing; an empty-bearer case must confirm the header really reaches the server and is not stripped.
7. **Error body shape drifts.** The contract documents `{error, message}` for the login 401. The `/me` 401 body is not documented, and two error shapes have been seen live (Q12).

### 3. Techniques

**Used:**

- **Input groups:** the AC names three credential groups (wrong password for a real account, unknown email, missing token), so I want one representative case per group.
- **Boundaries:** an empty `Bearer` value sits on the edge between "no token" and "some token", which is where parsing bugs tend to sit.
- **Authorization:** each case checks that a protected answer (a token, or the user record) is refused without valid credentials.
- **Validation (response shape):** the contract documents the login 401 shape, so the rejection must have that shape, not just the status.
- **Integrity:** a rejected request must not leak a credential or a user record (no `token`, no `user`).

**Not used:**

- **States:** logout revocation (Q11) and "a context that just failed to log in" are question-only by the input.
- **Async behavior:** no delay or ordering is involved in these requests.
- **Idempotency:** repeated failed logins only matter for lockout, which no source defines. It is a question only.
- **Timing comparison** (a form of enumeration): no source asks for it, and measuring it would mean many extra wrong-password logins on the shared account.

### 4. Cases

| Status  | ID / label | Behavior                                                                                                    | Technique                                          | Expected                                                                                                                                                                 | Source (path#section)                                                                                                                                                            | In catalog | Implemented test (spec:title)                                                                                 | Last run (evidence path, date)                                                                                                                                                                                                                                      |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Covered | TC-API-011 | Login as `AUTHOR` with a wrong password is rejected                                                         | input groups; authorization; validation; integrity | 401; `error` and `message` are strings; no `token`                                                                                                                       | `vault/sources/jira/SCRUM-15.md#Facts` (AC2); `test-design/contract/openapi-dev-2026-10-30.json#/api/auth/login` (401); `vault/sources/test-catalog/blog-api.md#Auth — SCRUM-15` | yes        | `tests/blog/api/auth.spec.ts:TC-API-011 a wrong password is rejected with an error and no token`              | `evidence/week3-task05-note.md in tag week6-end#Batch 1 run`: passed, 2026-10-28 22:05 UTC (2026-10-29 local)                                                                                                                                                       |
| Covered | TC-API-012 | Login with an unknown `qa-auto-` email is rejected the same way as a wrong password                         | input groups; authorization; integrity             | 401 with the same `error` as TC-API-011                                                                                                                                  | `SCRUM-15.md#Facts` (AC2); contract `/api/auth/login` (401); `blog-api.md#Auth — SCRUM-15`                                                                                       | yes        | `tests/blog/api/auth.spec.ts:TC-API-012 an unknown email is rejected with the same error as a wrong password` | `evidence/week3-task05-note.md in tag week6-end#Batch 1 run`: passed, 2026-10-28 22:05 UTC. Does not check `message` (questions 2 and 3).                                                                                                                           |
| Covered | TC-API-014 | `GET /api/auth/me` with no `Authorization` header and no cookie is rejected                                 | input groups; authorization; integrity             | 401 (requirement, not in contract, Q4)                                                                                                                                   | `SCRUM-15.md#Facts` (AC2); contract `/api/auth/me` (bearerAuth, 200 only); `blog-api.md#Auth — SCRUM-15`                                                                         | yes        | `tests/blog/api/auth.spec.ts:TC-API-014 /me without a token or cookie is rejected with 401`                   | `evidence/week3-task05-note.md in tag week6-end#Batch 1 run`: passed, 2026-10-28 22:05 UTC. A guest `/me` 401 was also seen in `evidence/week3-checks.md in tag week6-end#Identities and separation` (TC-UI-015, 2026-10-29); that run belongs to a different case. |
| New     | NEW-1      | `GET /api/auth/me` with an `Authorization` header whose `Bearer` value is empty, and no cookie, is rejected | boundaries; authorization; integrity               | OPEN. Expected 401 is the owner's working assumption (2026-10-31, pending the mentor). It is not stated by the requirement or the contract. Also: no `user` in the body. | `test-design/inputs/SCRUM-15-AC2.md#Scope of "missing token"`; contract `/api/auth/me` (security `bearerAuth`)                                                                   | no         | none                                                                                                          | no run record found                                                                                                                                                                                                                                                 |

There are no Gap rows. Each behavior the AC requires has a case whose test checks the case's Expected value. The contract's 401 properties are not marked `required`, so unchecked fields are questions, not Gaps (rule 45, 2026-10-31).

Implementation note for NEW-1, not a requirement: `newApi({ bearer: '' })` would send the header value `Bearer ` with nothing after it. A Playwright `APIRequestContext` might trim or drop that header, so the case should confirm the header is actually sent. The test would be read-only, run on dev only, and make no login.

### 5. OPEN QUESTIONS

1. **NEW-1 expected result.** Is 401 the required answer for an empty `Bearer` value? The contract documents only 200 for `/me`. The 401 is the owner's assumption pending the mentor, and stays OPEN until confirmed.
2. **Q12, error body shape.** The contract documents the login 401 as `{error, message}`. The live sample also saw `{statusCode, code, error, message}` for validation errors. Which shape should the 401 assertions expect? The `/me` 401 body has no documented shape at all.
3. **Enumeration scope.** Should TC-API-012 also require the same `message` as a wrong password, not just the same `error`? The contract lists `message` but does not mark it `required`, and the requirement says only "401".
4. **Q4, error codes.** `invalid_credentials` (login) and `unauthorized` (`/me`) were seen live but are not documented. Should any test assert the exact code?
5. **Rejected login and cookies.** May a 401 login response carry a `Set-Cookie`? Does a context that just failed to log in hold any session afterwards? No source says. Per the input this is a question only, with no row.
6. **Lockout or rate limit.** Do repeated wrong-password logins on the shared `AUTHOR` account trigger one? Each suite run sends two. No source says. If a limit exists, 011 and 012 put every signed-in test at risk.
7. **Other "missing token" variants.** A malformed, expired or foreign token, or a token used after logout (Q11): are any of these in AC2's scope? Per the input these are questions only. The database map shows no token table, so revocation cannot be checked there.
8. **Outdated baseline map (source conflict).** The `baseline-map.md` auth row lists "missing implementation" as a blocker, but its Implementation and Result cells name the spec and a 2026-10-29 pass. Its Totals line ("Covered 4, New 33") also predates the Batch runs. Should the map be refreshed? That is a separate, approved catalog step.
9. **Outdated requirement note.** `vault/sources/jira/SCRUM-15.md` Comparison still says the API contract is "missing", but it was read on 2026-10-28 (catalog Sources). Should the note be updated or annotated?
10. **Run timestamp convention.** The catalog says "passed 2026-10-29". The evidence records 2026-10-28 22:05 UTC, which was 2026-10-29 local time. Which date convention should run citations use?
11. **Unconfirmed run–code match.** No source shows whether `auth.spec.ts` changed after Batch 1. I could not check git, so the Batch 1 pass is cited as a record of that run's code, not proof the current file passes.

### 6. Not done

- I did not verify the contract snapshot's SHA-256 myself, because I have no shell. I relied on the input's statement that it matches the catalog's 2026-10-28 SHA.
- No Jira read, as the input says.
- No rows for the question-only topics: rejected-login session, malformed, expired or foreign tokens, and logout revocation (input scope).
- No rows for login with missing fields, an email in different letter case, or timing-based enumeration. They are outside AC2's wording, and no source states an expected result for them.
- AC1, AC3 and AC4 (TC-API-010, 013, 015) are out of scope. I read the spec file only for the three AC2 tests.
- I saved nothing and allocated no `TC-` number. NEW-1 keeps its temporary label until an approved catalog save (rules 45 and 50).

## 2. Review decision (2026-10-31)

### Trace: AC2 to expected results

| AC2 clause                          | Case       | Expected                                    | Source of the expected result                                |
| ----------------------------------- | ---------- | ------------------------------------------- | ------------------------------------------------------------ |
| wrong password                      | TC-API-011 | 401; `error`, `message` strings; no `token` | catalog Expected; contract login 401 (fields not `required`) |
| unknown email                       | TC-API-012 | 401, same `error` as 011                    | catalog Expected; requirement                                |
| missing token: no header, no cookie | TC-API-014 | 401                                         | requirement only; contract documents 200 (Q4)                |
| missing token: empty `Bearer` value | NEW-1      | 401, OPEN                                   | owner's working assumption, pending the mentor               |

### Citations checked by the main conversation

- Catalog rows, spec titles (`auth.spec.ts:27`, `:38`, `:75`), assertions and the Batch 1 record (2026-10-28 22:05:54–58 UTC, 6 passed) match the proposal.
- Question 11 answered in part: `tests/blog/api/auth.spec.ts` is unchanged since `5ba5529`. `tests/support/api.ts` changed in `81b630f` (Task 06) after Batch 1; the diff touches no line of `newApi`, `guestApi`, `freshApi` or `login()`. No later recorded run covers `api/auth.spec.ts` (the Task 06 run was 11 browser tests). The current code of 011, 012 and 014 is not run.
- Question 6 corrected: a full suite run sends 3 wrong-password `AUTHOR` logins: 011, 012 and TC-UI-011 (`tests/blog/auth.spec.ts:24`).
- The catalog's "Covered — passed 2026-10-29" is a catalog claim; the run record above is the evidence.

### Decisions

| Item                                            | Decision         | Reason                                                                                                                                                                                             |
| ----------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-API-011, 012, 014 Covered                    | keep             | each test asserts its row's Expected; Batch 1 record                                                                                                                                               |
| NEW-1 empty `Bearer`                            | keep, changed    | P1 (auth). In the catalog it enters as Gap (missing source), not New: the catalog's New needs sufficient sources. Its test must show the empty header reached the server, or it repeats TC-API-014 |
| `/me` after a failed login                      | reject as a row  | outside the chosen scope; question 5                                                                                                                                                               |
| `message` equality in 012 as a Gap              | reject           | catalog asks for the same `error`; `message` not `required`; question 3                                                                                                                            |
| Malformed, expired, foreign token; logout       | reject as rows   | outside AC2's wording; question 7                                                                                                                                                                  |
| Coverage run's "Gap" label for the empty bearer | reject the label | a Gap needs a stated requirement or a documented contract detail                                                                                                                                   |

### Blog coverage map, row "Authentication success and rejection"

| Map cell                                            | Decision                                   | Reason                                              |
| --------------------------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| Case IDs TC-API-010 to 015 (includes 011, 012, 014) | keep                                       | only these catalog rows cite S15 AC2                |
| Blocker "missing source: `/me` 401 not in OAS (Q4)" | keep                                       | snapshot documents 200 only                         |
| Blocker "missing implementation"                    | change in a separate approved catalog save | same row names the spec and the Batch 1 pass        |
| Implementation "UI none"                            | change in the same save                    | same row lists TC-UI-010, 011, 014 passed (Batch 5) |
| Totals "Covered 4, New 33"                          | change in the same save                    | predates the Task 05 and 06 runs                    |
| Empty `Bearer` value                                | add as missing source in the same save     | owner scope (b); expected not documented            |

### Accepted missing behavior mapped to the API implementation plan

The plan is "Case to test" in `evidence/week3-task05-note.md` (tag `week6-end`).

| Behavior                        | Spec file                     | Batch group               | Dev records | Requests                       | Before writing                                                            | Before running                |
| ------------------------------- | ----------------------------- | ------------------------- | ----------- | ------------------------------ | ------------------------------------------------------------------------- | ----------------------------- |
| Empty `Bearer` on `/me` (NEW-1) | `tests/blog/api/auth.spec.ts` | Batch 1 group (read-only) | none        | 1 `GET /api/auth/me`, no login | approved catalog save with a `TC-API-` ID (rule 50); title starts with it | owner approval of the dev run |

### Open for the mentor

1. Does "missing token on /me" include an empty `Bearer` value, and is the answer 401?
2. Must a rejected login leave no session (no session `Set-Cookie`, `/me` still 401)?
3. Must the unknown-email 401 match the wrong-password 401 in `message` and keys, or only in `error`?
4. Is there a lockout or rate limit on `AUTHOR` (3 wrong-password logins per full run)?
5. Q4: `/me` 401 not in the contract; codes `invalid_credentials`, `unauthorized` undocumented.
6. Q12: which error body shape to assert.
7. Q11: is a token rejected after logout?

Open in the repo: the outdated `SCRUM-15.md` Comparison; the map row's internal conflicts; the date convention (UTC or local) for run citations.
