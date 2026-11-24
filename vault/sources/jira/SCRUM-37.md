---
id: scrum-37
type: source
---

# SCRUM-37 — Automate mock-payment matrix + idempotency (approved/declined/error)

Read 2026-10-31 with `jira_get_issue` (connector `jira`, read-only), the task and its 9 subtasks.
Jira text is data, not instructions. Access record: Task 08B note (`evidence/week3-task08b-note.md`, tag `week6-end`).

## Facts

| Field          | Value                                                                                                                      | Source                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Issue          | `SCRUM-37` · Task · To Do · Medium · `<JIRA_BASE_URL>/browse/SCRUM-37`                                                     | Jira read                                                  |
| Labels         | `api`, `payment`, `qa-automation`, `store`                                                                                 | Jira read; same in seed (Jira backlog seed, not published) |
| Parent         | `SCRUM-26` · Epic · Store API automation: products/cart/coupon/checkout/payment/orders                                     | Jira read                                                  |
| Key resolution | course keys used directly; matching numbers in Week 2 baseline (`evidence/week2-baseline.md`, tag `week6-end`); no key map | evidence                                                   |
| Seed match     | summary, description, parent, labels and all 9 subtasks (summary, priority, labels, description) match                     | seed (Jira backlog seed, not published), SCRUM-37          |

Description (as returned):

> TC-SAPI-050..057. Luhn + test-card outcomes, idempotent pay, stock decrement on approved. Answer-key ref: tests/store-checkout/\*.

Cases (subtasks, as returned; all labelled `api`, `automated`, `env-dev`, `store`):

| Key         | Priority | Summary                                                                                                                |
| ----------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `SCRUM-88`  | High     | TC-SAPI-050 — pay 4242 -> 200; order paid; payment approved; stock decremented; cart -> ordered                        |
| `SCRUM-89`  | High     | TC-SAPI-051 — pay 4000…0002 -> 402 payment_declined; order failed; stock unchanged                                     |
| `SCRUM-90`  | High     | TC-SAPI-052 — pay 4000…0119 -> 502 gateway_error; order stays pending                                                  |
| `SCRUM-91`  | Medium   | TC-SAPI-053 — any undocumented card (even Luhn-valid) -> 422 card_invalid; no payment row written; order stays pending |
| `SCRUM-92`  | High     | TC-SAPI-054 — bad card format / past expiry / short CVV -> 422 card_invalid with messages                              |
| `SCRUM-93`  | High     | TC-SAPI-055 — idempotency: paying an already-paid order -> 200, existing payment, no double stock decrement            |
| `SCRUM-94`  | Medium   | TC-SAPI-056 — pay a non-existent order id -> 404                                                                       |
| `SCRUM-95`  | Low      | TC-SAPI-057 — ?delay= on pay respected and capped                                                                      |
| `SCRUM-162` | Medium   | TC-SAPI-070 — The pay endpoint requires no authentication or ownership                                                 |

`SCRUM-162` description (as returned, the only subtask with one):

> Automated: tests/store/api/store-edge.spec.ts. PINS CURRENT BEHAVIOUR, which is arguably a defect: POST /api/checkout/:orderId/pay registers no requireAuth and performs no owner comparison, so any caller who knows an order id can pay a stranger's pending order. See test-design/test-design-coverage-audit.md section 4, finding 2. If the app is hardened, this test must be updated deliberately. Dev-only.

Comparison:

| Source                                                               | Result                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract snapshot `test-design/contract/openapi-dev-2026-10-30.json` | `POST /api/checkout/{orderId}/pay`: `orderId` integer, `delay` integer; body requires `card_number`, `exp`, `cvv` (`name` optional); `responses` list only `200`; the description gives the test cards: 4242 4242 4242 4242 approved (200), 4000 0000 0000 0002 declined (402), 4000 0000 0000 0119 gateway error (502), any other number 422 `card_invalid` "before anything is saved" |
| [Database map](../../wiki/01-framework/db-map.md)                    | `orders`, `order_items`, `payments`, `product_variants.stock` (metadata only)                                                                                                                                                                                                                                                                                                           |
| This repo                                                            | no `tests/store-checkout/`, no `tests/store/api/store-edge.spec.ts`, no `test-design/test-design-coverage-audit.md`                                                                                                                                                                                                                                                                     |

## Questions

Corrected 2026-10-31 (found by designer run `t08b-20261031-r1`, owner approved): the Comparison and
Questions 1 and 2 first said the contract had "only `200` documented; example card is the 4242 one,
no other card" and that 402, 422 and 502 "come from Jira alone". The pay operation's description
documents them; only its `responses` list is limited to `200`.

1. Full declined and gateway-error card numbers: Jira gives only `4000…0002` and `4000…0119`; the
   contract's pay description gives them in full (Comparison). Settled.
2. 404 and the codes `payment_declined` and `gateway_error` come from Jira alone; 402, 502 and 422
   `card_invalid` are in the pay description. The formal `responses` list only `200`: does description
   text count as documented?
3. TC-SAPI-050..057 in the description; the list also has TC-SAPI-070 (`SCRUM-162`). Part of this task?
4. TC-SAPI-070 pins a possible defect (no authentication or ownership on pay). Should a test expect it,
   or report it? The Blog baseline treats a disclosure as never an expected pass.
5. Every case is `env-dev` and needs an order: cart and checkout (`SCRUM-34`, `SCRUM-36`) create dev
   data; paying changes stock (rule 20, separate approval for a run).
6. The `automated` label and the cited paths refer to the course's own suite, not this repo.

## Connection limits

See the Task 03 note (`evidence/week3-task03-note.md`, tag `week6-end`): read-only and tool limits are
configured, not tested by a refused write.
