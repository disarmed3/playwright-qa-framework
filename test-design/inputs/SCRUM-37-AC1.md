# Input — SCRUM-37 AC1: mock-payment matrix and idempotency

Prepared 2026-10-31 (Week 3 Task 08B) for `/design-tests`. Sources were found through
[vault/\_map.md](../../vault/_map.md) (Sources). Key resolution reuses Task 03: course keys match, no
key map; `SCRUM-37` and its subtasks were read in Jira on 2026-10-31. No fresh Jira read is needed for
this input. Do not call Jira.

## Acceptance criterion (exact, from the requirement note)

SCRUM-37 has no separate acceptance-criteria field. AC1 is the task's description and its cases, as
returned:

> TC-SAPI-050..057. Luhn + test-card outcomes, idempotent pay, stock decrement on approved. Answer-key ref: tests/store-checkout/\*.

> TC-SAPI-050 — pay 4242 -> 200; order paid; payment approved; stock decremented; cart -> ordered

> TC-SAPI-051 — pay 4000…0002 -> 402 payment_declined; order failed; stock unchanged

> TC-SAPI-052 — pay 4000…0119 -> 502 gateway_error; order stays pending

> TC-SAPI-053 — any undocumented card (even Luhn-valid) -> 422 card_invalid; no payment row written; order stays pending

> TC-SAPI-054 — bad card format / past expiry / short CVV -> 422 card_invalid with messages

> TC-SAPI-055 — idempotency: paying an already-paid order -> 200, existing payment, no double stock decrement

> TC-SAPI-056 — pay a non-existent order id -> 404

> TC-SAPI-057 — ?delay= on pay respected and capped

> TC-SAPI-070 — The pay endpoint requires no authentication or ownership

## Run rules for this input (Task 08B)

- Label prefix **C**: New rows are `C-1`, `C-2`, …, never `NEW-n` and never a `TC-` number.
- Covered cites only IDs in `vault/sources/test-catalog/` whose test asserts the row's Expected. The
  Jira case IDs above are source IDs, not catalog IDs: a Jira case with no implemented test is a Gap
  row that names it.
- TC-SAPI-070 pins behaviour its own ticket calls "arguably a defect". Design it, but its Expected is a
  question for the mentor, never an expected pass.
- Other designers run at the same time on SCRUM-29 and SCRUM-33. Read only the paths listed below; do
  not open or search any other `test-design/inputs/` file or any `test-design/SCRUM-*/` folder, and do
  not use another key's proposals.

## Sources to read

| Path                                               | Sections                                                                                                                            | Why                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `vault/sources/jira/SCRUM-37.md`                   | Facts (incl. the `SCRUM-162` description); Comparison; Questions                                                                    | requirement and its open questions       |
| `evidence/week3-task08b-note.md` (tag `week6-end`) | Facts: Jira reads (2026-10-31)                                                                                                      | how the issues were read; key resolution |
| `test-design/contract/openapi-dev-2026-10-30.json` | `paths` → `/api/checkout/{orderId}/pay` (`post`, `parameters`, `requestBody`), `/api/checkout` (`post`), `/api/orders/{id}` (`get`) | current contract (see below)             |
| `vault/wiki/01-framework/db-map.md`                | Cart and checkout → `carts`, `orders`, `order_items`, `payments`; Store catalogue → `product_variants`; Relationships               | columns and constraints (metadata only)  |
| `vault/sources/database/starting-data.md`          | Mentor's answers (2026-10-30); Seed facts                                                                                           | stock values and drift rules             |
| `vault/sources/test-catalog/`                      | Grep for `TC-SAPI-05`, `TC-SAPI-070`; `db.md` rows TC-SDB-002, 003                                                                  | catalog IDs that could be Covered        |
| `tests/`                                           | Grep for `TC-SAPI-05`, `TC-SAPI-070`, `/pay`                                                                                        | implemented tests, if any                |

Contract snapshot: dev `https://dev.ai-orchestration-courses.com/api/docs/json` (base address from
`env/target.ts`), read 2026-10-30 21:23 UTC, HTTP 200, 16,335 bytes, SHA-256
`8f2ef6955633222799ab685067bd0c44d32066a6ce8ee4298ce6ddc680c83350`. Local and untracked; it holds
example login values that must not be copied.

## Known unknowns for this criterion

Carried from the sources above; add any others you find, and keep them as questions.

- Corrected 2026-10-31, after run `t08b-20261031-r1` read this input (SHA-256 at launch
  `3eeac43fcb2b…`): these two points first said the contract's only card was the 4242 one and that
  402, 422 and 502 came from Jira alone. The pay description gives all three test cards and 422
  `card_invalid`; see `vault/sources/jira/SCRUM-37.md`, Questions.
- Only `200` is in the formal `responses`; 404 and the codes `payment_declined` and `gateway_error`
  come from Jira alone.
- The description says TC-SAPI-050..057; the list also has TC-SAPI-070.
- Every case is `env-dev` and needs an order from cart and checkout (`SCRUM-34`, `SCRUM-36`): created dev
  data, stock changes on approval (rule 20, separate approval for a run). Stock is drift data.
- How "no payment row written" and "stock decremented" are observed (API or a read-only database check)
  is not stated.

Out of scope: cart and checkout behaviour themselves (`SCRUM-34`, `SCRUM-36`), orders authorization
(`SCRUM-38`), the store DB tasks (`SCRUM-39`…`41`), SCRUM-29, SCRUM-33 and every other issue; any
catalog change.
