---
id: tests-db-db-integrity
type: test-note
---

# db-integrity.spec.ts

<!-- generated:start -->
- **Source:** [tests/db/db-integrity.spec.ts](../../../tests/db/db-integrity.spec.ts)
- **SHA-256 (LF-normalised):** `a651ab2de2b7a6e3f70b1e2b38a3d10de7cd794be5c5f098d71228847a052960`
- **Parser:** typescript — ok
- **Titles:**
  - `blog database integrity (dev only)`
    - `TC-DB-001 the database holds the 12 approved tables and today's blog counts are recorded`
    - `TC-DB-002 blog articles and comments point only to existing authors, categories and articles`
    - `article status is limited to draft or published by a database check constraint`
- **Page Object imports:** none
- **Block SHA-256:** `dfb17c72f6eaf89e6f7f31b36299f6a62e4f4466937d4b870375f3357f43f36b`
<!-- generated:end -->

## About this test

Optional, read-only checks of the shared dev database (Week 3 Task 09). They run only with
`QA_DB=1`; otherwise each test is skipped with a named reason. Access, fences and limits:
[rule 40](../../../.claude/rules/40-db-postgres.md), "Optional test layer".

- `TC-DB-001`: the table list must equal the approved list (fixed). Blog counts are drift and are
  recorded as annotations with the starting value, today's value and the date; never compared exactly.
- `TC-DB-002`: the three blog links have 0 orphan rows (fixed). A NULL `category_id` is not an orphan.
- Status constraint (guided practice, no catalog ID yet): the database owns "status is `draft` or
  `published`" through a CHECK constraint; who may publish is application logic.

Expected values: [database catalog](../../sources/test-catalog/db.md) and the
[starting data](../../sources/database/starting-data.md) block, read at runtime.

Last verified result: 2026-10-31 21:45 UTC on the dev database, approved: 3 executed, 3 passed, 0
failed, 0 skipped; all six blog counts equal their starting values. The empty-credential check
skipped all 3 with "STUDENT_DATABASE_URL is set but empty". Read-only enforcement is not verified
(no disposable database). Details: Week 3 checks (`evidence/week3-checks.md`, tag `week6-end`) and the
Task 09 note (`evidence/week3-task09-note.md`, tag `week6-end`).
