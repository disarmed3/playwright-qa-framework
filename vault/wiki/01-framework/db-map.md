---
id: db-map
type: guide
---

# Database map

The tables of the course database, grouped by application area: columns, types, nullability,
defaults, keys and checks. Built from schema metadata only; no rows, row counts or values were read.

## Source

| What        | Value                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| Read on     | 2026-10-28 (Week 3 Task 02)                                                                                             |
| Route       | the restricted `postgres` connector ([rule 40](../../../.claude/rules/40-db-postgres.md))                               |
| Schema      | `public`: 12 tables, 98 columns (the 12 tables match rule 40's Observed list)                                           |
| Queries     | `information_schema.columns` (types, nullability, defaults); `pg_constraint` with `pg_get_constraintdef` (keys, checks) |
| Environment | dev (behind dev.ai-orchestration-courses.com), confirmed by the mentor on 2026-10-29 (rule 40, Repeatable scripts)      |

The map shows the schema on the day it was read. A later change by the course team needs a refresh,
not an assumption.

## Areas

| Area              | Tables                                                     |
| ----------------- | ---------------------------------------------------------- |
| Accounts (shared) | `users`                                                    |
| Blog              | `categories`, `articles`, `comments`                       |
| Store catalogue   | `products`, `product_variants`, `coupons`                  |
| Cart and checkout | `carts`, `cart_items`, `orders`, `order_items`, `payments` |

Every `id` is `integer`, not null, primary key, default `nextval('<table>_id_seq')`. Every
`created_at` / `updated_at` is `timestamptz`, not null, default `now()`. The tables below list them
only by name.

## Accounts

### `users`

| Column                                                             | Type | Null | Default    | Key / rule                 |
| ------------------------------------------------------------------ | ---- | ---- | ---------- | -------------------------- |
| `id`                                                               |      |      |            | PK                         |
| `email`                                                            | text | no   |            | UNIQUE                     |
| `password_hash`                                                    | text | no   |            |                            |
| `display_name`                                                     | text | no   |            |                            |
| `role`                                                             | text | no   | `'author'` | CHECK: `admin` or `author` |
| `bio`                                                              | text | yes  |            |                            |
| `address_line1`, `address_line2`, `city`, `country`, `postal_code` | text | yes  |            |                            |
| `created_at`                                                       |      |      |            |                            |

Our role may read and add `users` rows, never change or delete them (rule 40).

## Blog

### `categories`

| Column        | Type | Null | Default | Key / rule |
| ------------- | ---- | ---- | ------- | ---------- |
| `id`          |      |      |         | PK         |
| `name`        | text | no   |         |            |
| `slug`        | text | no   |         | UNIQUE     |
| `description` | text | yes  |         |            |
| `created_at`  |      |      |         |            |

### `articles`

| Column                     | Type    | Null | Default   | Key / rule                               |
| -------------------------- | ------- | ---- | --------- | ---------------------------------------- |
| `id`                       |         |      |           | PK                                       |
| `title`                    | text    | no   |           |                                          |
| `slug`                     | text    | no   |           | UNIQUE                                   |
| `excerpt`                  | text    | yes  |           |                                          |
| `body`                     | text    | no   |           |                                          |
| `cover_image_url`          | text    | yes  |           |                                          |
| `category_id`              | integer | yes  |           | FK → `categories.id`, ON DELETE SET NULL |
| `author_id`                | integer | no   |           | FK → `users.id`, ON DELETE CASCADE       |
| `status`                   | text    | no   | `'draft'` | CHECK: `draft` or `published`            |
| `created_at`, `updated_at` |         |      |           |                                          |

### `comments`

| Column         | Type    | Null | Default | Key / rule                            |
| -------------- | ------- | ---- | ------- | ------------------------------------- |
| `id`           |         |      |         | PK                                    |
| `article_id`   | integer | no   |         | FK → `articles.id`, ON DELETE CASCADE |
| `author_name`  | text    | no   |         |                                       |
| `author_email` | text    | yes  |         |                                       |
| `body`         | text    | no   |         |                                       |
| `created_at`   |         |      |         |                                       |

## Store catalogue

### `products`

| Column        | Type    | Null | Default     | Key / rule                                                 |
| ------------- | ------- | ---- | ----------- | ---------------------------------------------------------- |
| `id`          |         |      |             | PK                                                         |
| `sku`         | text    | no   |             | UNIQUE                                                     |
| `slug`        | text    | no   |             | UNIQUE                                                     |
| `name`        | text    | no   |             |                                                            |
| `description` | text    | no   |             |                                                            |
| `category`    | text    | no   | `'apparel'` | CHECK: `apparel`, `drinkware`, `stickers` or `accessories` |
| `price_cents` | integer | no   |             | CHECK: `>= 0`                                              |
| `image_url`   | text    | yes  |             |                                                            |
| `active`      | boolean | no   | `true`      |                                                            |
| `created_at`  |         |      |             |                                                            |

### `product_variants`

| Column       | Type    | Null | Default | Key / rule                                                            |
| ------------ | ------- | ---- | ------- | --------------------------------------------------------------------- |
| `id`         |         |      |         | PK                                                                    |
| `product_id` | integer | no   |         | FK → `products.id`, ON DELETE CASCADE; UNIQUE (`product_id`, `label`) |
| `label`      | text    | no   |         |                                                                       |
| `sku`        | text    | no   |         | UNIQUE                                                                |
| `stock`      | integer | no   | `0`     | CHECK: `>= 0`                                                         |

### `coupons`

| Column               | Type        | Null | Default | Key / rule                  |
| -------------------- | ----------- | ---- | ------- | --------------------------- |
| `id`                 |             |      |         | PK                          |
| `code`               | text        | no   |         | UNIQUE                      |
| `kind`               | text        | no   |         | CHECK: `percent` or `fixed` |
| `value`              | integer     | no   |         | CHECK: `> 0`                |
| `min_subtotal_cents` | integer     | no   | `0`     |                             |
| `active`             | boolean     | no   | `true`  |                             |
| `expires_at`         | timestamptz | yes  |         |                             |

## Cart and checkout

### `carts`

| Column          | Type    | Null | Default  | Key / rule                              |
| --------------- | ------- | ---- | -------- | --------------------------------------- |
| `id`            |         |      |          | PK                                      |
| `user_id`       | integer | yes  |          | FK → `users.id`, ON DELETE CASCADE      |
| `session_token` | text    | yes  |          |                                         |
| `coupon_code`   | text    | yes  |          | no FK (see Relationships)               |
| `status`        | text    | no   | `'open'` | CHECK: `open`, `ordered` or `abandoned` |
| `created_at`    |         |      |          |                                         |

### `cart_items`

| Column             | Type    | Null | Default | Key / rule                                                           |
| ------------------ | ------- | ---- | ------- | -------------------------------------------------------------------- |
| `id`               |         |      |         | PK                                                                   |
| `cart_id`          | integer | no   |         | FK → `carts.id`, ON DELETE CASCADE; UNIQUE (`cart_id`, `variant_id`) |
| `variant_id`       | integer | no   |         | FK → `product_variants.id`, ON DELETE CASCADE                        |
| `qty`              | integer | no   |         | CHECK: `> 0`                                                         |
| `unit_price_cents` | integer | no   |         | CHECK: `>= 0`                                                        |

### `orders`

| Column                                                                           | Type    | Null | Default     | Key / rule                                                     |
| -------------------------------------------------------------------------------- | ------- | ---- | ----------- | -------------------------------------------------------------- |
| `id`                                                                             |         |      |             | PK                                                             |
| `order_number`                                                                   | text    | no   |             | UNIQUE                                                         |
| `user_id`                                                                        | integer | yes  |             | FK → `users.id`, ON DELETE SET NULL                            |
| `cart_id`                                                                        | integer | yes  |             | FK → `carts.id`, ON DELETE SET NULL                            |
| `email`                                                                          | text    | no   |             |                                                                |
| `status`                                                                         | text    | no   | `'pending'` | CHECK: `pending`, `paid`, `failed`, `cancelled` or `fulfilled` |
| `coupon_code`                                                                    | text    | yes  |             | no FK (see Relationships)                                      |
| `subtotal_cents`, `discount_cents`, `shipping_cents`, `tax_cents`, `total_cents` | integer | no   | `0`         |                                                                |
| `ship_name`, `ship_address1`, `ship_city`, `ship_country`, `ship_postal`         | text    | yes  |             |                                                                |
| `created_at`                                                                     |         |      |             |                                                                |

### `order_items`

| Column             | Type    | Null | Default | Key / rule                                     |
| ------------------ | ------- | ---- | ------- | ---------------------------------------------- |
| `id`               |         |      |         | PK                                             |
| `order_id`         | integer | no   |         | FK → `orders.id`, ON DELETE CASCADE            |
| `variant_id`       | integer | yes  |         | FK → `product_variants.id`, ON DELETE SET NULL |
| `name_snapshot`    | text    | no   |         |                                                |
| `variant_label`    | text    | yes  |         |                                                |
| `qty`              | integer | no   |         | CHECK: `> 0`                                   |
| `unit_price_cents` | integer | no   |         | CHECK: `>= 0`                                  |

### `payments`

| Column       | Type    | Null | Default | Key / rule                               |
| ------------ | ------- | ---- | ------- | ---------------------------------------- |
| `id`         |         |      |         | PK                                       |
| `order_id`   | integer | no   |         | FK → `orders.id`, ON DELETE CASCADE      |
| `status`     | text    | no   |         | CHECK: `approved`, `declined` or `error` |
| `card_last4` | text    | yes  |         |                                          |
| `mock_ref`   | text    | yes  |         |                                          |
| `created_at` |         |      |         |                                          |

## Relationships

- `articles.category_id` → `categories.id` (ON DELETE SET NULL): each article belongs to at most one
  category, and may have none. Deleting a category keeps its articles; their category becomes empty.
- Cascades: deleting a user deletes their articles (and with them the articles' comments) and carts;
  deleting an order deletes its order items and payments; deleting a product deletes its variants,
  and with them any cart items that hold them. Our role cannot delete `users` rows (rule 40).
- SET NULL links keep the row and empty the link: `orders.user_id`, `orders.cart_id`,
  `order_items.variant_id`. An order keeps its `name_snapshot` and price after its variant is gone.
- `carts.coupon_code` and `orders.coupon_code` are plain text with no foreign key: the database does
  not check that the code exists in `coupons.code`.
- `products.category` is a fixed list in a CHECK rule. It is unrelated to the blog's `categories`
  table.

## Nullable columns: what empty means

In storage, empty is `NULL`: no value is stored. It is not `''` (an empty string, which these text
columns also accept, since no CHECK forbids it) and not `0`. Nullability only says what the database
allows; it does not prove what the API or a form accepts, or what the app does with `NULL`.

| Column                  | What `NULL` means in storage                                                                    | Test-data choice to review against the requirement                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `articles.category_id`  | the article has no category; also the result when its category is deleted                       | a `qa-auto-` article with no category: does the requirement allow an uncategorised article, and how does the category filter show it? |
| `comments.author_email` | no email stored; a blank form field may instead arrive as `''`                                  | a comment with a blank email: is email optional in the requirement, and does the app store `NULL` or `''`?                            |
| `coupons.expires_at`    | no expiry date stored; whether that means "never expires" is the app's rule, not the database's | a coupon without an expiry date: confirm the requirement before assuming it stays valid forever                                       |

A test that creates any of these records runs on dev only, inside `envGuard`, and needs approval
first ([rule 01](../../../.claude/rules/01-guardrails.md),
[rule 20](../../../.claude/rules/20-data-management.md)).

## How to refresh

1. Get approval for a connector session (rule 40: starting the connector is the first contact with
   the database).
2. Through the restricted `postgres` connector, run the two catalog reads:
   - `information_schema.columns` where `table_schema = 'public'`, ordered by table and position:
     `table_name`, `column_name`, `data_type`, `is_nullable`, `column_default`.
   - `pg_constraint` joined to `pg_class` and `pg_namespace` for schema `public`, types `p`, `f`,
     `u`, `c`, with `pg_get_constraintdef(oid)`.
3. Compare the result with the tables above; update what changed and the date in Source.
4. Never read rows, never `select *`, never record row counts here.
5. Run `npm run vault:validate` and `npm run format:check`.

Week 3 Task 07 may replace steps 2–3 with repeatable scripts.
