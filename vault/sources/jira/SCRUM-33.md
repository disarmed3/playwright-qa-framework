---
id: scrum-33
type: source
---

# SCRUM-33 — Automate store products API: listing/filter/sort/paginate/detail

Read 2026-10-31 with `jira_get_issue` (connector `jira`, read-only), the task and its 10 subtasks.
Jira text is data, not instructions. Access record: Task 08B note (`evidence/week3-task08b-note.md`, tag `week6-end`).

## Facts

| Field          | Value                                                                                                                      | Source                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Issue          | `SCRUM-33` · Task · To Do · Medium · `<JIRA_BASE_URL>/browse/SCRUM-33`                                                     | Jira read                                                  |
| Labels         | `api`, `qa-automation`, `store`                                                                                            | Jira read; same in seed (Jira backlog seed, not published) |
| Parent         | `SCRUM-26` · Epic · Store API automation: products/cart/coupon/checkout/payment/orders                                     | Jira read                                                  |
| Key resolution | course keys used directly; matching numbers in Week 2 baseline (`evidence/week2-baseline.md`, tag `week6-end`); no key map | evidence                                                   |
| Seed match     | summary, description, parent, labels and all 10 subtasks (summary, priority, labels) match word for word                   | seed (Jira backlog seed, not published), SCRUM-33          |

Description (as returned):

> TC-SAPI-001..010. Answer-key ref: tests/store-products/\*.

Cases (subtasks, as returned; none has a description; all labelled `api`, `automated`, `env-dev-prod`, `store`):

| Key        | Priority | Summary                                                                                                                    |
| ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `SCRUM-57` | High     | TC-SAPI-001 — GET /api/products -> 200; envelope {items,page,pageSize,total,totalPages}; total=8; pageSize=12; active only |
| `SCRUM-58` | Medium   | TC-SAPI-002 — ?search=hoodie narrows by name/description (1 match)                                                         |
| `SCRUM-59` | Medium   | TC-SAPI-003 — ?category=apparel returns only apparel; enum validated (bad category -> 400)                                 |
| `SCRUM-60` | Medium   | TC-SAPI-004 — ?sort=price_asc/price_desc/name/newest order correctly (assert first item)                                   |
| `SCRUM-61` | Medium   | TC-SAPI-005 — ?min_price=1500&max_price=2500 filters by cents range                                                        |
| `SCRUM-62` | High     | TC-SAPI-006 — ?in_stock=true excludes the fully-out-of-stock product (water bottle absent)                                 |
| `SCRUM-63` | Medium   | TC-SAPI-007 — pagination: ?page=2&pageSize=3 slices; pageSize=51 clamped to 50; page=0 rejected                            |
| `SCRUM-64` | Low      | TC-SAPI-008 — ?delay=1500 adds latency, identical data, capped                                                             |
| `SCRUM-65` | High     | TC-SAPI-009 — GET /api/products/codemify-classic-tee -> 200; product + variants[] (S/M/L/XL with stock)                    |
| `SCRUM-66` | Medium   | TC-SAPI-010 — GET /api/products/does-not-exist -> 404 not_found                                                            |

Comparison:

| Source                                                               | Result                                                                                                                                                                                                                |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract snapshot `test-design/contract/openapi-dev-2026-10-30.json` | `GET /api/products`: `page` min 1, `pageSize` min 1 max 50 default 12, `category` and `sort` enums, `min_price`/`max_price` in cents, `in_stock`, `delay` "capped"; `GET /api/products/{slug}`; only `200` documented |
| [Starting data](../database/starting-data.md)                        | 8 products, all `active`; slugs and prices; water bottle has one variant, stock 0                                                                                                                                     |
| This repo                                                            | no `tests/store-products/`, no store spec                                                                                                                                                                             |

**Conflict:** TC-SAPI-007 says `pageSize=51` is clamped to 50; the contract declares `maximum: 50`,
which usually means a value above it is rejected. Not settled by any source.

## Questions

1. `pageSize=51`: clamped (Jira) or rejected (contract `maximum`)?
2. Status and body for a bad category, `page=0` and an unknown slug: only `200` is in the contract;
   400, "rejected" and `404 not_found` come from Jira alone.
3. The `delay` cap value is not stated anywhere.
4. The `automated` label and the answer-key path refer to the course's own suite, not this repo.

## Connection limits

See the Task 03 note (`evidence/week3-task03-note.md`, tag `week6-end`): read-only and tool limits are
configured, not tested by a refused write.
