---
id: test-catalog-db
type: catalog
---

# Test catalog — Database (Week 3 Task 07)

Database cases for the shared course database (dev), saved 2026-10-30. A row defines a case; results
are in Week 3 checks (`evidence/week3-checks.md`, tag `week6-end`, section "database"). Rule:
[50 API tests and the case catalog](../../../.claude/rules/50-api-swagger.md); database access:
[rule 40](../../../.claude/rules/40-db-postgres.md). Expected values: [starting data](../database/starting-data.md).

## Sources

| Key  | Source                                                                                                            | Date                                  |
| ---- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| SEED | course backlog (Jira backlog seed, not published): IDs and summaries of SCRUM-19, 21, 41, 42–44, 105–106, 153–154 | snapshot 2026-09-16                   |
| M1   | Mentor's starting data, [starting data](../database/starting-data.md)                                             | dated 2026-10-15, received 2026-10-29 |
| M2   | Mentor's permission list for group `qa_student` ([rule 40](../../../.claude/rules/40-db-postgres.md))             | 2026-10-26                            |
| M3   | Mentor's answers: case definitions, drift rule, slugs, coupon terms, relationships                                | 2026-10-30 (two replies)              |

- The backlog IDs keep their numbers and meaning. Where the mentor's answers (M3) narrow a backlog
  summary, the row says so; the lesson and the issued group win over older ticket wording (M3).
- Evidence: every permission case is **grants-only evidence, not attempted**: privileges are
  inspected through metadata; no write, DDL, role change or denial probe is sent (M3, rule 40).
- Drift: stock and row counts change in normal use; a difference is recorded with the date, never
  reset. Every other difference is a data mismatch: the check fails, the expected value stays (M3).

## Seed and relationships

| ID             | Case                                    | Source       | Expected                                                                                                                                                                                                                            | Implementation                                                                                       |
| -------------- | --------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **TC-DB-001**  | Blog starting counts                    | SEED, M1, M3 | users 4, categories 4, articles 7 (6 published, 1 draft), comments 4; report starting count, today's count and date; a difference is drift. Narrowed: no reset, no extra facts (article 1 slug, article 7 author)                   | `scripts/seed-integrity.sh`; optional `tests/db/db-integrity.spec.ts` (`QA_DB=1`, passed 2026-10-31) |
| **TC-DB-002**  | Blog relationships have no orphan rows  | SEED, M3     | 0 orphans: article → author, article → category (non-NULL `category_id` only), comment → article                                                                                                                                    | `scripts/seed-integrity.sh`; optional `tests/db/db-integrity.spec.ts` (`QA_DB=1`, passed 2026-10-31) |
| **TC-SDB-001** | Store starting counts                   | SEED, M1     | products 8, product_variants 14, coupons 3; a difference is drift                                                                                                                                                                   | `scripts/seed-integrity.sh`                                                                          |
| **TC-SDB-002** | Store seed facts                        | SEED, M1, M3 | 8 prices by slug (fixed); hoodie XL and bottle `One Size` stock 0, bottle has 1 variant (drift); both products `active = true` (fixed); 3 coupons' kind, value, minimum, active, expiry (fixed); EXPIRED10 `expires_at` in the past | `scripts/seed-integrity.sh`                                                                          |
| **TC-SDB-003** | Store relationships have no orphan rows | SEED, M3     | 0 orphans, four links only: variant → product, cart item → variant, order item → order, payment → order                                                                                                                             | `scripts/seed-integrity.sh`                                                                          |

## Permissions (grants-only evidence, not attempted)

| ID             | Case                                                 | Source       | Expected                                                         | Implementation                    |
| -------------- | ---------------------------------------------------- | ------------ | ---------------------------------------------------------------- | --------------------------------- |
| **TC-DB-020**  | Blog content tables are fully usable                 | M2, M3       | SELECT, INSERT, UPDATE, DELETE on articles, categories, comments | `scripts/verify-student-fence.sh` |
| **TC-DB-021**  | Users can be read and added                          | M2, M3       | SELECT and INSERT on users                                       | `scripts/verify-student-fence.sh` |
| **TC-DB-022**  | Users cannot be changed                              | M2, M3       | UPDATE on users denied (table and every column)                  | `scripts/verify-student-fence.sh` |
| **TC-DB-023**  | Users cannot be deleted                              | M2, M3       | DELETE on users denied                                           | `scripts/verify-student-fence.sh` |
| **TC-DB-024**  | Tables cannot be dropped                             | M2, M3       | DROP TABLE denied: the login does not act as owner of any table  | `scripts/verify-student-fence.sh` |
| **TC-DB-025**  | Tables cannot be truncated                           | M2, M3       | TRUNCATE denied on all 12 tables                                 | `scripts/verify-student-fence.sh` |
| **TC-DB-026**  | Tables cannot be altered                             | M2, M3       | ALTER TABLE denied: not the owner (the guided extra check)       | `scripts/verify-student-fence.sh` |
| **TC-DB-027**  | Tables cannot be created                             | M2, M3       | CREATE TABLE denied: no CREATE on schema public                  | `scripts/verify-student-fence.sh` |
| **TC-DB-028**  | Roles cannot be created                              | M2, M3       | CREATE ROLE denied: no CREATEROLE, SUPERUSER or CREATEDB         | `scripts/verify-student-fence.sh` |
| **TC-SDB-020** | Store tables are fully usable                        | SEED, M2, M3 | SELECT, INSERT, UPDATE, DELETE on the 8 store tables             | `scripts/verify-student-fence.sh` |
| **TC-SDB-021** | Store tables cannot be dropped, altered or truncated | SEED, M2, M3 | DROP, ALTER (not owner) and TRUNCATE denied on the store tables  | `scripts/verify-student-fence.sh` |

Also checked by the fence script without a case ID (M2, M3): REFERENCES and TRIGGER false on all 12
tables, membership in `qa_student` only, no predefined `pg_*` role, no owned relation, schema or
database, sequences USAGE and SELECT without UPDATE, no CREATE on the database, TEMP allowed, no
replication or bypass-RLS attribute.

Out of scope (M3, rule 40): backlog cases that need a reset or a write (TC-DB-029, TC-DB-030,
TC-SDB-022, TC-SDB-010..014). The backlog's "12/12" counted an old server script and is not used.
