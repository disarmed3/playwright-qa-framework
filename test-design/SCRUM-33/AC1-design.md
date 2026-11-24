# SCRUM-33 AC1 — test design proposal (reviewed, run t08b-20261031-r1)

- Input: `test-design/inputs/SCRUM-33-AC1.md`, SHA-256 `045dec87003085707289ab4ad60e15f01cb6efc4c26256e7bec050ee31420ec5` (unchanged since the launch)
- Contract: `test-design/contract/openapi-dev-2026-10-30.json`, SHA-256 `8f2ef6955633222799ab685067bd0c44d32066a6ce8ee4298ce6ddc680c83350` (untracked, local)
- Proposal: `test-designer`, run `t08b-20261031-r1`, label prefix B, launched 2026-10-31 in one message with SCRUM-29 (A) and SCRUM-37 (C). Fleet log (UTC): `SubagentStart` 20:15:21.873, `SubagentStop` 20:16:55.913.
- Text source: the designer's hand-back as received in the main conversation, with the two-space line indent the harness adds removed. The run's task output file was empty (0 bytes), so there is no second copy to compare with.
- Review: owner and main conversation, 2026-10-31. The keep/change/reject decisions are recorded in the Task 08B digest (`test-design/fleet/digest.md`), not here. Nothing here allocates an ID, changes the catalog or records a run. The designer proposed no `B-n` rows.

## 1. Original proposal (run t08b-20261031-r1, label B, text unchanged; Prettier aligned table spacing and added blank lines)

Run t08b-20261031-r1 · SCRUM-33 · AC1 (products API: listing, filter, sort, paginate, detail). Design mode, label prefix B.

I made no Jira call and wrote nothing. Every row below is a Gap. No catalog ID can be cited as Covered, and I found no behavior in the criterion's wording that lacks a Jira source case, so there are no B-n rows.

## 1. Sources read

- `test-design\inputs\SCRUM-33-AC1.md` · whole file · the exact criterion (description plus TC-SAPI-001..010), the run rules, the known unknowns and what is out of scope.
- `vault\sources\jira\SCRUM-33.md`
  - Facts: SCRUM-57..66, all labelled `api`, `automated`, `env-dev-prod`, `store`, none with a description.
  - Comparison: the repo has no `tests/store-products/`. The Conflict: `pageSize=51` is "clamped" in Jira but has `maximum: 50` in the contract.
  - Questions 1-4.
- `evidence\week3-task08b-note.md` · Facts: Jira reads (2026-10-31) · 24 read-only calls; SCRUM-33 and its subtasks match the seed; course keys used directly with no key map; no blockers.
- `test-design\contract\openapi-dev-2026-10-30.json` · `paths./api/products.get`, `paths./api/products/{slug}.get`
  - `page`: integer, minimum 1, default 1.
  - `pageSize`: integer, minimum 1, maximum 50, default 12.
  - `search`: string.
  - `category` enum: apparel, drinkware, stickers, accessories.
  - `sort` enum: newest, price_asc, price_desc, name.
  - `min_price` and `max_price`: integer, "cents".
  - `in_stock`: boolean.
  - `delay`: integer, "artificial delay in ms (capped)".
  - Every parameter has `required: false`.
  - Only `200` is documented for either path, with no response schema. `slug` is a required path string.
  - I did not recompute the SHA-256; I relied on the input's record of it. I did not copy any example login values.
- `vault\sources\database\starting-data.md` · Mentor's text; Mentor's answers (2026-10-30); Seed facts
  - 8 products. Prices in cents: tee 2500, hoodie 4500, mug 1200, stickers 600, cap 2000, tote 1500, bottle 1800, notebook 900. All 8 slugs are listed.
  - Hoodie XL and the bottle's only variant (`One Size`) have stock 0. Both products stay `active = true`.
  - Stock and row counts drift; prices and `active` are fixed.
- `vault\wiki\01-framework\db-map.md` · Store catalogue → `products`, `product_variants` (plus the note at line 203)
  - `products` columns: slug UNIQUE, name, description, category (CHECK: same four values as the enum), price_cents >= 0, active (default true), created_at.
  - Variants: UNIQUE (product_id, label), stock >= 0.
  - Line 203: `products.category` is unrelated to the blog's categories.
- `vault\sources\test-catalog\` · grep for `TC-SAPI-` and `TC-SDB-00[123]`
  - No `TC-SAPI-` row exists.
  - `db.md` TC-SDB-001 (store counts), 002 (prices, sold-out stock, active, coupons) and 003 (orphans) are database checks run by `scripts/seed-integrity.sh`.
- `tests\` · grep for `TC-SAPI-0` and `/api/products` · no matches, so there is no implemented test.

## 2. Risks (most serious first)

1. **No API test at all.** None of the 10 Jira cases is in the catalog or implemented, so a broken listing or detail endpoint goes unnoticed.
2. **The contract gives almost nothing to assert.** Only `200` is documented and there is no response schema. The envelope fields, the error statuses (400, "rejected", 404) and the `not_found` body all come from Jira alone.
3. **pageSize=51 conflict.** Jira says the value is clamped to 50; the contract's `maximum: 50` suggests it is rejected. A test built on either source could be wrong.
4. **"Active only" cannot be shown with the seed data.** All 8 products are active, so the assertion passes even if the filter is missing.
5. **Count assertions may break on shared data.** Jira's fixed `total=8`, the in-stock count and variant stock are drift values in shared data, so exact counts are likely to fail falsely.
6. **Range boundaries are unstated.** Seed prices sit exactly on 1500 (tote) and 2500 (tee). Whether the range includes its ends decides whether the expected count is 4 or 2.
7. **Sort results for `name` and `newest` are unknown.** Product names and `created_at` are not in any source I read, so their expected first item cannot be written.
8. **Environment conflict.** Jira labels the cases `env-dev-prod`; rule 01 requires every spec to be dev-only (`runIfEnv(test, ['dev'])`). The `delay` case would also add load on prod.
9. **Delay timing.** The `delay` cap is unknown, and a timing assertion can be flaky on a shared server.

## 3. Techniques

Used:

- **Input groups (equivalence classes):** each filter (search, category, in_stock, price range) splits the 8 known products into a "match" group and a "no match" group.
- **Boundaries:** `min_price`/`max_price` fall exactly on seed prices (1500, 2500), and `pageSize` 50/51 and `page` 0/1 sit on the contract's minimum and maximum.
- **Validation:** Jira states rejections for a bad category, `page=0` and an unknown slug, and the out-of-range `pageSize` needs its handling pinned down.
- **Integrity:** envelope consistency (`total` vs `items`, `totalPages` vs `total`/`pageSize`), page slices with no overlap, sort order, and API values matching the seed prices and slugs.
- **Async behavior:** `delay` should add latency without changing the data, and has a cap.
- **Idempotency (read form):** the same query with and without `delay` must return identical data, as TC-SAPI-008 states.

Not used:

- **Authorization:** both endpoints are public, with no `security` in the contract.
- **States:** these are read-only GETs with no state change in this criterion.
- **Write-side idempotency:** nothing in this criterion writes, so no envGuard write is needed.

## 4. Cases

The same three cells apply to every row:

- **In catalog:** no (no `TC-SAPI-` row).
- **Implemented test:** none (no match in `tests/`).
- **Last run:** no run record found.

Every row is also a Gap of the same kind: a Jira case with no catalog row and no test, so its whole Expected is the missing assertion. The table omits those cells.

| ID / label                | Behavior                               | Technique                   | Expected                                                                                                                                                                                                                                   | Source                                                           |
| ------------------------- | -------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| TC-SAPI-001 (SCRUM-57)    | GET /api/products with no params       | integrity                   | 200; body has `items`, `page`, `pageSize`, `total`, `totalPages`; `page` = 1 (contract default); `pageSize` = 12; `total` = 8 (Jira; drift, see Q5); `items` has 8 entries; `totalPages` value OPEN (1 if it is ceil(8/12); not stated)    | vault/sources/jira/SCRUM-33.md#Facts; contract#/api/products     |
| TC-SAPI-001 (SCRUM-57)    | listing returns active products only   | input groups                | every item active; with the seed, all 8 slugs appear. A negative check is OPEN: no inactive product exists (Q4)                                                                                                                            | SCRUM-33.md#Facts; starting-data.md#Mentor's answers             |
| TC-SAPI-002 (SCRUM-58)    | ?search=hoodie                         | input groups                | 200; exactly 1 item; slug `bounded-behavior-hoodie` (only the hoodie matches by short name; descriptions not read, see Q7)                                                                                                                 | SCRUM-33.md#Facts; starting-data.md#Mentor's answers             |
| TC-SAPI-003 (SCRUM-58→59) | ?category=apparel                      | input groups                | 200; every item has category `apparel`; count OPEN (no per-product category in the sources)                                                                                                                                                | SCRUM-33.md#Facts; contract#/api/products (enum)                 |
| TC-SAPI-003 (SCRUM-59)    | bad category value (outside the enum)  | validation                  | 400 (Jira); error body OPEN (none documented)                                                                                                                                                                                              | SCRUM-33.md#Facts                                                |
| TC-SAPI-004 (SCRUM-60)    | ?sort=price_asc / price_desc           | integrity                   | 200 for both. price_asc: first item `sticker-pack-vol-1` (600). price_desc: first item `bounded-behavior-hoodie` (4500). All 8 prices are distinct, so there are no ties. Prices come from the seed; the first items are derived from them | SCRUM-33.md#Facts; starting-data.md#Seed facts                   |
| TC-SAPI-004 (SCRUM-60)    | ?sort=name / newest                    | integrity                   | 200; expected first item OPEN (names and `created_at` not in the sources)                                                                                                                                                                  | SCRUM-33.md#Facts; db-map.md#products                            |
| TC-SAPI-005 (SCRUM-61)    | ?min_price=1500&max_price=2500         | boundaries                  | 200; every `price_cents` within range. If the ends are included: tee 2500, cap 2000, bottle 1800, tote 1500 (4 items); if excluded: cap and bottle (2). Inclusivity OPEN                                                                   | SCRUM-33.md#Facts; contract (cents); starting-data.md#Seed facts |
| TC-SAPI-006 (SCRUM-62)    | ?in_stock=true                         | input groups                | 200; `flaky-free-water-bottle` absent. Whether the hoodie is present (only XL sold out) is OPEN; the count drifts with stock                                                                                                               | SCRUM-33.md#Facts; starting-data.md#Mentor's answers             |
| TC-SAPI-007 (SCRUM-63)    | ?page=2&pageSize=3                     | boundaries, integrity       | 200; `page` 2, `pageSize` 3, 3 items, which are items 4-6 of the same unpaged order with no overlap with page 1. `totalPages` OPEN (3 if it is ceil(8/3))                                                                                  | SCRUM-33.md#Facts                                                |
| TC-SAPI-007 (SCRUM-63)    | pageSize=51                            | boundaries, validation      | OPEN: Jira says clamped to 50, the contract says `maximum: 50` (Conflict, Q1)                                                                                                                                                              | SCRUM-33.md#Comparison; contract                                 |
| TC-SAPI-007 (SCRUM-63)    | page=0                                 | boundaries, validation      | "rejected" (Jira; the contract says minimum 1). Status and body OPEN                                                                                                                                                                       | SCRUM-33.md#Facts; contract                                      |
| TC-SAPI-008 (SCRUM-64)    | ?delay=1500                            | async behavior, idempotency | 200; response time at least about 1500 ms; data identical to the same request without `delay`                                                                                                                                              | SCRUM-33.md#Facts; contract (delay)                              |
| TC-SAPI-008 (SCRUM-64)    | delay cap                              | boundaries, async behavior  | capped (Jira and contract); cap value and how it shows (clamped or rejected) OPEN                                                                                                                                                          | SCRUM-33.md#Facts; contract                                      |
| TC-SAPI-009 (SCRUM-65)    | GET /api/products/codemify-classic-tee | integrity                   | 200; product with slug `codemify-classic-tee`, price 2500 (seed, fixed); `variants[]` labels exactly S, M, L, XL, each with a `stock` value (stock > 0 expected, but it drifts). Product field names other than those in db-map are OPEN   | SCRUM-33.md#Facts; starting-data.md; db-map.md#product_variants  |
| TC-SAPI-010 (SCRUM-66)    | GET /api/products/does-not-exist       | validation                  | 404 with `not_found` (Jira); which field carries it is OPEN (no error schema)                                                                                                                                                              | SCRUM-33.md#Facts                                                |

Related but not Covered: TC-SDB-001 and TC-SDB-002 (`vault/sources/test-catalog/db.md`) check the same seed facts (prices, sold-out variants, `active`, counts) in the database through `scripts/seed-integrity.sh`. They assert nothing about the API, but they could be a precondition check.

## 5. OPEN QUESTIONS

1. **pageSize=51:** clamped to 50 (Jira) or rejected (contract `maximum: 50`)? If rejected, which status and body?
2. **Error responses:** status and body for a bad category, `page=0` and an unknown slug. Only `200` is documented. Is "rejected" for `page=0` a 400? In which field does `not_found` appear (for example `error`)?
3. **Envelope:** the contract has no response schema. Confirm the field names `items`/`page`/`pageSize`/`total`/`totalPages`, the rule for `totalPages`, and the field names of the product and its variants.
4. **"Active only":** every seed product is active, so how should this be proven? Is an inactive fixture product planned, or is this assertion accepted as vacuous for now?
5. **Shared data:** Jira's `total=8` is a fixed number, but the starting-data note classes row counts as drift. Should a difference fail the test or be recorded as drift? The same applies to the in-stock count and the tee's variant stock.
6. **Price range:** are `min_price` and `max_price` inclusive? What happens when `min_price` > `max_price`, or with negative or non-integer values? (These are outside the wording, so they are questions only.)
7. **Search:** does "hoodie" appear in any other product's description? Descriptions are not in the sources. Is the search case-insensitive?
8. **Sort:** what are the expected first items for `name` and `newest`, given that product names and `created_at` are not in the sources? What is the default order when `sort` is absent? Is a bad `sort` value rejected? (Outside the wording.)
9. **Category per product:** which seed products are `apparel`, giving the expected count for TC-SAPI-003? Should the other three enum values also be tested? (They are documented, but the parameter is not required.)
10. **in_stock:** does it keep a product with only some variants sold out (the hoodie)? What does `in_stock=false` do? (Outside the wording.)
11. **delay:** what is the cap value? Is an over-cap value clamped or rejected? What timing tolerance is acceptable on a shared server?
12. **Environment:** the Jira label is `env-dev-prod`, but rule 01 makes every spec dev-only. Should these read-only API tests stay dev-only? Is the `delay` case allowed on prod?
13. **page beyond totalPages** (for example `page=4&pageSize=3`): does it return empty items or an error? (Outside the wording.)
14. **Answer key:** the reference to `tests/store-products/*` points to the course's own suite, not this repo. Is that suite a source we may read?
15. **Contract SHA:** there are no `TC-SAPI-` catalog rows, so the contract SHA cannot be compared with a catalog SHA. When the IDs are added under rule 50, which snapshot should they record?

## 6. Not done

- **No Jira call** (the input said "Do not call Jira").
- **I did not open or search any other key's input or design.**
- **`evidence/` run records** beyond the Task 08B note are not listed in the input. Since no test exists, every row says "no run record found". If a test is added later, a run record would settle "Last run".
- **SHA-256 of the contract snapshot** not recomputed; I have no shell tool. The input's recorded value is taken as given.
- **Product names, descriptions, per-product categories and `created_at`** are in no listed source. A read-only API sample or an approved database read would settle Q7, Q8 and Q9, but that needs approval and is not mine to do.
- **The course answer key `tests/store-products/*`** is not in this repo and was not read.
- **Nothing saved.** I cannot write files; the main conversation saves after the owner's review.
