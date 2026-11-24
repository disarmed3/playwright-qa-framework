---
id: test-catalog-store-api
type: catalog
---

# Test catalog — Store API

Canonical Store API cases for SCRUM-33 and SCRUM-37 (Week 3 Task 08B, saved 2026-10-31). A row
defines a case; it does not mean a test exists or has run. No store test exists today. Rule:
[50 API tests and the case catalog](../../../.claude/rules/50-api-swagger.md). Reviewed designs and
decisions: [Task 08B digest](../../../test-design/fleet/digest.md).

Added 2026-11-07 (Week 4 Task 01, owner-approved plan): the cart, coupon and checkout rows come from
Jira read 2026-11-07. Tests for TC-SAPI-001, 009, 010, 021, 022, 023, 025, 027, 030, 032, 033, 041,
042, 050 to 053 and 074 exist in `tests/store/api/` and have not run yet. Gated tests are named skips
until the mentor answers Q36 and Q39 to Q43 (`STORE_GATES` in `tests/support/store.ts`).

Added 2026-11-07 (later): the mentor answered (source M11 below). Q15, Q19, Q22, Q36, Q39 to Q42 are
answered and their gates are open; Q43 is answered in part, so TC-SAPI-050 to 053 stay blocked. Rows
below carry the answered fields, messages and totals. TC-SAPI-001, 010 and 042 passed on dev earlier
the same day with the previous assertions; their updated tests have not run yet.

Added 2026-11-07 (run 20261107T191145Z): all 18 cases passed on dev in one run (1 worker, 0 retries).
TC-SAPI-050 to 053 used the one-run allocation (orders 3274 to 3277); their stock effect is recorded,
not asserted, until the mentor confirms variant 11 is exclusive (Q43). The allocation is now used.

## Sources

| Key  | Source                                                                                                                      | Date                                                                                                                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OAS  | dev `/api/docs/json` snapshot `test-design/contract/openapi-dev-2026-10-30.json` (untracked, local)                         | read 2026-10-30 21:23 UTC, HTTP 200, 16,335 bytes, SHA-256 `8f2ef6955633222799ab685067bd0c44d32066a6ce8ee4298ce6ddc680c83350` (same as the Blog API catalog) |
| S33  | [SCRUM-33 requirement note](../jira/SCRUM-33.md)                                                                            | Jira read 2026-10-31                                                                                                                                         |
| S37  | [SCRUM-37 requirement note](../jira/SCRUM-37.md)                                                                            | Jira read 2026-10-31; Comparison corrected 2026-10-31                                                                                                        |
| SEED | course backlog (Jira backlog seed, not published): store tasks not read in Jira (SCRUM-34, 36, 38, 40)                      | snapshot 2026-09-16; cited only as "seed", never as an expected value                                                                                        |
| SD   | [starting data](../database/starting-data.md)                                                                               | mentor's list 2026-10-15, answers 2026-10-30; prices and `active` fixed, stock and counts drift                                                              |
| DB   | [database map](../../wiki/01-framework/db-map.md)                                                                           | structure only                                                                                                                                               |
| DES  | designs [SCRUM-33](../../../test-design/SCRUM-33/AC1-design.md), [SCRUM-37](../../../test-design/SCRUM-37/AC1-design.md)    | designer run `t08b-20261031-r1`, reviewed 2026-10-31                                                                                                         |
| S34  | Jira SCRUM-34 and subtasks SCRUM-67 to 76 (titles only; no descriptions)                                                    | Jira read 2026-11-07                                                                                                                                         |
| S35  | Jira SCRUM-35 and subtasks SCRUM-77 to 82, 159, 160 (descriptions on 159 and 160)                                           | Jira read 2026-11-07                                                                                                                                         |
| S36  | Jira SCRUM-36 and subtasks SCRUM-83 to 87, 161 (description on 161)                                                         | Jira read 2026-11-07                                                                                                                                         |
| PD   | dev `GET /api/products/{slug}` for the 8 seed slugs: fields, variant labels, in stock yes/no                                | read 2026-11-07 13:50 UTC; OAS SHA-256 unchanged the same day                                                                                                |
| M11  | [mentor answers 2026-11-07](../product/store-api.md) (items 1 to 13)                                                        | received 2026-11-07                                                                                                                                          |
| M12  | [M12](../product/store-api.md): stock recorded, not asserted, is accepted; no further checkout run; allocation stays closed | received 2026-11-08                                                                                                                                          |

The OAS formal `responses` list only `200` for every store operation. The pay operation's
description documents the test cards and 402, 502 and 422 `card_invalid`; any other status or code
below comes from Jira and is marked so (Q4). The OAS login example contains sample credential
values; they are not copied here.

## Status and priority

Same keys as the [Blog API catalog](blog-api.md#status-and-priority): New = defined, sources
sufficient, no test. Gap = blocked, with the blocker named. Covered = an existing test asserts the
expected result, with run evidence. P1 auth, permissions, data exposure; P2 core behavior; P3
resilience, edge. Every case is dev-only (`runIfEnv(test, ['dev'])`) until Q1 is answered. Pay cases
need an order from cart and checkout (SCRUM-34, 36): created dev data, `envGuard`, rule 20 cleanup,
and a separate approval for each run.

## Products — SCRUM-33

| ID              | Case                                  | Requirement  | Contract / DB                                                                     | Preconditions                 | Action                                            | Expected                                                                                                                                                                                                                     | Negative / boundary                          | P   | Risk                                      | Status / evidence                                                                                                 |
| --------------- | ------------------------------------- | ------------ | --------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **TC-SAPI-001** | Product list envelope and defaults    | S33 SCRUM-57 | OAS `page` default 1, `pageSize` default 12; no response schema                   | seed data (SD)                | `GET /api/products`                               | 200; `items`, `page`, `pageSize`, `total`, `totalPages`; `page` 1, `pageSize` 12; only active products (Q21); at most `pageSize` and `total` items; `total` recorded against the seeded 8 as drift, not failed (M11 item 11) | `totalPages` rule OPEN (Q20)                 | P2  | listing broken or leaks inactive products | Covered — passed in run 20261107T191145Z (evidence/week4-checks.md in tag week6-end); total recorded as drift (8) |
| **TC-SAPI-002** | Search narrows by name or description | S33 SCRUM-58 | OAS `search` string                                                               | seed data                     | `GET /api/products?search=hoodie`                 | 200; exactly 1 item, `bounded-behavior-hoodie`                                                                                                                                                                               | descriptions and case sensitivity OPEN (Q24) | P2  | search returns wrong products             | New — no test; DES SCRUM-33                                                                                       |
| **TC-SAPI-003** | Category filter and enum validation   | S33 SCRUM-59 | OAS `category` enum apparel, drinkware, stickers, accessories; DB CHECK same four | seed data                     | `?category=apparel`; a value outside the enum     | apparel items only; bad value 400 (Jira, not in OAS); count OPEN (Q26)                                                                                                                                                       | error body OPEN (Q19)                        | P2  | filter ignored or unvalidated             | New — no test; DES SCRUM-33                                                                                       |
| **TC-SAPI-004** | Sort order                            | S33 SCRUM-60 | OAS `sort` enum newest, price_asc, price_desc, name                               | seed data (8 distinct prices) | `?sort=price_asc`, `price_desc`, `name`, `newest` | 200; `price_asc` first `sticker-pack-vol-1` (600); `price_desc` first `bounded-behavior-hoodie` (4500); `name` and `newest` first items OPEN (Q25)                                                                           | default and bad sort value (Q25)             | P2  | wrong order shown                         | New — no test; DES SCRUM-33                                                                                       |
| **TC-SAPI-005** | Price range in cents                  | S33 SCRUM-61 | OAS `min_price`, `max_price` integer cents                                        | seed data (SD prices)         | `?min_price=1500&max_price=2500`                  | 200; every `price_cents` within 1500–2500; 4 items if ends included, 2 if not (Q23)                                                                                                                                          | min > max, negative, non-integer (Q23)       | P2  | range off by one                          | New — no test; DES SCRUM-33                                                                                       |
| **TC-SAPI-006** | In-stock filter                       | S33 SCRUM-62 | OAS `in_stock` boolean; SD bottle `One Size` stock 0                              | seed data                     | `?in_stock=true`                                  | 200; `flaky-free-water-bottle` absent; hoodie (only `XL` sold out) OPEN (Q27); count drifts                                                                                                                                  | `in_stock=false` (Q27)                       | P2  | sold-out product offered                  | New — no test; DES SCRUM-33                                                                                       |
| **TC-SAPI-007** | Pagination and page bounds            | S33 SCRUM-63 | OAS `page` min 1; `pageSize` min 1, max 50                                        | seed data                     | `?page=2&pageSize=3`; `pageSize=51`; `page=0`     | page 2 = items 4–6, no overlap with page 1; `pageSize=51` clamped (Jira) or rejected (OAS) OPEN; `page=0` rejected, status OPEN                                                                                              | page beyond the last page (Q28)              | P2  | wrong slice; bounds unenforced            | Gap — source conflict (Q18); DES SCRUM-33                                                                         |
| **TC-SAPI-008** | Artificial delay on the list          | S33 SCRUM-64 | OAS `delay` integer ms "(capped)"                                                 | seed data                     | `?delay=1500` and the same request without it     | 200; response time at least about 1500 ms; identical data; capped                                                                                                                                                            | cap value, over-cap handling, tolerance (Q2) | P3  | hangs; data changes with delay            | New — no test; DES SCRUM-33                                                                                       |
| **TC-SAPI-009** | Product detail with variants          | S33 SCRUM-65 | OAS `slug` path; DB `product_variants` UNIQUE (product, label)                    | seed data                     | `GET /api/products/codemify-classic-tee`          | 200; slug `codemify-classic-tee`, price 2500 (SD, fixed); `variants[]` labels exactly S, M, L, XL, each with `stock` (drifts)                                                                                                | field names beyond the DB map OPEN (Q20)     | P2  | wrong product or variants                 | Covered — passed in run 20261107T191145Z (evidence/week4-checks.md in tag week6-end)                              |
| **TC-SAPI-010** | Unknown product slug                  | S33 SCRUM-66 | not in OAS                                                                        | none                          | `GET /api/products/does-not-exist`                | 404; `error` `not_found` (Jira code; field from M11 item 6)                                                                                                                                                                  | —                                            | P3  | wrong status for a missing product        | Covered — passed in run 20261107T191145Z (evidence/week4-checks.md in tag week6-end)                              |

## Cart — SCRUM-34

Each case uses its own fresh guest cart (own cookie, no account). Teardown deletes its registered
lines and clears its coupon; the empty cart row stays, because no API deletes a cart (Q42).

| ID              | Case                                  | Requirement                                                              | Contract / DB                                                                                    | Preconditions                                                | Action                  | Expected                                                                                                                                                                                                   | Negative / boundary | P   | Risk                       | Status / evidence                                                                    |
| --------------- | ------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --- | -------------------------- | ------------------------------------------------------------------------------------ |
| **TC-SAPI-021** | Adding a variant creates a line       | S34 SCRUM-68; M11 items 3, 4                                             | OAS `POST /api/cart/items` body `variant_id` (required), `qty`; only 200 listed; DB `cart_items` | own guest cart; a seed-product variant with stock >= 5 today | add qty 2               | 200; one line in `cart.items` with that `variant_id`, `qty` 2, `unit_price_cents` = seed price, `line_total_cents` = 2 × price; `subtotal_cents` = 2 × price; `discount_cents` 0; `total_cents` = subtotal | —                   | P2  | wrong line or subtotal     | Covered — passed in run 20261107T191145Z (evidence/week4-checks.md in tag week6-end) |
| **TC-SAPI-022** | Adding the same variant twice merges  | S34 SCRUM-69; M11 item 4                                                 | DB `cart_items` UNIQUE (`cart_id`, `variant_id`)                                                 | as TC-SAPI-021                                               | add qty 1 twice         | 200 twice; one line, `qty` 2, `line_total_cents` = 2 × price; subtotal and total = 2 × price                                                                                                               | —                   | P2  | duplicate lines            | Covered — passed in run 20261107T191145Z (evidence/week4-checks.md in tag week6-end) |
| **TC-SAPI-023** | Quantity above stock is refused       | S34 SCRUM-70; Week 4 lesson baseline (owned state unchanged); M11 item 6 | `stock` in product detail (PD)                                                                   | own cart with 1 unit                                         | add stock + 1           | 422, `error` `cart_error`; owned lines, money and coupon unchanged (shared `stock` excluded)                                                                                                               | —                   | P2  | oversell or partial change | Covered — passed in run 20261107T191145Z (evidence/week4-checks.md in tag week6-end) |
| **TC-SAPI-025** | Quantity change and removal by qty 0  | S34 SCRUM-72; M11 item 4                                                 | OAS PATCH `qty` required, "qty 0 removes it"                                                     | one own line                                                 | PATCH qty 2, then qty 0 | 200; `qty` 2, `line_total_cents`, subtotal and total = 2 × price; then no line, subtotal and total 0                                                                                                       | —                   | P2  | stale totals               | Covered — passed in run 20261107T191145Z (evidence/week4-checks.md in tag week6-end) |
| **TC-SAPI-027** | Deleting a line recomputes the totals | S34 SCRUM-74; M11 item 4                                                 | OAS DELETE `/api/cart/items/{id}`                                                                | two own lines of different products                          | DELETE one line         | before: subtotal = sum of both prices; 200; only the other line remains; subtotal and total = its price                                                                                                    | —                   | P2  | stale totals               | Covered — passed in run 20261107T191145Z (evidence/week4-checks.md in tag week6-end) |

## Coupons — SCRUM-35

Valid, expired, unknown and re-applied coupons are separate cases with their own carts; none is
evidence for another. Coupon terms: [starting data](../database/starting-data.md) (fixed facts).

| ID              | Case                           | Requirement                                                                | Contract / DB                                              | Preconditions               | Action                          | Expected                                                                                                          | Negative / boundary                                                         | P   | Risk                    | Status / evidence                                                                                                                                                              |
| --------------- | ------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TC-SAPI-030** | SAVE10 percentage discount     | S35 SCRUM-77; SD SAVE10; M11 items 3, 4                                    | OAS `POST /api/cart/coupon` `code`; DB `carts.coupon_code` | own cart with 2 tees (5000) | apply SAVE10                    | 200; coupon SAVE10; subtotal 5000, discount 500, total 4500                                                       | rounding on other subtotals not asserted                                    | P2  | wrong discount          | Covered — passed in run 20261107T191145Z (evidence/week4-checks.md in tag week6-end)                                                                                           |
| **TC-SAPI-032** | Expired coupon is refused      | S35 SCRUM-79; SD EXPIRED10 (`active` true, expired 2025-01-01); M11 item 6 | OAS coupon                                                 | own cart with 1 line        | apply EXPIRED10                 | 422, `error` `coupon_error`, `message` "This coupon has expired."; discount 0; total = subtotal; coupon unchanged | —                                                                           | P2  | expired coupon accepted | Covered — passed in run 20261107T191145Z (evidence/week4-checks.md in tag week6-end); UI check through the cart page (store/ui/coupons.spec.ts) passed in run 20261108T194122Z |
| **TC-SAPI-033** | Unknown coupon is refused      | S35 SCRUM-80; M11 item 6                                                   | OAS coupon                                                 | own cart with 1 line        | apply an owned `qa-auto-…` code | 422, `error` `coupon_error`, `message` "Invalid coupon code."; discount 0; total = subtotal; coupon unchanged     | —                                                                           | P2  | unknown code accepted   | Covered — passed in run 20261107T191145Z (evidence/week4-checks.md in tag week6-end)                                                                                           |
| **TC-SAPI-074** | Applying the same coupon twice | M11 item 5 (one coupon per cart; discounts do not stack)                   | OAS coupon                                                 | own cart with 2 tees        | apply SAVE10 twice              | second application: 200; `coupon_code` SAVE10, discount (500) and total (4500) unchanged; contents unchanged      | another valid coupon replaces the current one (M11 item 5; not tested here) | P2  | stacked discounts       | Covered — passed in run 20261107T191145Z (evidence/week4-checks.md in tag week6-end)                                                                                           |

## Checkout — SCRUM-36

| ID              | Case                                         | Requirement                                               | Contract / DB                       | Preconditions                     | Action                              | Expected                                                                                                                                                                     | Negative / boundary                                                             | P   | Risk                   | Status / evidence                                                                    |
| --------------- | -------------------------------------------- | --------------------------------------------------------- | ----------------------------------- | --------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --- | ---------------------- | ------------------------------------------------------------------------------------ |
| **TC-SAPI-041** | Missing email or shipping fields are refused | S36 SCRUM-84; M11 item 7 (resolves the SCRUM-36 conflict) | OAS: all six body fields `required` | fresh context with no cart        | POST `{}`                           | `{}`: 400, `code` `FST_ERR_VALIDATION`; all fields present with an invalid email and blank shipping: 422, `error` `validation_error`, `messages` array (one names the email) | no country or postal-code format rule (M11 item 7)                              | P2  | invalid order accepted | Covered — passed in run 20261107T191145Z (evidence/week4-checks.md in tag week6-end) |
| **TC-SAPI-042** | Checkout without any cart                    | S36 SCRUM-85; SCRUM-161; M11 item 6                       | not in OAS                          | fresh context with no cart cookie | POST checkout with placeholder data | 422, `error` `empty_cart`, `message` "Your cart is empty."                                                                                                                   | a cart row with no lines gives `checkout_error` (TC-SAPI-071, not defined here) | P2  | order from nothing     | Covered — passed in run 20261107T191145Z (evidence/week4-checks.md in tag week6-end) |

## Mock payment — SCRUM-37

| ID              | Case                                            | Requirement                                     | Contract / DB                                                                                  | Preconditions                                                                      | Action                                               | Expected                                                                                                                                                                                                                                                      | Negative / boundary                                                 | P   | Risk                                            | Status / evidence                                                                                                                                                                                  |
| --------------- | ----------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-SAPI-050** | Approved pay                                    | S37 SCRUM-88; M11 items 8, 10, 12 and follow-up | OAS pay description: 4242 4242 4242 4242 → 200; DB `orders.status`, `payments.status`, `stock` | fresh own pending order, qty 1, allocated variant 11 (Deterministic Cap, One Size) | `POST /api/checkout/{orderId}/pay` with 4242         | checkout 201, order `pending` with subtotal = total = price; pay 200; order `paid`; one item qty 1 at price; payment `approved`; stock decreases by 1 (recorded); cart `ordered` by indirect evidence (order references the cart; next cart is new and empty) | exact stock comparison pending until exclusivity is confirmed (Q43) | P2  | paid order without stock change, or the reverse | Covered — passed in run 20261107T191145Z (evidence/week4-checks.md in tag week6-end); stock effect recorded, not asserted, accepted by the mentor 2026-11-08 ([M12](../product/store-api.md), Q43) |
| **TC-SAPI-051** | Declined pay                                    | S37 SCRUM-89; M11 items 6, 8, 10 and follow-up  | OAS: 4000 0000 0000 0002 → 402                                                                 | fresh own pending order, qty 1, allocated variant 11 (Deterministic Cap, One Size) | pay with 4000 0000 0000 0002                         | 402, `error` `payment_declined`; order `failed`; payment `declined`; no stock change caused by the payment (recorded)                                                                                                                                         | exact stock comparison pending until exclusivity is confirmed (Q43) | P2  | declined card changes stock                     | Covered — passed in run 20261107T191145Z (evidence/week4-checks.md in tag week6-end); stock effect recorded, not asserted, accepted by the mentor 2026-11-08 ([M12](../product/store-api.md), Q43) |
| **TC-SAPI-052** | Gateway error                                   | S37 SCRUM-90; M11 items 6, 8, 10 and follow-up  | OAS: 4000 0000 0000 0119 → 502                                                                 | fresh own pending order, qty 1, allocated variant 11 (Deterministic Cap, One Size) | pay with 4000 0000 0000 0119                         | 502, `error` `gateway_error`; order stays `pending`; payment `error`; no stock change caused by the payment (recorded)                                                                                                                                        | exact stock comparison pending until exclusivity is confirmed (Q43) | P2  | gateway error leaves a wrong state              | Covered — passed in run 20261107T191145Z (evidence/week4-checks.md in tag week6-end); stock effect recorded, not asserted, accepted by the mentor 2026-11-08 ([M12](../product/store-api.md), Q43) |
| **TC-SAPI-053** | Undocumented card, even Luhn-valid              | S37 SCRUM-91; M11 items 6, 10 and follow-up     | OAS: any other number → 422 `card_invalid` "before anything is saved"                          | fresh own pending order, qty 1, allocated variant 11 (Deterministic Cap, One Size) | pay with a Luhn-valid number outside the test list   | 422, `error` `card_invalid`, `messages` array; order stays `pending`; `payment` null in `GET /api/orders/{id}`; no stock change (recorded)                                                                                                                    | exact stock comparison pending until exclusivity is confirmed (Q43) | P1  | a real-looking card is accepted or stored       | Covered — passed in run 20261107T191145Z (evidence/week4-checks.md in tag week6-end); stock effect recorded, not asserted, accepted by the mentor 2026-11-08 ([M12](../product/store-api.md), Q43) |
| **TC-SAPI-054** | Bad card format, past expiry, short CVV         | S37 SCRUM-92 (+C-2)                             | OAS body requires `card_number`, `exp`, `cvv` (examples `12/30`, `123`)                        | own pending order                                                                  | pay with each invalid field                          | 422 `card_invalid` with messages; a bad card number saves nothing (OAS); after expiry or CVV rejection nothing saved OPEN                                                                                                                                     | current vs previous month; one CVV digit short; formats OPEN (Q34)  | P2  | invalid input accepted or partly stored         | Gap — missing source: formats and messages (Q34); DES SCRUM-37                                                                                                                                     |
| **TC-SAPI-055** | Paying an already-paid order                    | S37 SCRUM-93                                    | DB `payments.order_id` has no UNIQUE                                                           | own order paid once                                                                | pay again with 4242                                  | 200; the existing payment returned, no new row; stock not reduced a second time                                                                                                                                                                               | —                                                                   | P2  | double charge or double stock decrement         | New — no test; DES SCRUM-37                                                                                                                                                                        |
| **TC-SAPI-056** | Unknown order id                                | S37 SCRUM-94                                    | OAS `orderId` integer; 404 not in OAS                                                          | an id that was never created                                                       | pay with 4242                                        | 404 (Jira)                                                                                                                                                                                                                                                    | code, body and payment row OPEN (Q29)                               | P3  | wrong status for a missing order                | New — no test; DES SCRUM-37                                                                                                                                                                        |
| **TC-SAPI-057** | Artificial delay on pay                         | S37 SCRUM-95                                    | OAS `delay` integer on pay                                                                     | own pending order                                                                  | pay with `?delay=` at 0, small, at and above the cap | delay honoured; capped; outcome unchanged                                                                                                                                                                                                                     | cap value and over-cap handling (Q2)                                | P3  | hangs; delay changes the result                 | New — no test; DES SCRUM-37                                                                                                                                                                        |
| **TC-SAPI-058** | Luhn-invalid card number                        | S37 description "Luhn" (proposal C-1)           | OAS: any other number → 422 `card_invalid` "before anything is saved"                          | own pending order                                                                  | pay with a 16-digit number that fails the Luhn check | 422 `card_invalid`; no payment row; order stays `pending`                                                                                                                                                                                                     | —                                                                   | P2  | checksum not enforced                           | New — no test; DES SCRUM-37 (C-1)                                                                                                                                                                  |
| **TC-SAPI-059** | Two pay requests for one order at the same time | S37 description "idempotent pay" (proposal C-3) | DB `payments.order_id` has no UNIQUE                                                           | own pending order                                                                  | send two pays with 4242 together                     | stock reduced once; exactly one approved payment                                                                                                                                                                                                              | the two response statuses OPEN (Q35)                                | P2  | concurrent double charge or double decrement    | Gap — missing source: response statuses (Q35); DES SCRUM-37 (C-3)                                                                                                                                  |
| **TC-SAPI-070** | Pay needs no authentication or ownership        | S37 SCRUM-162                                   | OAS: no `security` on pay                                                                      | a pending order of another user or a guest                                         | pay without a token, and for another user's order    | OPEN: a mentor decision (Q31); a disclosure is never an expected pass                                                                                                                                                                                         | in AC scope? (Q30)                                                  | P1  | anyone can pay a stranger's order               | Gap — source conflict: possible defect (Q30, Q31); DES SCRUM-37                                                                                                                                    |

## ID notes and limitations

- Every ID above matches `TC-<FAMILY>-<digits>`. TC-SAPI-001 to 010, 050 to 057 and 070 are the
  course IDs from Jira and the seed, used unchanged.
- TC-SAPI-058 and 059 were allocated 2026-10-31 at this save (proposals C-1 and C-3); unused anywhere
  in the seed or this repo before. `A-n`, `B-n` and `C-n` are temporary proposal labels, not IDs; the
  label-to-ID map is in the [Task 08B digest](../../../test-design/fleet/digest.md).
- Range shorthand (`TC-SAPI-050..057`) is a reference, not an ID.
- Proposal C-2 is part of TC-SAPI-054's Expected; it has no ID of its own.
- Added 2026-11-07: TC-SAPI-021, 022, 023, 025, 027, 030, 032, 033, 041 and 042 are the course IDs
  from Jira (read 2026-11-07), used unchanged.
- TC-SAPI-074 was allocated 2026-11-07 at this save for the re-application case (plan label NEW-1);
  unused in the seed, Jira and this repo before. TC-SAPI-035 is not used: it is missing from the
  SCRUM-35 range, its meaning is asked in Q41, and the number is not reused.
- Still not defined here after 2026-11-07 (deferred in the Week 4 plan): TC-SAPI-020, 024, 026, 028,
  029, 031, 034, 036, 040, 043, 044, 060 to 063 and 071 to 073. Also deferred, with no row: replacing
  the current coupon with another valid coupon (documented in M11 item 5).
- Not defined here: the other store API tasks (seed SCRUM-34 TC-SAPI-020 to 029, SCRUM-35 030 to 036
  and 072, 073, SCRUM-36 040 to 044 and 071, SCRUM-38 060 to 063). Store database cases stay in
  [db.md](db.md); TC-SDB-010 to 014 are cited here as seed text only.

## OPEN QUESTIONS

Numbered for the whole store catalog; the [Store UI catalog](store-ui.md) uses the same numbers.
Each question names the design that raised it (A, B, C = SCRUM-29, 33, 37, question number).

All store cases:

1. Q1: Jira labels the read-only cases `env-dev-prod`; rule 01 makes every spec dev-only. Is a
   read-only prod variant wanted (approved prod runs only)? (A9, B12)
2. Q2: what is the `delay` cap, is a value above it clamped or rejected, and what timing tolerance is
   acceptable on a shared server? (B11, C9)
3. Q3: the `automated` labels and answer-key paths (`tests/store-ui/`, `tests/store-products/`,
   `tests/store-checkout/`, `tests/store/api/store-edge.spec.ts`, the coverage audit) refer to the
   course's own suite, not this repo. May it be read? (A, SCRUM-29 note Q3; B14; C5)
4. Q4: the formal `responses` list only `200`. Does description text count as documented, and which
   error statuses and bodies should be asserted? (B2, C1)

SCRUM-29 (UI): Q5 to Q17, in the [Store UI catalog](store-ui.md#open-questions).

SCRUM-33:

18. Q18: `pageSize=51`: clamped to 50 (Jira) or rejected (OAS `maximum: 50`)? (B1)
19. Q19: status and body for a bad category, `page=0` and an unknown slug; which field carries
    `not_found`? (B2)
20. Q20: envelope field names, the `totalPages` rule, product and variant field names. (B3)
21. Q21: every seeded product is active, so "active only" cannot fail today. Is an inactive fixture
    planned, or is the check accepted as is? (B4)
22. Q22: `total=8` is fixed in Jira, but row counts drift. Fail or record as drift? Same for the
    in-stock count and the tee's stock. (B5)
23. Q23: are `min_price` and `max_price` inclusive? What about min > max, negative or non-integer
    values (question only)? (B6)
24. Q24: does "hoodie" appear in another product's description; is search case-insensitive? (B7)
25. Q25: expected first items for `name` and `newest`; default order; bad `sort` value. (B8)
26. Q26: which seeded products are in each category? (B9)
27. Q27: does `in_stock=true` keep a partly sold-out product (hoodie)? What does `in_stock=false` do?
    (B10)
28. Q28: a page beyond the last page: empty items or an error? (B13)

SCRUM-37:

29. Q29: confirm the codes `payment_declined` and `gateway_error` (Jira only) and the error body
    shape; the code and body of the unknown-order 404. (C2, C row TC-SAPI-056)
30. Q30: the description says TC-SAPI-050..057; is TC-SAPI-070 part of this task? (C3)
31. Q31: should TC-SAPI-070 assert today's behaviour or report it as a defect? Mentor. (C4)
32. Q32: is stock reduced by `order_items.qty` per variant? Seed TC-SDB-010 says "reduced by qty".
    What if stock dropped below qty before paying (question only)? (C6)
33. Q33: on a decline or a gateway error, is a payment row written, and what is the cart status? Seed
    TC-SDB-013 says a decline writes `payments.status=declined`; the 502 case is open. (C7)
34. Q34: valid CVV length, expiry format, the reference month for "past", the message format; is
    anything saved after an expiry or CVV rejection? (C8)
35. Q35: two pays at once: which status does the second request get? (C10)
36. Q36: how are "no payment row" and stock observed: the API (`GET /api/orders/{id}`, product
    detail) or a read-only count allowed by rule 40? (C11)
37. Q37: outside the wording, question only: paying a `failed` order; retrying after a 502; card
    number without spaces; non-integer `orderId`; missing required body fields. (C12)
38. Q38: pay runs move order, payment and stock values off the seed; should each run be recorded so
    drift reports can be explained? (C13)

Week 4 plan (2026-11-07; mentor message items M1 to M6):

39. Q39: cart response field names: the line id, the discount and the total. Is the cart total always
    subtotal minus discount, with shipping and tax 0? Should a line's unit price equal the product
    price (Q15)? Or is STORE-SPEC an approved source for these? (M2)
40. Q40: TC-SAPI-041: SCRUM-84 says 422 with messages for missing fields; the SCRUM-36 description
    says "Fastify schema 400 vs app 422". Which status? (M4)
41. Q41: applying the same coupon twice: what is the rule for the discount? Is the missing
    TC-SAPI-035 that case? (M3)
42. Q42: no API deletes a cart. May each cart test leave its own empty guest cart row after deleting
    its lines and clearing its coupon? (M1)
43. Q43: checkout allocation for TC-SAPI-050 to 053: one variant, at most 4 checkouts per run, an
    expiry and a run limit, with acceptance that 4 orders and 3 payments stay per run and one unit
    of stock is used. Is `qa-auto-…@example.test` with placeholder shipping acceptable? (M5; M6 is
    Q36)

Answers recorded 2026-11-07 ([M11](../product/store-api.md)); the questions above stay
as asked:

- Q15: yes, a new line copies the product price (item 4). Q19 (store): `error` for the code, `message`
  for the text, `messages` for checkout validation and invalid cards, `code` for schema 400 (item 6).
- Q22: record the total against the seeded 8 as drift; do not fail on it (item 11). Q36: own orders
  through `GET /api/orders/{id}` (`{ order, items, payment }`), stock through product detail; cart
  status only indirectly or through an approved read-only database query (item 10).
- Q39: `{ cart }`, `cart.items[].item_id`, `discount_cents`, `total_cents`, `unit_price_cents`,
  `line_total_cents`; total = max(0, subtotal − discount); shipping and tax 0 (items 3, 4).
- Q40: `{}` → 400 schema; invalid email or blank shipping → 422 `validation_error` (item 7).
- Q41: re-application returns 200 with code, discount and total unchanged; keep TC-SAPI-074;
  TC-SAPI-035 is percentage-discount rounding in the reference catalog, not reused (item 5).
- Q42: yes, own empty guest-cart rows may remain after cleanup (item 2).
- Q43: budget accepted (one run, at most 4 checkouts, one payment attempt each, no retries; 4 orders,
  3 payments, 1 unit of stock) (item 8). Follow-up: Deterministic Cap, One Size, variant 11, through
  2026-12-31. **Exclusivity still to be confirmed**: exact stock comparisons stay pending.
  Decided 2026-11-08 ([M12](../product/store-api.md)): the stock effects stay recorded, not asserted; no further checkout
  run; the allocation stays closed. Exclusivity is no longer needed.

44. Q44: the reply's list of expected payment outcomes (item 10) is missing from the text as received.
    What are the expected order status, payment row status and stock effect for the approved, declined
    and gateway-error outcomes? Asked together with the exclusive variant and expiry (Q43).
    Answered 2026-11-07 in the follow-up: 050 200, `paid`, `approved`, stock − 1; 051 402, `failed`,
    `declined`, no stock change from the payment; 052 502, `pending`, `error`, no stock change from the
    payment; 053 422, `pending`, no payment row (`payment: null`), no stock change.
