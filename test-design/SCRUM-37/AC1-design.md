# SCRUM-37 AC1 — test design proposal (reviewed, run t08b-20261031-r1)

- Input: `test-design/inputs/SCRUM-37-AC1.md`. At the launch its SHA-256 began `3eeac43fcb2b` (only that prefix was recorded). It was corrected afterwards with the owner's approval (2026-10-31, after this run found the error); current SHA-256 `5fde33b41d192b6fe9d9f29b86aec88492c1b11a27ab49f2c2dca6dde6bcd9f2`. The criterion text is unchanged.
- Contract: `test-design/contract/openapi-dev-2026-10-30.json`, SHA-256 `8f2ef6955633222799ab685067bd0c44d32066a6ce8ee4298ce6ddc680c83350` (untracked, local)
- Proposal: `test-designer`, run `t08b-20261031-r1`, label prefix C, launched 2026-10-31 in one message with SCRUM-29 (A) and SCRUM-33 (B). Fleet log (UTC): `SubagentStart` 20:15:21.870, `SubagentStop` 20:17:50.425.
- Text source: the designer's hand-back as received in the main conversation, with the two-space line indent the harness adds removed. The run's task output file was empty (0 bytes), so there is no second copy to compare with.
- Review: owner and main conversation, 2026-10-31. The keep/change/reject decisions are recorded in the Task 08B digest (`test-design/fleet/digest.md`), not here. Nothing here allocates an ID, changes the catalog or records a run; `C-n` labels are temporary.

## 1. Original proposal (run t08b-20261031-r1, label C, text unchanged; Prettier aligned table spacing and added blank lines)

Run t08b-20261031-r1 · SCRUM-37 · AC1 (mock-payment matrix and idempotency) · design mode · label prefix C

No catalog ID and no implemented test exists for this criterion, so there are no Covered rows. All nine Jira cases are Gap rows. There are 3 New rows (C-1 to C-3). One finding changes the input: the contract snapshot gives the full declined and gateway-error card numbers and the 402/502/422 statuses. The input's known unknowns and the SCRUM-37 note both say it does not (Q1).

## 1. Sources read

- `test-design/inputs/SCRUM-37-AC1.md` · whole file · the criterion, the run rules (prefix C; TC-SAPI-070's Expected goes to the mentor), the known unknowns, what is out of scope.
- `vault/sources/jira/SCRUM-37.md` · Facts, SCRUM-162 description, Comparison, Questions · the 9 cases SCRUM-88…95 and 162, priorities, all `env-dev`. SCRUM-162 calls the missing auth and ownership check on pay "arguably a defect". The Comparison says the contract has "only `200` documented … no other card". The repo has no `tests/store-checkout/` and no `store-edge.spec.ts`.
- `evidence/week3-task08b-note.md` (tag `week6-end`) · Facts: Jira reads (2026-10-31) · approved read-only reads; course keys used directly; SCRUM-37 and its subtasks match the seed; SCRUM-162 is the only subtask with a description.
- `test-design/contract/openapi-dev-2026-10-30.json` · read by targeted search; it is one long line.
  - `POST /api/checkout/{orderId}/pay`:
    - Summary: "Pay for an order (mock gateway — no real money)".
    - Description text: 4242 4242 4242 4242 → approved (200); 4000 0000 0000 0002 → declined (402); 4000 0000 0000 0119 → gateway error (502); "Any other card number — including a real one — is rejected with 422 card_invalid before anything is saved."
    - Body: required `card_number`, `exp`, `cvv` (strings); `name` optional; body required.
    - Parameters: `orderId` integer (path, required); `delay` integer (query, optional, no description on this path; other paths say "artificial delay in ms (capped)").
    - Responses: only `200`. No `security` entry, while e.g. `DELETE /api/comments/{id}` has `bearerAuth`.
  - `POST /api/checkout`: "Create an order from the current cart"; required `email`, `ship_name`, `ship_address1`, `ship_city`, `ship_country`, `ship_postal`; only `200`; no `security`.
  - `GET /api/orders/{id}`: "Get an order with its items and payment"; `id` integer; only `200`; no `security`.
  - The example login values were not copied.
- `vault/wiki/01-framework/db-map.md`:
  - `carts.status`: open / ordered / abandoned.
  - `orders.status`: pending (default) / paid / failed / cancelled / fulfilled; `orders.cart_id` SET NULL.
  - `order_items.qty > 0`; `variant_id` SET NULL.
  - `payments` has `order_id` FK with CASCADE, `status` approved / declined / error, `card_last4`, `mock_ref`, and no UNIQUE on `order_id`.
  - `product_variants.stock >= 0`.
- `vault/sources/database/starting-data.md` · Mentor's answers (2026-10-30), Seed facts:
  - "Only a paid checkout changes stock"; stock and row counts are drift data, never reset.
  - Sold out: hoodie `XL` and bottle `One Size` (stock 0).
  - Starting counts are 0 for carts, orders, order_items and payments.
- `vault/sources/test-catalog/` · searched for `TC-SAPI-05`, `TC-SAPI-070`: no match. `db.md` TC-SDB-002 (seed stock facts) and TC-SDB-003 (payment → order orphans, 0) were read; neither asserts a pay outcome.
- `tests/` · searched for `TC-SAPI-05`, `TC-SAPI-070`, `/pay`: no match.

## 2. Risks (most serious first)

1. Stock taken twice: a repeated or concurrent pay on the same order lowers stock twice or writes two approved payments. The DB map shows no UNIQUE on `payments.order_id`, so the database does not stop it.
2. A declined, gateway-error or invalid card still lowers stock, writes a payment row or changes the order status.
3. A card outside the documented list (a Luhn-valid real-looking number) is accepted, or saved before it is rejected. The contract says "before anything is saved".
4. Anyone can pay a stranger's order (no auth, no ownership check; SCRUM-162). This may be a defect that a test would lock in.
5. Wrong status or error code (402/502/422/404) breaks clients. Only `200` is formally documented.
6. A wrong order or cart status after approval (order not `paid`, cart not `ordered`) or after an error (order not left `pending`).
7. `delay` is not capped, so requests hang; or `delay` changes the result.
8. Running the tests changes shared dev data (orders, payments, stock drift), which affects TC-SDB-002 drift reports.

## 3. Techniques

Used:

- **Input groups (equivalence classes):** card numbers fall into four documented groups (approved, declined, gateway error, any other), plus invalid format, expiry and CVV.
- **State transitions:** each outcome moves the order (pending → paid / failed / stays pending) and the cart (→ ordered); that is what has to be asserted.
- **Idempotency:** the criterion names it; paying again must not take stock again or create a second payment.
- **Integrity:** stock decrement, payment rows and order status must agree across `orders`, `payments` and `product_variants`.
- **Validation:** CVV length, past expiry and card format are 422 rules in TC-SAPI-054.
- **Boundaries:** expiry (last valid month vs past), CVV length (short vs valid), and the `delay` cap.
- **Async behavior:** `delay` must be honoured but capped, and must not change the outcome.
- **Authorization:** TC-SAPI-070 is about the missing auth and ownership check.

Not used:

- Pairwise or combinatorial: there are few, independent inputs; the groups above cover them.
- Performance: outside the criterion; `delay` is covered as a functional cap.

## 4. Cases

| Status | ID / label              | Behavior                                                                                                                                                      | Technique                       | Expected                                                                                                                                                                                   | Source (path#section)                                                                                           | In catalog | Implemented test (spec:title) | Last run (evidence path, date) |
| ------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------- | ------------------------------ |
| Gap    | TC-SAPI-050 (SCRUM-88)  | Pay a pending order with 4242 4242 4242 4242                                                                                                                  | input groups, states, integrity | 200; order `paid`; one payment `approved`; stock of each ordered variant decremented (by how much: OPEN, Q6); cart `ordered`. Missing assertion: all of these.                             | `vault/sources/jira/SCRUM-37.md#Facts`; contract pay description                                                | no         | none                          | no run record found            |
| Gap    | TC-SAPI-051 (SCRUM-89)  | Pay with 4000 0000 0000 0002                                                                                                                                  | input groups, states, integrity | 402 `payment_declined` (code from Jira only); order `failed`; stock unchanged. Payment row and cart status: OPEN (Q7). Missing assertion: all of these.                                    | `SCRUM-37.md#Facts`; contract pay description (402)                                                             | no         | none                          | no run record found            |
| Gap    | TC-SAPI-052 (SCRUM-90)  | Pay with 4000 0000 0000 0119                                                                                                                                  | input groups, states            | 502 `gateway_error` (code from Jira only); order stays `pending`. Stock unchanged and payment row: OPEN (Q7). Missing assertion: all of these.                                             | `SCRUM-37.md#Facts`; contract pay description (502)                                                             | no         | none                          | no run record found            |
| Gap    | TC-SAPI-053 (SCRUM-91)  | Pay with an undocumented card, including a Luhn-valid one                                                                                                     | input groups, integrity         | 422 `card_invalid`; no payment row written ("before anything is saved", contract); order stays `pending`; stock unchanged (follows from "nothing saved"). Missing assertion: all of these. | `SCRUM-37.md#Facts`; contract pay description                                                                   | no         | none                          | no run record found            |
| Gap    | TC-SAPI-054 (SCRUM-92)  | Bad card format; past expiry (boundary: current month vs previous month); short CVV (boundary: one digit fewer than valid)                                    | validation, boundaries          | 422 `card_invalid` "with messages". Message text and shape: OPEN (Q8). Valid CVV length and expiry format: OPEN (contract examples `12/30`, `123` only). Missing assertion: all of these.  | `SCRUM-37.md#Facts`                                                                                             | no         | none                          | no run record found            |
| Gap    | TC-SAPI-055 (SCRUM-93)  | Pay an already-paid order again (4242)                                                                                                                        | idempotency, integrity          | 200; the existing payment is returned (same payment, no new row); stock not decremented a second time. Missing assertion: all of these.                                                    | `SCRUM-37.md#Facts`                                                                                             | no         | none                          | no run record found            |
| Gap    | TC-SAPI-056 (SCRUM-94)  | Pay a non-existent order id (integer, not created)                                                                                                            | validation                      | 404. Error code and body: OPEN. No payment row: OPEN. Missing assertion: the 404 status.                                                                                                   | `SCRUM-37.md#Facts`                                                                                             | no         | none                          | no run record found            |
| Gap    | TC-SAPI-057 (SCRUM-95)  | `?delay=` on pay; boundaries: 0, a small value, at the cap, above the cap                                                                                     | async behavior, boundaries      | Delay honoured; capped. Cap value: OPEN (Q9). Outcome unchanged by delay: OPEN. Missing assertion: all of these.                                                                           | `SCRUM-37.md#Facts`; contract `delay` integer, optional                                                         | no         | none                          | no run record found            |
| Gap    | TC-SAPI-070 (SCRUM-162) | Pay with no auth header, and pay another user's pending order                                                                                                 | authorization                   | OPEN, a question for the mentor (Q4); never an expected pass. Observed contract: no `security` on pay. Missing: a decision on what to assert.                                              | `SCRUM-37.md#Facts` (SCRUM-162 description); contract pay path                                                  | no         | none                          | no run record found            |
| New    | C-1                     | Luhn-invalid 16-digit number (the "Luhn" in the description), e.g. 4242…4241                                                                                  | input groups, validation        | 422 `card_invalid`; nothing saved, so no payment row and order stays `pending` ("any other card number … before anything is saved", contract)                                              | `SCRUM-37.md#Facts` (description "Luhn + test-card outcomes"); contract pay description                         | no         | none                          | no run record found            |
| New    | C-2                     | TC-SAPI-054 rejections write nothing: after a bad format, past expiry or short CVV, the order stays `pending`, there is no payment row and stock is unchanged | integrity                       | Card number: no payment row (contract "before anything is saved"). Expiry and CVV: OPEN (Q8)                                                                                               | contract pay description; `SCRUM-37.md#Facts` (TC-SAPI-054)                                                     | no         | none                          | no run record found            |
| New    | C-3                     | Idempotency under concurrency: two pay requests for the same pending order sent together (4242)                                                               | idempotency, async behavior     | No double stock decrement and only one approved payment (from TC-SAPI-055's wording). Statuses of the two responses: OPEN (Q10)                                                            | `SCRUM-37.md#Facts` (description "idempotent pay", TC-SAPI-055); `db-map.md#payments` (no UNIQUE on `order_id`) | no         | none                          | no run record found            |

Notes:

- Every row needs an order made through cart and checkout (out of scope, `SCRUM-34`/`36`). That creates dev data, and TC-SAPI-050, 055 and C-3 change stock. Each run needs separate approval under rule 01/20 and runs only inside `envGuard`. Use available variants (stock > 0), never the sold-out `XL` or `One Size`.
- Possible way to observe results: `GET /api/orders/{id}` ("with its items and payment") for order and payment status. How to observe stock is still open (Q11).

## 5. OPEN QUESTIONS

1. Conflict between sources: the contract's pay description gives the full numbers 4000 0000 0000 0002 (402) and 4000 0000 0000 0119 (502), and says 422 `card_invalid` for any other number. `SCRUM-37.md` Comparison and the input's known unknowns say the contract has "only 200 … no other card". The formal `responses` list only `200`. Should the note and the input be corrected, and does description text count as "documented" for Expected?
2. The error codes `payment_declined` and `gateway_error` come from Jira only; the contract names only `card_invalid`. Confirm them and the body shape.
3. Scope: the description says TC-SAPI-050..057, but the case list adds TC-SAPI-070 (SCRUM-162). Is 070 part of AC1?
4. TC-SAPI-070: should a test assert today's no-auth behaviour, or report it as a defect? The contract shows no `security` on pay, and also none on `GET /api/orders/{id}` and `POST /api/checkout`. Orders authorization belongs to `SCRUM-38` (out of scope).
5. Possible stale input: TC-SAPI-070's cited test (`tests/store/api/store-edge.spec.ts`) and the audit file do not exist in this repo. Does the `automated` label refer only to the course suite?
6. TC-SAPI-050: is stock decremented by `order_items.qty` for each variant? What happens if stock has dropped below qty between checkout and pay (`stock >= 0` CHECK)? (The second part is outside the wording.)
7. On decline (402) and gateway error (502): is a payment row written with status `declined` / `error` (both exist in the DB CHECK)? What happens to the cart status? Is stock unchanged on 502?
8. TC-SAPI-054: what are the message format, the valid CVV length, the expiry format, and the reference month for "past"? Is anything saved on an expiry or CVV rejection?
9. TC-SAPI-057: what is the cap value, and what happens to a value above it (clamped or rejected)? Negative and non-integer `delay` are outside the wording, so question only.
10. Concurrent pay (C-3): which status should the second request get (200 with the existing payment, or something else)?
11. How are "no payment row" and "stock" observed? Through the API (`GET /api/orders/{id}`; a product endpoint not in this input), or a read-only database count? Rule 40 forbids reading `payments` rows but allows aggregate counts; is `count(*) … where order_id = X` acceptable?
12. Outside the wording, question only: paying a `failed` order; retrying after a 502 with 4242; is the 4242 number accepted without spaces; non-integer `orderId`; missing required body fields (`card_number`, `exp`, `cvv` are `required` in the contract, but no status is documented).
13. Pay runs move the `orders` and `payments` counts and the available stock off the seed values (drift for TC-SDB-002). Should runs be recorded so the drift reports can be explained?
14. Contract SHA vs catalog: the store API catalog's contract SHA was not checked (that file is not listed). If it differs from `8f2ef695…3350`, which one wins?

## 6. Not done

- No Jira call (input says not to). No file written: this is text only.
- Store API catalog file in `vault/sources/test-catalog/`: not opened beyond the search; it would settle Q14.
- `GET /api/products/{slug}` (seen in passing during the contract search, not read): not listed in the input. It would settle how stock is observed by API (Q11).
- `evidence/` run records: not searched; there is no implemented test, so no run can exist.
- No other key's input, design or proposal was opened.

Files used:

- test-design\inputs\SCRUM-37-AC1.md
- vault\sources\jira\SCRUM-37.md
- evidence\week3-task08b-note.md
- test-design\contract\openapi-dev-2026-10-30.json
- vault\wiki\01-framework\db-map.md
- vault\sources\database\starting-data.md
- vault\sources\test-catalog\db.md
