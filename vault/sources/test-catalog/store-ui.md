---
id: test-catalog-store-ui
type: catalog
---

# Test catalog — Store UI

Canonical Store browser cases for SCRUM-29 (Week 3 Task 08B, saved 2026-10-31). A row defines a
case; it does not mean a test exists or has run. No store test or store Page Object exists today.
Sources, status and priority keys, and the shared OPEN QUESTIONS (Q1 to Q4, Q18 to Q38) are in the
[Store API catalog](store-api.md). Reviewed design and decisions:
[Task 08B digest](../../../test-design/fleet/digest.md).

Extra sources: S29 = [SCRUM-29 requirement note](../jira/SCRUM-29.md), Jira read 2026-10-31; DES =
[SCRUM-29 design](../../../test-design/SCRUM-29/AC1-design.md), designer run `t08b-20261031-r1`,
reviewed 2026-10-31.

Added 2026-11-08 (Week 4 Task 02, owner-approved plan): S30, S31, S32 = Jira SCRUM-30, 31, 32 and
subtasks SCRUM-51 to 56 and 158, read 2026-11-08; INS = guest browser inspection on dev, 2026-11-07
19:41–19:44 and 2026-11-08 19:06 UTC (observed, not documented; `evidence/week4-checks.md` (tag `week6-end`),
"Store UI observations"); M11 = [mentor answers 2026-11-07](../product/store-api.md).
Tests in `tests/store/ui/` exist for TC-SUI-012, 020, 022, 030, 031, 032 and the UI check of TC-SAPI-032;
updated after run 20261108T194122Z: TC-SUI-012, 022, 030 and the TC-SAPI-032 UI check passed; TC-SUI-020
failed on the missing cart-line image (product bug SCRUM-166); TC-SUI-031 and 032 are named skips, blocked and
not run (no checkout allocation; mentor 2026-11-08: no further checkout run).
Added 2026-11-11: TC-SUI-014 has a test, `tests/store/ui/product.spec.ts` (adopted from a recording),
which passed once on dev on 2026-11-11 (`evidence/week4-checks.md` (tag `week6-end`),
"Adoption"); the `$25.00` format is observed, not documented, so Q8 stays open.
Added 2026-11-12: the mentor answered Q47 (a one-run Store UI checkout allocation, variant 11) and
Q49 (the declined page) on 2026-11-12 ([source](../product/store-ui-checkout.md)).
In dev run 20261112T204457Z TC-SUI-031 (order 3278) and TC-SUI-032 passed; TC-SUI-012, 022, 030, 014
and the UI check of TC-SAPI-032 passed; TC-SUI-020 failed again on the line image (SCRUM-166). The
allocation is used (`usedOn` 2026-11-12), so both journeys now skip by name and are never repeated
(`evidence/week4-checks.md` (tag `week6-end`), "Final verification (2026-11-12)").
The rows' "not observed yet" notes in the Negative / boundary column are the 2026-11-08 state.

## Cases

| ID             | Case                                                 | Requirement                                           | Preconditions                                                | Action                                                                                          | Expected                                                                                                                                                                                                                                     | Negative / boundary                                      | P   | Risk                                                | Status / evidence                                                                                                                                                                                                                                                                               |
| -------------- | ---------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-SUI-010** | Product page shows its seven elements                | S29 SCRUM-49                                          | seed data (SD)                                               | open `/shop/{slug}`                                                                             | `200`; image, title, price, description, variant-select, qty-input and add-to-cart visible                                                                                                                                                   | selectors and test IDs OPEN (Q7); `image_url` NULL (Q17) | P2  | product page broken                                 | New — no test; DES SCRUM-29                                                                                                                                                                                                                                                                     |
| **TC-SUI-012** | Adding to cart shows the item in the cart            | S29 SCRUM-50 (+A-5, A-6)                              | an in-stock variant; own cart (dev, rule 20, Q11)            | choose a variant, add to cart, then open the cart page                                          | URL `/cart` without a manual reload; the cart page lists the chosen product and its variant label; the nav cart count shows 1 (it counts units, INS)                                                                                         | qty > 1 is TC-SUI-020                                    | P2  | wrong or missing item in the cart                   | Covered — passed in run 20261108T194122Z (evidence/week4-checks.md in tag week6-end)                                                                                                                                                                                                            |
| **TC-SUI-014** | Product page price equals the fixed seed price       | S29 summary (proposal A-1)                            | seed data; `codemify-classic-tee` 2500 cents (SD)            | open `/shop/codemify-classic-tee`                                                               | the price shown is 2500 cents                                                                                                                                                                                                                | display format OPEN (Q8)                                 | P2  | price formatted or taken wrongly                    | Covered — passed on dev 2026-11-11 (evidence/week4-checks.md in tag week6-end, Adoption); price format observed only, Q8 open; DES SCRUM-29 (A-1)                                                                                                                                               |
| **TC-SUI-015** | Variant-select offers the product's variants         | S29 summary "variants" (proposals A-2, A-3)           | seed data (SD)                                               | open `/shop/flaky-free-water-bottle` and `/shop/bounded-behavior-hoodie`                        | bottle: exactly 1 option, `One Size`; hoodie: `XL` among the options                                                                                                                                                                         | hoodie's full label list and sold-out display OPEN (Q6)  | P2  | wrong or missing variants offered                   | New — no test; DES SCRUM-29 (A-2, A-3)                                                                                                                                                                                                                                                          |
| **TC-SUI-020** | Cart line shows its details and correct sums         | S30 SCRUM-51; M11 item 4                              | own guest cart with 2 tees (API seed)                        | open `/cart`                                                                                    | the line shows image, name, variant label, quantity 2 and line total = 2 × 2500 as `$50.00`; subtotal $50.00; total = subtotal (no coupon, shipping and tax 0)                                                                               | `$` format observed (INS)                                | P2  | wrong amounts shown                                 | Failed — dev run 20261108T194122Z: no image on the cart line (SCRUM-51 requires one); product bug SCRUM-166 (owner decision 2026-11-08). The quantity and amount checks did not run in that run                                                                                                 |
| **TC-SUI-022** | SAVE10 discount row; invalid code shows coupon-error | S30 SCRUM-52; SD SAVE10; M11 item 6                   | own guest cart with 2 tees (5000)                            | apply an unknown `qa-auto-…` code, then SAVE10, through the cart page                           | unknown code: `coupon-error` "Invalid coupon code.", no discount row; SAVE10: no error, "Discount (SAVE10)" row "−$5.00", subtotal $50.00, total $45.00                                                                                      | discount sign U+2212 observed (INS)                      | P2  | discount missing or wrong                           | Covered — passed in run 20261108T194122Z (evidence/week4-checks.md in tag week6-end)                                                                                                                                                                                                            |
| **TC-SUI-030** | Checkout forms and test-card panel render            | S31 SCRUM-53; OAS pay description                     | own guest cart with 1 tee                                    | open `/checkout` from the cart (view only, no submit)                                           | the shipping and payment fields are visible; the test-card panel is visible and lists 4242 4242 4242 4242; the real-card warning and place-order button are visible                                                                          | "fields aligned" (layout) not asserted                   | P2  | checkout cannot be completed                        | Covered — passed in run 20261108T194122Z (evidence/week4-checks.md in tag week6-end)                                                                                                                                                                                                            |
| **TC-SUI-031** | Valid coupon carried through a paid checkout         | S31 SCRUM-54; S30 SCRUM-52; OAS cards; M11 items 4, 8 | new checkout allocation (Q47); allocated variant, quantity 1 | add on the product page, apply SAVE10, check out with the approved mock card and synthetic data | cart and checkout summary: subtotal = price, discount = 10 %, total = price − discount (also on place-order); confirmation: order number `CM-YYYY-######`, discounted total, status paid; the order read through the API is paid with SAVE10 | confirmation elements not observed yet                   | P1  | paid order without the discount, or no confirmation | Covered — passed in run 20261112T204457Z, order 3278, browser and API read (evidence/week4-checks.md in tag week6-end, "Final verification (2026-11-12)"); one-run allocation used (mentor 2026-11-12, Q47). Blocked and not run 2026-11-08 to 2026-11-12                                       |
| **TC-SUI-032** | Declined card shows an error, no confirmation        | S31 SCRUM-55; OAS cards                               | new checkout allocation (Q47); allocated variant, quantity 1 | check out with the declined mock card 4000 0000 0000 0002                                       | an error naming the decline (text Q49), no order confirmation, still on checkout, the own cart still holds its line                                                                                                                          | error element and text not observed yet (Q49)            | P1  | declined payment looks successful                   | Covered — passed in run 20261112T204457Z; failed order identified by its test email; `form-errors` observed (evidence/week4-checks.md in tag week6-end, "Final verification (2026-11-12)"); one-run allocation used (mentor 2026-11-12, Q47, Q49). Blocked and not run 2026-11-08 to 2026-11-12 |

## ID notes and limitations

- Every ID above matches `TC-<FAMILY>-<digits>`. TC-SUI-010 and 012 are the course IDs from Jira and
  the seed, used unchanged.
- TC-SUI-014 and 015 were allocated 2026-10-31 at this save (proposal A-1; proposals A-2 and A-3
  merged); unused anywhere in the seed or this repo before. `A-n` labels are temporary, not IDs; the
  map is in the [Task 08B digest](../../../test-design/fleet/digest.md).
- TC-SUI-011 and 013 are named by the SCRUM-29 description ("010..013") with no subtask (Q5). Not
  defined, and their numbers are not reused.
- Proposals A-5 and A-6 are part of TC-SUI-012's Expected; proposal A-4 was rejected (its image
  point is Q17). None of them has an ID.
- Not defined here: the other store UI tasks (seed SCRUM-28 TC-SUI-001 to 006 and 051, SCRUM-30 020
  and 022, SCRUM-31 030 to 032, SCRUM-32 040 and 050).

- Added 2026-11-08: TC-SUI-020, 022, 030, 031 and 032 are the course IDs from Jira (read 2026-11-08),
  used unchanged. SCRUM-30 names 020..023 and SCRUM-31 names 030..035, but TC-SUI-021, 023 and 033
  to 035 have no subtask: not defined here and not reused. The expired-coupon browser check reuses
  TC-SAPI-032 (store-api.md), the same case through the cart page; no UI ID was allocated for it.
- Deferred after 2026-11-08 (not in the required Store UI baseline): TC-SUI-010, 014, 015, 001 to 006,
  040, 050 and 051.
- Added 2026-11-11: TC-SUI-014 was taken out of the deferred list by the owner and adopted (see the
  coverage note above). TC-SUI-015 stays deferred: its Expected (bottle "exactly 1 option, `One Size`")
  conflicts with Q6 (the bottle shows "Sold out" and no variant select); open for the owner or mentor.

## OPEN QUESTIONS

Numbering is shared with the [Store API catalog](store-api.md#open-questions) (Q1 to Q4 apply to all
store cases). From the SCRUM-29 design (A, question number):

5. Q5: the description names TC-SUI-010..013; only 010 and 012 exist. Are 011 and 013 intended, and
   what do they cover? (A1)
6. Q6: is a sold-out variant's behaviour on the product page in scope, and who states it? Seed only:
   TC-SAPI-024 (API 422 "out of stock"), TC-SDB-014 ("blocks add-to-cart"). (A2)
7. Q7: selectors, test IDs and visible text for the seven elements, the nav count and the cart line.
   (A3)
8. Q8: price display format for cents (e.g. "$25.00"?). (A4)
9. Q9: does the nav count count lines or units; quantity default, minimum and maximum; check qty > 1?
   (A5, A6)
10. Q10: does adding need a signed-in user? Seed only: TC-SAPI-020 and 028 describe a guest cart kept
    by a `cart_token` cookie. If a sign-in is needed, the test uses `AUTHOR`. (A7)
11. Q11: the approved way to remove the test's own cart item (rule 20; `/cart/remove` has no body
    documented); the run needs separate approval. (A8)
12. Q12: compare title and description with the API body (undocumented) or the database (non-personal
    values only, rule 40)? (A10)
13. Q13: what does `/shop/{slug}` return for an unknown or inactive slug? Question only. (A11)
14. Q14: adding the same variant twice: merged quantity? Seed only: TC-SAPI-022 (qty bumps). Cart math,
    SCRUM-30. (A12)
15. Q15: should the cart line's unit price equal the product price? Seed TC-SUI-020 (SCRUM-30). (A13)
16. Q16: add `/api/cart` to the input as an API check of TC-SUI-012? (A15)
17. Q17: what does the product page show when `image_url` is NULL? (from rejected proposal A-4)

Answered by observation 2026-11-07 (INS; observed, not documented): Q6 the hoodie shows option
"XL — sold out" disabled and the water bottle "Sold out" with no variant select, quantity or add
button; Q7 the test IDs in evidence/week4-checks.md in tag week6-end, "Store UI observations"; Q8 prices as `$25.00`,
a discount as `−$5.00` (U+2212); Q9 the nav count counts units; Q13 an unknown slug returns HTTP 404
with "Product not found.". Q17 stays open: every product had an image.

Week 4 Task 02 (2026-11-08):

45. Q45: is the expected expired-coupon result in the browser `coupon-error` "This coupon has
    expired." with no discount row and unchanged totals (observed)? The rule and message come from
    SCRUM-79 and M11 item 6; only the on-screen placement is observed. Optional; not blocking.
46. Q46: submitting the cart's coupon form with an empty code did not clear an applied coupon, while
    `POST /api/cart/coupon {"code":""}` does (observed 2026-11-07). Expected?
47. Q47: a new one-run checkout allocation for TC-SUI-031 and 032 (2 orders, 1 to 2 payment rows,
    1 unit of stock), with the variant and whether it is exclusive.
48. Q48: the cart hint says WELCOME5 applies to orders "over $25.00"; the starting data and TC-SAPI-031
    say a minimum of 2500 (">= $25"). Which holds at exactly $25.00? (deferred case)
49. Q49: what does the browser show for a declined card (element and text)?

Update 2026-11-08: Q47 and Q49 were not sent. The mentor's reply of 2026-11-08 to the Task 01 results
("no need for another checkout run; keep the current allocation closed") supersedes them in the owner's
reading: TC-SUI-031 and 032 stay blocked and not run. Observed read-only the same day on existing own
orders 3274 (paid) and 3275 (failed): `/orders/{id}` shows `order-confirmation`, `order-number`,
`order-status` ("Paid", "Failed"), `payment-status`, `order-items`, `order-total`
(evidence/week4-checks.md in tag week6-end, "Store UI observations"); whether a browser checkout lands there is not observed.
