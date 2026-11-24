# SCRUM-29 AC1 — test design proposal (reviewed, run t08b-20261031-r1)

- Input: `test-design/inputs/SCRUM-29-AC1.md`, SHA-256 `f9723945d4025aa197888e05436890cc5dac45921035e806cc26a257242aafb3` (unchanged since the launch)
- Contract: `test-design/contract/openapi-dev-2026-10-30.json`, SHA-256 `8f2ef6955633222799ab685067bd0c44d32066a6ce8ee4298ce6ddc680c83350` (untracked, local)
- Proposal: `test-designer`, run `t08b-20261031-r1`, label prefix A, launched 2026-10-31 in one message with SCRUM-33 (B) and SCRUM-37 (C). Fleet log (UTC): `SubagentStart` 20:15:21.873, `SubagentStop` 20:16:52.209.
- Text source: the designer's hand-back as received in the main conversation, with the two-space line indent the harness adds removed. The run's task output file was empty (0 bytes), so there is no second copy to compare with.
- Review: owner and main conversation, 2026-10-31. The keep/change/reject decisions are recorded in the Task 08B digest (`test-design/fleet/digest.md`), not here. Nothing here allocates an ID, changes the catalog or records a run; `A-n` labels are temporary.

## 1. Original proposal (run t08b-20261031-r1, label A, text unchanged; Prettier aligned table spacing and added blank lines)

Run t08b-20261031-r1 · SCRUM-29 · AC1 (product detail and add-to-cart, UI) · design mode, label prefix A. No Jira call was made.

## Summary

Nothing is Covered. The catalog has no store UI or store API IDs. This repo has no store spec and no `ProductPage` Page Object. Both Jira cases, TC-SUI-010 and TC-SUI-012, are Gap rows. I also propose six New rows (A-1 to A-6). Most of their Expected values are OPEN, because no source gives element names, display formats or what the cart count means. I could not save anything; this is text only.

## 1. Sources read

- `test-design\inputs\SCRUM-29-AC1.md` · whole file · the criterion wording, the run rules, the known unknowns and the out-of-scope list.
- `vault\sources\jira\SCRUM-29.md` · Facts; Comparison; Questions:
  - Description: "TC-SUI-010..013".
  - SCRUM-49 = TC-SUI-010 (High, `env-dev-prod`).
  - SCRUM-50 = TC-SUI-012 (High, `env-dev`).
  - Neither subtask has a description.
  - No `tests/store-ui/`, no `ProductPage`, no store spec in this repo.
  - Questions 1 to 4.
- `evidence\week3-task08b-note.md` · Facts: Jira reads (2026-10-31):
  - Read-only reads approved; they match the seed.
  - Course keys are used directly; there is no key map.
  - No blockers.
- `test-design\contract\openapi-dev-2026-10-30.json` · `paths`:
  - `/shop/{slug}` `get`: path parameter `slug` (string, required); responses document `200` only, with no body.
  - `/cart/add` `post`: `200` only; no request body or parameters documented.
  - `/cart` `get`: `200` only.
  - `/api/products/{slug}` `get`: summary "Get a product with its variants"; `slug` required; `200` only, no schema.
  - I read these by pattern search, because the file is a single line.
- `vault\sources\database\starting-data.md` · Mentor's text; Mentor's answers (2026-10-30); Seed facts:
  - 8 slugs and their prices in cents.
  - Hoodie `XL` has stock 0. The water bottle has one variant, `One Size`, with stock 0.
  - Both of those products stay `active = true`.
  - Prices and `active` are fixed; stock and row counts drift.
  - 14 variants in total.
- `vault\wiki\01-framework\db-map.md` · Store catalogue; Cart and checkout:
  - `products`: `name`, `description`, `price_cents` (>= 0), `image_url` (nullable), `active`.
  - `product_variants`: `label`, `stock` (>= 0); `label` is unique per product.
  - `carts`: `user_id` and `session_token` are both nullable; `status` defaults to `open`.
  - `cart_items`: `qty` > 0, `unit_price_cents`, one row per (cart, variant).
- `vault\sources\test-catalog\` · searched for `TC-SUI-` and `TC-SAPI-`: no matches.
- `vault\sources\test-catalog\db.md` · rows TC-SDB-001, 002 and 003: these are seed checks run by `scripts/seed-integrity.sh`, not UI tests.
- `tests\` and `pages\` · searched for `TC-SUI-010`, `TC-SUI-012` and `ProductPage`: no matches in either folder.

## 2. Risks (most serious first)

1. **No test at all.** Both Jira cases are marked `automated`, but that label refers to the course's own suite (Jira question 3). In this repo the behavior has no protection.
2. **The wrong variant or quantity lands in the cart.** The add appears to succeed, but the cart holds a different label or amount than the one chosen.
3. **The nav cart count is stale.** It does not update after adding, or updates only after a reload, while the cart page is correct (or the other way round).
4. **A detail element is missing or wrong** (image, title, price, description, variant-select, qty-input or add-to-cart). The price is the most likely to be wrong, because it is stored in cents and has to be formatted.
5. **The add leaves dev data behind.** TC-SUI-012 writes cart rows on the shared dev database, and a test without cleanup would leave them there.
6. **The product page breaks for single-variant products**, such as the water bottle (`One Size`).

## 3. Techniques

**Used:**

- **Input groups:** the seed has multi-variant apparel (hoodie, with sizes) and a single-variant product (bottle), and the page may render the variant-select differently for each.
- **States:** the cart starts empty and must show the item after the add, in two places (nav count and cart page).
- **Async behavior:** the nav count changes after a submit, so the test must wait on the visible change rather than a timeout.
- **Integrity:** the price shown and the variant in the cart must match the fixed seed values and the choice the user made.

**Not used:**

- Boundaries on quantity: no source gives a UI minimum, maximum or default. The database rule `qty > 0` is storage, not stated UI behavior. Kept as a question.
- Validation: no error message or rule is documented.
- Authorization: the criterion does not say whether adding needs a signed-in user.
- Idempotency (adding the same variant twice): this is cart math, which belongs to SCRUM-30. Kept as a question.

## 4. Cases

| Status | ID / label                            | Behavior                                                                                                           | Technique         | Expected                                                                                                                                         | Source (path#section)                                                                           | In catalog                       | Implemented test (spec:title)          | Last run (evidence path, date) |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------- | ------------------------------ |
| Gap    | TC-SUI-010 (Jira source ID, SCRUM-49) | The product detail page renders image, title, price, description, variant-select, qty-input and add-to-cart        | States (render)   | All seven elements are visible on `/shop/{slug}` (route returns `200`). Selectors and test IDs: OPEN                                             | `vault/sources/jira/SCRUM-29.md#Facts`; contract `paths./shop/{slug}.get`                       | no (no `TC-SUI-` in the catalog) | none (no store spec, no `ProductPage`) | no run record found            |
| Gap    | TC-SUI-012 (Jira source ID, SCRUM-50) | After add to cart, the cart reflects the item (nav cart count / cart page)                                         | States, async     | The nav cart count changes and the cart page (`GET /cart`, `200`) lists the item. Exact count value and line text: OPEN                          | `vault/sources/jira/SCRUM-29.md#Facts`; contract `paths./cart/add.post`, `paths./cart.get`      | no                               | none                                   | no run record found            |
| New    | A-1                                   | The price on the detail page matches the product's fixed seed price (e.g. `codemify-classic-tee` = 2500 cents)     | Integrity         | Shows the amount for 2500 cents. Display format (currency sign, decimals): OPEN                                                                  | `vault/sources/database/starting-data.md#Seed facts` (price rows, class `fixed`)                | no                               | none                                   | no run record found            |
| New    | A-2                                   | The variant-select of a single-variant product (`flaky-free-water-bottle`) offers exactly its one variant          | Input groups      | 1 option, label `One Size`. How a stock-0 option is shown: OPEN                                                                                  | `starting-data.md#Seed facts` (`variant_count`, `stock_zero`); `#Mentor's answers` (Sold out)   | no                               | none                                   | no run record found            |
| New    | A-3                                   | The variant-select of a multi-variant product (`bounded-behavior-hoodie`) lists its variant labels, including `XL` | Input groups      | `XL` is among the options. The full label list and count for the hoodie: OPEN (the source gives only a total of 14 variants across all products) | `starting-data.md#Mentor's answers`; `db-map.md#product_variants`                               | no                               | none                                   | no run record found            |
| New    | A-4                                   | The detail page renders correctly for each of the 8 seeded slugs (not only one product)                            | Input groups      | `200` and the seven elements of TC-SUI-010 on each slug. The image behavior when `image_url` is NULL: OPEN                                       | `starting-data.md#Mentor's answers` (slug table); contract `/shop/{slug}`; `db-map.md#products` | no                               | none                                   | no run record found            |
| New    | A-5                                   | The cart page shows the product and the variant that were chosen on the detail page (an in-stock variant)          | Integrity, states | The line names the chosen product and its variant label. Line text and layout: OPEN                                                              | Jira TC-SUI-012 wording ("cart reflects the item"); `db-map.md#cart_items`                      | no                               | none                                   | no run record found            |
| New    | A-6                                   | The nav cart count updates after add without a manual reload                                                       | Async behavior    | The count changes from its value before the add. By how much (one per line or one per unit) and whether a reload is needed: OPEN                 | Jira TC-SUI-012 wording ("nav cart count")                                                      | no                               | none                                   | no run record found            |

TC-SDB-001, 002 and 003 are not Covered for any row. They are seed-integrity script checks, not UI assertions. TC-SDB-002 only supports A-1, A-2 and A-3 as a precondition: the expected prices and sold-out variants exist in the data.

## 5. OPEN QUESTIONS

1. **Missing cases.** The description says TC-SUI-010..013, but Jira and the seed have only 010 and 012. Are 011 and 013 intended, and what do they cover?
2. **Sold-out variants.** "variants, stock" is in the summary, but no case covers a sold-out variant (hoodie `XL`, bottle `One Size`). Is "disabled or blocked add-to-cart for stock 0" in scope? If so, who states the expected UI behavior? Until answered it is a question, not a row.
3. **Element names and selectors.** No source names the selectors, test IDs or visible text for the seven elements, the nav cart count or the cart line.
4. **Price display format** for cents values (e.g. "$25.00"?): not stated anywhere.
5. **Meaning of the nav cart count.** Does it count lines or units? A qty-input value above 1 changes the expected count.
6. **Quantity input.** Default value, minimum and maximum are not stated. Should adding with qty > 1 be checked as part of "cart reflects the item"?
7. **Login for adding.** Does adding to the cart need a signed-in user, or does an anonymous session cart work? `carts.user_id` and `carts.session_token` are both nullable. If a sign-in is needed, the test signs in as `AUTHOR`.
8. **Cleanup after TC-SUI-012 (rule 20).** The add writes `carts` and `cart_items` on dev. What is the approved way to remove the test's own item (`/cart/remove` exists in the contract, with no body documented)? Can the cart be marked as the test's own record? The run needs separate approval.
9. **Conflict between the Jira label and rule 01.** TC-SUI-010 is labelled `env-dev-prod`, but rule 01 requires `runIfEnv(test, ['dev'])` in every spec. Should the render test stay dev-only, or is a read-only prod variant wanted (approved prod runs only)?
10. **Oracle for title and description.** `/api/products/{slug}` documents `200` with no schema. Should the UI title and description be compared with the API body (undocumented fields), or with the database `name` and `description` (only non-personal values are allowed under rule 40)?
11. **Unknown or inactive slug.** What does `/shop/{slug}` return? Only `200` is documented. This is outside the AC wording, so it is a question only.
12. **Adding the same variant twice.** `cart_items` allows one row per (cart, variant). Should the quantity be merged? That is cart math (SCRUM-30) and out of scope here; noted so it is not lost.
13. **Unit price in the cart.** Should the cart line's unit price equal the product price? That is borderline between "reflects the item" and cart math (SCRUM-30); not made a row.
14. **Contract snapshot.** I cannot compute SHA-256, so I could not confirm that the file matches the SHA in the input. The catalog has no store entries, so there is no catalog SHA to compare with.
15. **`/api/cart` (`get`, "Get the current cart with computed totals").** It is in the snapshot but not in the input's list. Should it serve as an API check of TC-SUI-012's result? If so, it needs to be added to the input.

## 6. Not done

- No Jira call, as instructed.
- No other key's input, design or proposal was opened or searched.
- I did not open the files the requirement note links to (`jira-seed/jira-seed.md`, `evidence/week2-baseline.md` (tag `week6-end`), `evidence/week3-task03-note.md` (tag `week6-end`)) because the input does not list them. They would only reconfirm the seed match, which the Task 08B note already records.
- No SHA check of the snapshot (no shell tool). The main conversation would need to settle it.
- No database read (not allowed for this agent, and not needed for the metadata used).
- No TC- IDs allocated; A-1 to A-6 stay temporary until a separate approved catalog step under rule 50.
