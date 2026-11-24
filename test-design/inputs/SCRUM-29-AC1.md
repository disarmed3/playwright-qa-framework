# Input — SCRUM-29 AC1: product detail and add-to-cart (UI)

Prepared 2026-10-31 (Week 3 Task 08B) for `/design-tests`. Sources were found through
[vault/\_map.md](../../vault/_map.md) (Sources). Key resolution reuses Task 03: course keys match, no
key map; `SCRUM-29` and its subtasks were read in Jira on 2026-10-31. No fresh Jira read is needed for
this input. Do not call Jira.

## Acceptance criterion (exact, from the requirement note)

SCRUM-29 has no separate acceptance-criteria field. AC1 is the task's description and its cases, as
returned:

> TC-SUI-010..013. Answer-key ref: tests/store-ui/\*, ProductPage.

> TC-SUI-010 — renders image, title, price, description, variant-select, qty-input, add-to-cart

> TC-SUI-012 — add to cart -> cart reflects the item (nav cart count / cart page)

## Run rules for this input (Task 08B)

- Label prefix **A**: New rows are `A-1`, `A-2`, …, never `NEW-n` and never a `TC-` number.
- Covered cites only IDs in `vault/sources/test-catalog/` whose test asserts the row's Expected. The
  Jira case IDs above are source IDs, not catalog IDs: a Jira case with no implemented test is a Gap
  row that names it.
- Other designers run at the same time on SCRUM-33 and SCRUM-37. Read only the paths listed below; do
  not open or search any other `test-design/inputs/` file or any `test-design/SCRUM-*/` folder, and do
  not use another key's proposals.

## Sources to read

| Path                                               | Sections                                                                                                | Why                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `vault/sources/jira/SCRUM-29.md`                   | Facts; Comparison; Questions                                                                            | requirement and its open questions         |
| `evidence/week3-task08b-note.md` (tag `week6-end`) | Facts: Jira reads (2026-10-31)                                                                          | how the issues were read; key resolution   |
| `test-design/contract/openapi-dev-2026-10-30.json` | `paths` → `/shop/{slug}` (`get`), `/cart/add` (`post`), `/cart` (`get`), `/api/products/{slug}` (`get`) | current contract (see below)               |
| `vault/sources/database/starting-data.md`          | Mentor's text; Mentor's answers (2026-10-30); Seed facts                                                | products, slugs, prices, sold-out variants |
| `vault/wiki/01-framework/db-map.md`                | Store catalogue → `products`, `product_variants`; Cart and checkout → `carts`, `cart_items`             | columns and constraints (metadata only)    |
| `vault/sources/test-catalog/`                      | Grep for `TC-SUI-` and `TC-SAPI-`; `db.md` rows TC-SDB-001, 002, 003                                    | catalog IDs that could be Covered          |
| `tests/` and `pages/`                              | Grep for `TC-SUI-010`, `TC-SUI-012`, `ProductPage`                                                      | implemented tests and Page Objects, if any |

Contract snapshot: dev `https://dev.ai-orchestration-courses.com/api/docs/json` (base address from
`env/target.ts`), read 2026-10-30 21:23 UTC, HTTP 200, 16,335 bytes, SHA-256
`8f2ef6955633222799ab685067bd0c44d32066a6ce8ee4298ce6ddc680c83350`. Local and untracked; it holds
example login values that must not be copied.

## Known unknowns for this criterion

Carried from the sources above; add any others you find, and keep them as questions.

- The description names TC-SUI-010..013; only 010 and 012 exist in Jira and the seed.
- "variants, stock" is in the task summary, but no case covers a sold-out variant on the product page.
- The UI routes document only `200`; element names, test IDs and the cart count are not in any source.
- No store Page Object and no store spec exist in this repo.
- TC-SUI-012 is `env-dev` and adds to a cart (dev data, rule 20); TC-SUI-010 is `env-dev-prod`.

Out of scope: the catalog grid (`SCRUM-28`), cart and coupon math (`SCRUM-30`, `SCRUM-34`, `SCRUM-35`),
checkout (`SCRUM-31`, `SCRUM-36`), SCRUM-33, SCRUM-37 and every other issue; any catalog change.
