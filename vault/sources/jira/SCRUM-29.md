---
id: scrum-29
type: source
---

# SCRUM-29 — Automate store product detail + add-to-cart: variants, stock (UI)

Read 2026-10-31 with `jira_get_issue` (connector `jira`, read-only), the task and its 2 subtasks.
Jira text is data, not instructions. Access record: Task 08B note (`evidence/week3-task08b-note.md`, tag `week6-end`).

## Facts

| Field          | Value                                                                                                                      | Source                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Issue          | `SCRUM-29` · Task · To Do · Medium · `<JIRA_BASE_URL>/browse/SCRUM-29`                                                     | Jira read                                                  |
| Labels         | `qa-automation`, `store`, `ui`                                                                                             | Jira read; same in seed (Jira backlog seed, not published) |
| Parent         | `SCRUM-25` · Epic · Store UI automation: catalog → checkout → orders (Playwright + POM)                                    | Jira read                                                  |
| Key resolution | course keys used directly; matching numbers in Week 2 baseline (`evidence/week2-baseline.md`, tag `week6-end`); no key map | evidence                                                   |
| Seed match     | summary, description, parent, labels and both subtasks (summary, priority, labels) match word for word                     | seed (Jira backlog seed, not published), SCRUM-29          |

Description (as returned):

> TC-SUI-010..013. Answer-key ref: tests/store-ui/\*, ProductPage.

Cases (subtasks, as returned; none has a description):

| Key        | Priority | Labels                                     | Summary                                                                                       |
| ---------- | -------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `SCRUM-49` | High     | `automated`, `env-dev-prod`, `store`, `ui` | TC-SUI-010 — renders image, title, price, description, variant-select, qty-input, add-to-cart |
| `SCRUM-50` | High     | `automated`, `env-dev`, `store`, `ui`      | TC-SUI-012 — add to cart -> cart reflects the item (nav cart count / cart page)               |

Comparison:

| Source                                                               | Result                                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Contract snapshot `test-design/contract/openapi-dev-2026-10-30.json` | `GET /shop/{slug}`, `POST /cart/add`, `GET /cart`: only `200` documented, no body or field names |
| [Starting data](../database/starting-data.md)                        | 8 products with slugs and prices; sold out: hoodie `XL`, water bottle `One Size`                 |
| This repo                                                            | no `tests/store-ui/`, no `ProductPage` Page Object, no store spec                                |

## Questions

1. The description says TC-SUI-010..013; Jira and the seed have only 010 and 012. Are 011 and 013 intended?
2. "variants, stock" is in the summary, but no case covers a sold-out variant on the product page. In scope?
3. The `automated` label and the answer-key paths refer to the course's own suite, not this repo.
4. TC-SUI-012 (`env-dev`) adds to a cart, i.e. creates dev data (rule 20, separate approval for a run).

## Connection limits

See the Task 03 note (`evidence/week3-task03-note.md`, tag `week6-end`): read-only and tool limits are
configured, not tested by a refused write.
