---
id: product-store-api
type: source
---

# Store API: cart, coupons, checkout and payments

Product facts and shared-data agreements for the store API on dev, as confirmed by the site's maintainers
on 2026-11-07 and 2026-11-08. The numbered items keep fixed numbers: code and catalog rows cite them as
"`store-api.md` item N" (for example the gates in `tests/support/store.ts`). Open questions they answer are
in the [Store API catalog](../test-catalog/store-api.md#open-questions): Q15, Q19, Q22, Q36, Q39 to Q44.

## 1. Sources

These items are the approved source for the store API tests; the full planning specification is not
needed. The confirmed rules: one coupon per cart or order, zero shipping and tax, the totals calculation in
item 4, and retained empty guest carts after cleanup (item 2).

## 2. Guest-cart cleanup (Q42)

- Each test may leave its own empty guest-cart row on dev; there is no cart delete API.
- Cleanup deletes the test's lines and clears its coupon with `POST /api/cart/coupon` and `{"code":""}`,
  also after an assertion failure. Open carts left by declined, gateway-error and rejected-card scenarios
  are cleaned the same way.
- An approved payment closes its cart as ordered; that cart and its records remain.

## 3. Cart response fields (Q39)

The response is wrapped in `{ "cart": {...} }`: lines in `cart.items`, line ID `cart.items[].item_id`,
discount `cart.discount_cents`, total `cart.total_cents`, line amounts `unit_price_cents` and
`line_total_cents`.

## 4. Arithmetic and price (Q39, Q15)

All amounts are integer cents: `line_total_cents = qty × unit_price_cents`; the subtotal is the sum of the
line totals; `total_cents = max(0, subtotal_cents − discount_cents)`. Shipping and tax are zero. A new line
copies the product's `price_cents` when it is added.

## 5. Coupon reapplication (Q41)

Applying the same valid coupon twice returns 200 and leaves the code, discount and total unchanged, as long
as the cart contents are unchanged. Discounts do not stack; another valid coupon replaces the current one.
Reapplication is TC-SAPI-074; TC-SAPI-035 means percentage-discount rounding elsewhere and is not reused.

## 6. Error assertions (Q19)

Assert specific fields, never search the whole body. Application errors carry the code in `body.error` and
usually the text in `body.message`: expired and invalid coupons both use `error: "coupon_error"`, with
"This coupon has expired." or "Invalid coupon code.". Checkout validation and invalid-card responses use
`body.messages`, an array. Schema failures: assert HTTP 400 and `body.code === "FST_ERR_VALIDATION"`, never
the full framework message.

## 7. Checkout: 400 versus 422 (Q40)

Missing required properties, including `{}`, give 400 at schema validation. When every required property is
present as a string but a shipping value is blank or the email invalid, application validation gives 422,
`error: "validation_error"` and a `messages` array. These are separate inputs. Shipping validation checks
only non-empty text; there is no country or postal-code format rule.

## 8. Checkout allocation (Q43, Q44)

- Checkouts create real orders on the shared dev site, so they run only inside an agreed allocation: one
  run, at most four successful checkout creations, one payment attempt per order, no automatic retries,
  quantity one each. Accepted effects: four orders and their items, three payment rows and one unit of
  stock.
- The allocation is the Deterministic Cap, One Size (variant 11), valid through 2026-12-31. It is not
  confirmed as exclusive to this project, so stock effects are recorded before and after, never asserted.
  Running serially keeps this project's tests apart; it does not protect against other users.
- Status: the run took place on 2026-11-07 (orders 3274 to 3277; variant 11 stock 1,000,000 → 999,999 on
  the approved payment only) and its results were reviewed on 2026-11-08: the stock effects stay recorded,
  not asserted, and the allocation is closed (`usedOn: '2026-11-07'` in `tests/support/store.ts`). No
  further API checkout run is planned.

## 9. Synthetic customer data

`qa-auto-<run>-<test>@example.test` and clearly synthetic shipping details are used. The run identifier is
unique, and the resulting order IDs are recorded for traceability.

## 10. Observing payment outcomes (Q36)

- `GET /api/orders/{id}` returns `{ order, items, payment }` for the project's own orders. Stock is read
  through `GET /api/products/{slug}`, for the allocated variant, before and after.
- Expected outcomes, each on a fresh pending order with quantity 1:
  - TC-SAPI-050 approved: HTTP 200, order paid, payment approved, stock decreases by 1.
  - TC-SAPI-051 declined: HTTP 402, order failed, payment declined, no stock change from the payment.
  - TC-SAPI-052 gateway error: HTTP 502, order pending, payment error, no stock change from the payment.
  - TC-SAPI-053 undocumented card: HTTP 422, order pending, `payment: null`, no stock change; the order
    created during setup remains.
- The cart API does not expose a cart status. An approved read-only database query on the captured cart
  ID can assert `status = 'ordered'`. The API-only alternative checks that the order references the
  original cart and that the next cart request returns a different, empty cart; it is indirect evidence,
  and that request leaves another empty cart.

## 11. Product count (Q22)

Shared data drifts: a difference from the seeded total of eight products is recorded with its date and
value, not failed on by itself. The documented response structure and pagination consistency are still
asserted; a missing required product or a wrong fixed price is a separate issue.

## 12. Deferred cases

Extra cases may stay deferred, marked deferred / not implemented and kept apart from blocked required cases,
as long as the coverage map shows every required behaviour. Successful order creation and its totals are
checked inside the payment scenarios, so a separate TC-SAPI-040 test is not needed.

## 13. Test count

Each meaningful application scenario is counted once, without retries, browser repetitions, framework
checks or optional database checks.
