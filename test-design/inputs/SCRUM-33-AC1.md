# Input — SCRUM-33 AC1: products API listing, filter, sort, paginate, detail

Prepared 2026-10-31 (Week 3 Task 08B) for `/design-tests`. Sources were found through
[vault/\_map.md](../../vault/_map.md) (Sources). Key resolution reuses Task 03: course keys match, no
key map; `SCRUM-33` and its subtasks were read in Jira on 2026-10-31. No fresh Jira read is needed for
this input. Do not call Jira.

## Acceptance criterion (exact, from the requirement note)

SCRUM-33 has no separate acceptance-criteria field. AC1 is the task's description and its cases, as
returned:

> TC-SAPI-001..010. Answer-key ref: tests/store-products/\*.

> TC-SAPI-001 — GET /api/products -> 200; envelope {items,page,pageSize,total,totalPages}; total=8; pageSize=12; active only

> TC-SAPI-002 — ?search=hoodie narrows by name/description (1 match)

> TC-SAPI-003 — ?category=apparel returns only apparel; enum validated (bad category -> 400)

> TC-SAPI-004 — ?sort=price_asc/price_desc/name/newest order correctly (assert first item)

> TC-SAPI-005 — ?min_price=1500&max_price=2500 filters by cents range

> TC-SAPI-006 — ?in_stock=true excludes the fully-out-of-stock product (water bottle absent)

> TC-SAPI-007 — pagination: ?page=2&pageSize=3 slices; pageSize=51 clamped to 50; page=0 rejected

> TC-SAPI-008 — ?delay=1500 adds latency, identical data, capped

> TC-SAPI-009 — GET /api/products/codemify-classic-tee -> 200; product + variants[] (S/M/L/XL with stock)

> TC-SAPI-010 — GET /api/products/does-not-exist -> 404 not_found

## Run rules for this input (Task 08B)

- Label prefix **B**: New rows are `B-1`, `B-2`, …, never `NEW-n` and never a `TC-` number.
- Covered cites only IDs in `vault/sources/test-catalog/` whose test asserts the row's Expected. The
  Jira case IDs above are source IDs, not catalog IDs: a Jira case with no implemented test is a Gap
  row that names it.
- Other designers run at the same time on SCRUM-29 and SCRUM-37. Read only the paths listed below; do
  not open or search any other `test-design/inputs/` file or any `test-design/SCRUM-*/` folder, and do
  not use another key's proposals.

## Sources to read

| Path                                               | Sections                                                                            | Why                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------- |
| `vault/sources/jira/SCRUM-33.md`                   | Facts; Comparison (incl. the Conflict); Questions                                   | requirement and its open questions       |
| `evidence/week3-task08b-note.md` (tag `week6-end`) | Facts: Jira reads (2026-10-31)                                                      | how the issues were read; key resolution |
| `test-design/contract/openapi-dev-2026-10-30.json` | `paths` → `/api/products` (`get`, all `parameters`), `/api/products/{slug}` (`get`) | current contract (see below)             |
| `vault/sources/database/starting-data.md`          | Mentor's text; Mentor's answers (2026-10-30); Seed facts                            | 8 products, slugs, prices, active, stock |
| `vault/wiki/01-framework/db-map.md`                | Store catalogue → `products`, `product_variants`                                    | columns and constraints (metadata only)  |
| `vault/sources/test-catalog/`                      | Grep for `TC-SAPI-`; `db.md` rows TC-SDB-001, 002, 003                              | catalog IDs that could be Covered        |
| `tests/`                                           | Grep for `TC-SAPI-0`, `/api/products`                                               | implemented tests, if any                |

Contract snapshot: dev `https://dev.ai-orchestration-courses.com/api/docs/json` (base address from
`env/target.ts`), read 2026-10-30 21:23 UTC, HTTP 200, 16,335 bytes, SHA-256
`8f2ef6955633222799ab685067bd0c44d32066a6ce8ee4298ce6ddc680c83350`. Local and untracked; it holds
example login values that must not be copied.

## Known unknowns for this criterion

Carried from the sources above; add any others you find, and keep them as questions.

- `pageSize=51`: Jira says clamped to 50; the contract declares `maximum: 50` (a source conflict).
- Only `200` is documented: the bad-category 400, the `page=0` rejection and `404 not_found` come from
  Jira alone; no error body is documented.
- The `delay` cap value is not stated.
- Stock and row counts drift in normal use (starting-data note); prices and `active` are fixed.
- All cases are `env-dev-prod` and read-only.

Out of scope: the catalog UI (`SCRUM-28`), product detail UI (SCRUM-29), cart (`SCRUM-34`), SCRUM-37
and every other issue; any catalog change.
