---
paths:
  - 'tests/**/*.spec.ts'
  - 'vault/sources/test-catalog/**'
---

# API tests and the case catalog

Rule numbers only order the files; nothing resolves them.

## Contract first

- Do: take paths, parameters, request fields and documented responses from the dev OpenAPI
  (`/api/docs/json`, base address from `env/target.ts`). Record its read date and SHA-256 in the
  catalog. Never invent an endpoint, field or status.
- Do: where the contract does not document a status or shape, take it from the requirement, mark it
  "requirement, not in contract" and keep the OPEN QUESTION visible until answered.
- Do not: copy the contract's example login values anywhere; accounts come from `tests/support/`.

## Assertions

- Do: assert status, shape (field presence and type) and meaning (values that prove the behavior,
  e.g. the token's user is AUTHOR). Status alone is never enough.
- A valid 204 need not have a body; assert its status and the follow-up state instead.
- Do: a known disclosure (e.g. TC-API-070) is never written as an expected pass because it is
  observed. Its expected result follows the requirement or stays OPEN.
- Writes: dev only (`runIfEnv`), each inside `envGuard`, test-owned `qa-auto-<runId>-<testId>`
  records, cleanup in teardown (rules 01, 20). Never log tokens or cookies.

## Stable IDs and the catalog

- Format: `TC-<UPPERCASE FAMILY>-<digits>` with at most one optional lowercase suffix. Reuse a
  compatible family (`TC-API`, `TC-UI`). Lesson examples (e.g. TC-API-123) are format only.
- An existing ID keeps its meaning, source links and number. New IDs are allocated once, at an
  approved save, and never reused. Range shorthand (`TC-API-010..015`) is a reference, not an ID.
- Catalog tables: the ID as plain text or bold (no backticks) in the first column, then the
  description. Each ID is defined in exactly one row across `vault/sources/test-catalog/`.
- An incompatible older ID is flagged, never renumbered; no configuration translates it.

## Test titles for mapped tests

- Each individual mapped test title starts with its exact case ID, then the behavior in readable
  words: `test('TC-API-010 login returns a token and the full user record', …)`.
- A describe title, comment or separate mapping note alone does not link a result to the case.
- One test per case; do not split one assertion into several tests.
- Limitation: the five early smoke tests keep their titles (rule 30); they stay unlinked until a
  separately approved rename.

## Verify

- Review each `expect` against the catalog row's Expected column.
- After a catalog save, check that every ID is defined once and every row has the catalog format, then
  run `npm run format:check` and `npm run vault:validate`; record the result in the pull request.
