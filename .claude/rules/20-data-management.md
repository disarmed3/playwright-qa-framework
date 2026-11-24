---
paths:
  - 'tests/**/*.ts'
  - 'pages/**/*.ts'
  - 'scripts/**'
  - 'jira-seed/**'
---

# Test data

Applies to browser tests and Page Objects that read or create data, shared test data in
`tests/support/`, and setup tooling in `scripts/` and `jira-seed/`. Blog API and browser tests create their
own articles and comments through the contract's API (`tests/support/api.ts`, `ownedArticles`), named
`qa-auto-<runId>-<testId>` and deleted in fixture teardown; store tests use their own guest carts
(`tests/support/store.ts`). Every write also follows `.claude/rules/01-guardrails.md` (dev only, `envGuard`,
approval).

## Known data first

- Do: read existing dev content and assert only stable properties (e.g. "at least one category").
  Create records only when the requirement needs data the test controls.
- When: a test needs data to act on or assert against.
- Verify: review — every created record has a stated reason.

## Shared data is imported

- Do: import accounts and shared values from `tests/support/` (e.g. `AUTHOR` from `tests/support/users.ts`);
  never copy their values into a spec.
- When: a test needs an account or other value that exists in `tests/support/`.
- Verify: grep specs for email addresses and password-like string literals.

## Unique names for created records

- Do: name every created record `qa-auto-<runId>-<testId>`, where `runId` is set once per run and
  `testId` is `testInfo.testId`. This avoids collisions between parallel runs and tests.
- When: a test or setup step creates a record.
- Verify: review the name builder.
- ⚠️ Non-unique names collide only in parallel runs; a single local run hides the problem.

## Clean up your own records, even on failure

- Do: delete in fixture teardown or `afterEach`, by the exact ID or name the test recorded, inside `envGuard`.
- When: a test has created a record.
- Verify: review — cleanup does not sit after the assertions in the test body.
- ⚠️ Cleanup placed after assertions is skipped when the test fails; green runs look clean.

## Never delete what you did not create

- Do: never delete another test's or another person's records; no sweeps such as "delete all `qa-auto-*`".
- When: writing any delete, including cleanup.
- Verify: review each delete call.
- ⚠️ A prefix sweep deletes another run's records without failing anything in this run.

## Approved setup tooling only

- Do: use only setup scripts and APIs the project designates and records: `scripts/jira-seed.mjs` (Jira;
  `--dry-run` is offline, a real run needs approval) and the contract's own API through `tests/support/`.
  No separate app setup API exists.
- When: preparing data outside the test body (scripts, APIs, seed tools).
- Verify: review against this list.

## Database verification is read-only

- Do: use read-only queries only, preferably through a read-only account; never write. The route, approved
  reads and expected permissions are in `.claude/rules/40-db-postgres.md`. No read-only account is issued
  yet and the issued account can write, so the connector's restricted mode and the read-only transactions
  of `tests/support/db.ts` (rule 40's fences), not the account, keep the reads read-only.
- When: a test or check queries the database.
- Verify: review; no `insert`, `update`, `delete` or DDL statement in database code.
