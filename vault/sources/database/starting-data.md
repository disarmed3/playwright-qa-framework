---
id: starting-data
type: source
---

# Starting data (dated 2026-10-15)

Expected starting state of the shared course database. Received from the course mentor as a
screenshot on 2026-10-29 (Week 3 Task 07); the text below is copied word for word. The mentor names
the course seed files `db/seed.sql` and `db/seed-store.sql` as its source. Those files are not in this
repository and were not read, so the list cannot be checked against them here.

Environment: the dev database behind dev.ai-orchestration-courses.com, confirmed in writing by the
mentor on 2026-10-29 (connection details are not recorded).

## Mentor's text

> **Starting data (dated 2026-10-15)**
>
> In Week 3 Task 07, save this as `vault/sources/database/starting-data.md`. Source: the course seed
> files `db/seed.sql` and `db/seed-store.sql`.
>
> - 12 tables: users, categories, articles, comments, products, product_variants, coupons, carts,
>   cart_items, orders, order_items, payments.
> - users: 4. categories: 4. articles: 7 (6 published, 1 draft). comments: 4.
> - products: 8. Prices in cents: tee 2500, hoodie 4500, mug 1200, stickers 600, cap 2000, tote 1500,
>   bottle 1800, notebook 900.
> - product_variants: 14. Sold out: hoodie XL and the water bottle.
> - coupons: 3. SAVE10 = 10 % off. WELCOME5 = $5 off from $25. EXPIRED10 = expired.
> - carts, cart_items, orders, order_items, payments: empty at seed time.
> - Shared database: counts can differ on the day. Record a difference; never reset.

## Mentor's answers (2026-10-30)

Two replies on 2026-10-30 to the open questions of this note. Source named by the mentor: the course
seed files `db/seed.sql` and `db/seed-store.sql` and the grant file `db/student-role.sql` (not in this
repository, not read). Summary of the facts; the second reply corrects the first on prices.

| Topic          | Answer                                                                                                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product slugs  | All 8 confirmed: see the table below.                                                                                                                                                                                            |
| Drift or fixed | Drift is only for values that change in normal use: stock and row counts. Prices, coupon terms and the products' `active` flags are fixed: a difference is a data mismatch.                                                      |
| Data mismatch  | The check fails; record it, keep the expected value, never reset, and tell the mentor.                                                                                                                                           |
| Stock          | Only a paid checkout changes stock. Available variants: check `stock > 0`, not an exact number.                                                                                                                                  |
| Sold out       | Hoodie: the variant with label `XL`, stock 0. Water bottle: only one variant, label `One Size`, stock 0. Both products stay `active = true`.                                                                                     |
| SAVE10         | kind `percent`, value 10, `min_subtotal_cents` 0, active true, `expires_at` NULL                                                                                                                                                 |
| WELCOME5       | kind `fixed`, value 500, `min_subtotal_cents` 2500, active true, `expires_at` NULL                                                                                                                                               |
| EXPIRED10      | kind `percent`, value 10, `min_subtotal_cents` 0, active **true** (on purpose, so the app must check the date), `expires_at` 2025-01-01T00:00:00Z; "expired" = `expires_at` in the past                                          |
| TC-DB-002      | 0 orphans: article → author, article → category (non-NULL `category_id` only), comment → article                                                                                                                                 |
| TC-SDB-003     | 0 orphans, four links only: variant → product, cart item → variant, order item → order, payment → order                                                                                                                          |
| TC-DB-001      | Blog counts from this list only (users 4, categories 4, articles 7 with 6 published, comments 4); no reset, no extra facts. They change in normal use: report starting count, today's count and the date; a difference is drift. |

| Short name | Slug                      |
| ---------- | ------------------------- |
| tee        | `codemify-classic-tee`    |
| hoodie     | `bounded-behavior-hoodie` |
| mug        | `qa-fuel-mug`             |
| stickers   | `sticker-pack-vol-1`      |
| cap        | `deterministic-cap`       |
| tote       | `test-data-tote`          |
| bottle     | `flaky-free-water-bottle` |
| notebook   | `vault-notebook`          |

## Seed facts (read by the Task 07 scripts)

`scripts/seed-integrity.sh` and `scripts/verify-student-fence.sh` read the block below; no expected
value is repeated in a script. One row per fact: `check|key|expected|class|status`.

- `class`: `drift` = stock or a row count, which change in normal use (a difference is recorded as
  DRIFT with today's value and date, never reset); `fixed` = every other fact (a difference is a
  DATA_MISMATCH: the check fails, the expected value stays, nothing is reset).
- `status`: `approved` = the value and its mapping come from the mentor's text or answers above. Any
  other status is reported as UNVERIFIED and not queried.
- Keys: `price` and `active` by product slug; `stock_zero` as `slug:variant label`; `variant_count` by
  product slug; `coupon` and `coupon_expired` by code; `orphans` as `child.column>parent.column`
  (only non-NULL child values are checked). `coupon` expected = `kind,value,min_subtotal_cents,active,expires_at (UTC)`.
- `stock_available` covers every variant of the eight priced products except the `stock_zero` ones.
- Not used: values from observed data, from the course backlog's extra facts (article 1 slug,
  article 7 author) or from other repositories.

```seed-facts
# check|key|expected|class|status
tables|public|articles,cart_items,carts,categories,comments,coupons,order_items,orders,payments,product_variants,products,users|fixed|approved
count|users|4|drift|approved
count|categories|4|drift|approved
count|articles|7|drift|approved
count|articles.published|6|drift|approved
count|articles.draft|1|drift|approved
count|comments|4|drift|approved
count|products|8|drift|approved
count|product_variants|14|drift|approved
count|coupons|3|drift|approved
count|carts|0|drift|approved
count|cart_items|0|drift|approved
count|orders|0|drift|approved
count|order_items|0|drift|approved
count|payments|0|drift|approved
variant_count|flaky-free-water-bottle|1|drift|approved
price|codemify-classic-tee|2500|fixed|approved
price|bounded-behavior-hoodie|4500|fixed|approved
price|qa-fuel-mug|1200|fixed|approved
price|sticker-pack-vol-1|600|fixed|approved
price|deterministic-cap|2000|fixed|approved
price|test-data-tote|1500|fixed|approved
price|flaky-free-water-bottle|1800|fixed|approved
price|vault-notebook|900|fixed|approved
active|bounded-behavior-hoodie|t|fixed|approved
active|flaky-free-water-bottle|t|fixed|approved
stock_zero|bounded-behavior-hoodie:XL|0|drift|approved
stock_zero|flaky-free-water-bottle:One Size|0|drift|approved
stock_available|other variants of the priced products|> 0|drift|approved
coupon|EXPIRED10|percent,10,0,t,2025-01-01T00:00:00Z|fixed|approved
coupon|SAVE10|percent,10,0,t,NULL|fixed|approved
coupon|WELCOME5|fixed,500,2500,t,NULL|fixed|approved
coupon_expired|EXPIRED10|true|fixed|approved
orphans|articles.author_id>users.id|0|fixed|approved
orphans|articles.category_id>categories.id|0|fixed|approved
orphans|comments.article_id>articles.id|0|fixed|approved
orphans|product_variants.product_id>products.id|0|fixed|approved
orphans|cart_items.variant_id>product_variants.id|0|fixed|approved
orphans|order_items.order_id>orders.id|0|fixed|approved
orphans|payments.order_id>orders.id|0|fixed|approved
```
