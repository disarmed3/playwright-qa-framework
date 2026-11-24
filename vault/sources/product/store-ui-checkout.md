---
id: product-store-ui-checkout
type: source
---

# Store UI checkout: allocation, paid and declined journeys

Product facts and the shared-data agreement for the two browser checkout journeys, TC-SUI-031 (paid) and
TC-SUI-032 (declined), as confirmed by the site's maintainers on 2026-11-12. Open questions they answer
(Q47, Q49) are in the [Store UI catalog](../test-catalog/store-ui.md). The API checkout allocation
([store-api.md](store-api.md), item 8) stays closed; this one is separate.

## Allocation for the UI journeys (Q47)

- One run on dev only, for TC-SUI-031 and TC-SUI-032: the Deterministic Cap, One Size (`deterministic-cap`,
  variant 11), reserved for this project, valid until 2026-11-18.
- At most 2 orders: 1 approved (test card 4242 4242 4242 4242) and 1 declined (4000 0000 0000 0002), one
  attempt each, `--retries=0`, `--workers=1`.
- Both orders stay on dev. The paid order uses 1 unit of stock; the failed order is identified by its unique
  test email.
- The limit counts orders, not runs: an order exists only after Place order is pressed with valid fields
  and a test card. Before that press, a failed run may be fixed and repeated. After it, that journey is not
  repeated, even if an assertion failed, and the result is recorded.
- After the run, both tests are skipped again with the reason "one-run allocation used on <date>".
  Teardown removes the declined cart's line.

## Paid journey

- One cap with coupon SAVE10. The checkout summary shows subtotal $20.00, discount −$2.00 (a Unicode minus,
  U+2212) and total $18.00 (`summary-subtotal`, `summary-discount`, `summary-total`). These agree with the
  seed price of 2000 cents and SAVE10 = 10 % ([starting data](../database/starting-data.md)).
- The browser is redirected to `/orders/{id}`, the same page as for API orders: `order-confirmation`
  (heading "Thank you! 🎉"), `order-number` `CM-2026-` plus 6 digits, `order-status` "paid",
  `payment-status` "Payment: approved · card ••••4242", `order-total` "$18.00". The discount row has no
  test ID, so the discounted total is checked on `order-total` only.
- `payment-status` uses `·` and `••••`; copy them exactly or use `toContainText`.

## Declined journey (Q49)

- The page stays on `/checkout`: the form post returns HTTP 422 and the server renders the checkout page
  again, with no redirect.
- The error is one list item in `form-errors`: "Your card was declined. (Use 4242 4242 4242 4242 for an
  approved test payment.)". The exact text is not a requirement: assert that `form-errors` contains "Your
  card was declined.", never search the whole page for "declined".
- There is no `order-confirmation` and no order number. The order summary still lists the cap, and `/cart`
  still has the line. Card number and CVV are emptied; the shipping fields keep their values.

## Differences from observations (open, not overwritten)

- `order-status`: "paid" here, while a read-only observation of order 3274 on 2026-11-08 showed "Paid";
  possibly CSS capitalisation (rendered versus DOM text). Not checked.
- `form-errors` is documented here but has never been observed on dev; rule 10 asks for an observed ID,
  and only the declined order itself can show it
  ([verified test IDs](../../wiki/01-framework/verified-test-ids.md)).
