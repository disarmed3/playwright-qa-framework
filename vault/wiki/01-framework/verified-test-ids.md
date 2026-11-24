---
id: verified-test-ids
type: guide
---

# Verified test IDs

Every `data-testid` that a Page Object may use, with the page and date it was observed on dev
(rule 10, "Verified test IDs only"). Before using an ID that is not listed here, observe it read-only
on dev and add a row with page, element and date. A guessed ID is never listed.

Moved here on 2026-11-24 from three course notes, which the tags keep: `task02-note.md` and
`task04-note.md` (tag `week2-end`, with later additions up to `week3-end`) and `week4-checks.md`,
"Store UI observations" (tag `week4-end`). Wording is shortened; IDs, pages and dates are unchanged.

## Blog

### Observed 2026-10-18 (Page Object refactor)

| Class            | Field           | `data-testid`                          | Observed on dev                                        |
| ---------------- | --------------- | -------------------------------------- | ------------------------------------------------------ |
| `BasePage`       | `envBanner`     | `env-banner`                           | `/`, `/login` and `/categories`, text DEVELOPMENT      |
| `BlogListPage`   | `articleList`   | `article-list`                         | `/`                                                    |
| `BlogListPage`   | `articleItems`  | `article-item` inside `article-list`   | `/` (6 items)                                          |
| `LoginPage`      | `emailInput`    | `login-email`                          | `/login` (`input[type=email]`)                         |
| `LoginPage`      | `passwordInput` | `login-password`                       | `/login` (`input[type=password]`)                      |
| `LoginPage`      | `submitButton`  | `login-submit`                         | `/login` (`button[type=submit]`)                       |
| `CategoriesPage` | `categoryList`  | `category-list`                        | `/categories`, signed in as the teaching author (`ul`) |
| `CategoriesPage` | `categoryItems` | `category-item` inside `category-list` | `/categories` (4 items, none outside the list)         |

Signed out, `/categories` redirects to `/login`. `/categories` also has `category-form`,
`category-name-input`, `category-desc-input`, `category-create` and `category-delete`; they change
shared data, so `CategoriesPage` deliberately does not expose them.

### Observed 2026-10-20 (category filter)

Read-only, Playwright MCP browser; the filter form was not submitted, the filtered page was opened by
its address.

| Class          | Field               | `data-testid`                            | Observed on dev                                                                                                                                             |
| -------------- | ------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BlogListPage` | `categorySelect`    | `category-select`                        | `/`, once: `<select name="category">` inside `filter-form`; options All categories, AI-Assisted Testing, Career, Playwright (`playwright`), QA Fundamentals |
| `BlogListPage` | `filterSubmit`      | `filter-submit`                          | `/`, once: `<button type="submit">` "Filter" inside `filter-form`                                                                                           |
| `BlogListPage` | `articleCategories` | `article-category` inside `article-list` | `<span>`, one per article: 6 on `/`; 2 on `/?search=&category=playwright`, both "Playwright"                                                                |

### Observed 2026-10-28, guest (22:25–22:26 UTC)

Read-only, page loads and GET navigation only; no form submitted, no field filled.

| Case      | Page and action                                          | `data-testid` observed                                                                                                                                  |
| --------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-UI-014 | guest opens `/dashboard`                                 | redirected to `/login`; `login-card`, `login-form`, `login-email`, `login-password`, `login-submit`, `nav-login` visible                                |
| TC-UI-011 | `/login` before any submit                               | no `login-error` (it can appear only after a submit)                                                                                                    |
| TC-UI-021 | `/`                                                      | `filter-form`, `search-input` (`<input type="search" name="search">`), `article-list`, `article-item` (6)                                               |
| TC-UI-021 | `/?search=<a term with no match>`                        | `empty-state` with "No articles match your search."; no `article-list`; `search-input` keeps the term                                                   |
| TC-UI-031 | `/articles/seeding-test-data-without-tears` (first card) | at load: `comments-section`, `comment-count`, `comments-list`, `comments-loading`; about 90 ms later `comments-loading` is replaced by `comments-empty` |
| TC-UI-031 | same page                                                | `comment-form` with `comment-name`, `comment-email`, `comment-body`, `comment-submit`, `comment-errors` (not used; data-changing)                       |

Also on every page: `env-banner`, `brand`, `main-nav`, `nav-home`, `nav-shop`, `nav-cart`,
`main-content`, `site-footer`, `footer-env`, `footer-api-docs`. Not observed: a comment item's ID
(no visible article had comments).

### Observed 2026-10-28, signed in (22:28 UTC)

Two approved login submissions as the teaching author; paths and `data-testid` names only.

| Case                 | Page and action                                    | `data-testid` observed                                                                                                                                                                                                                      |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-UI-010, TC-UI-015 | login as the author                                | lands on `/dashboard`: `dashboard-head`, `new-article-btn`, `dashboard-table`, `dashboard-row`, `row-status`, `edit-link`, `delete-btn`; navigation `nav-dashboard`, `nav-categories`, `nav-account`, `nav-logout` (button); no `nav-login` |
| TC-UI-011            | login with the author's email and a wrong password | stays on `/login`; `login-error` visible with "Email or password is incorrect."; `login-email` keeps the address; `nav-login` shown                                                                                                         |

Not used by any test: `new-article-btn`, `edit-link`, `delete-btn` (data-changing) and
`dashboard-row`, `row-status` (the shared account's rows change).

## Store

Guest, no login. Observed 2026-11-07 19:41–19:44 UTC (Playwright MCP browser, isolated profile) and
2026-11-08 19:06 UTC; the order pages read-only on 2026-11-08 about 20:28 UTC. Page structure, texts and
formats are observed, not documented.

| Page / state                         | Test IDs observed                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| every page                           | `env-banner`, `brand`, `main-nav`, `nav-home`, `nav-shop`, `nav-cart` ("Cart", "Cart 2"), `cart-count` (only while the cart holds items; counts units), `nav-login`, `main-content`, `site-footer`, `footer-env`, `footer-api-docs`, `test-store-notice` (shop, cart)                                                                                                                 |
| `/shop`                              | `shop-hero`, `store-filters`, `search-input`, `filter-category`, `sort-select`, `in-stock-toggle`, `filter-submit`, `product-grid`, `product-tile` ×8, `product-link`, `product-cat`, `product-price` (`$9.00`), `stock-badge` ("In stock", "Sold out"), `pagination`, `page-indicator`                                                                                               |
| `/shop/{slug}`                       | `back-to-shop`, `product-detail` (image inside, alt = product name), `product-title`, `product-price` (`$25.00`), `product-description`, `buy-form`, `variant-select` (option value = variant id; sold-out options disabled), `qty-input` (min 1, default 1), `stock-status`, `add-to-cart`. A sold-out product shows `stock-status` "Sold out" and no select, quantity or add button |
| unknown slug                         | HTTP 404, `error-page`, `error-code` ("404"), `error-message` ("Product not found."), `error-home`                                                                                                                                                                                                                                                                                    |
| `/cart` empty                        | `empty-cart`; no coupon form, totals or checkout link                                                                                                                                                                                                                                                                                                                                 |
| `/cart` with items                   | `cart-table`, `cart-row`, `qty-input`, `qty-update`, `line-total`, `remove-item`, `cart-summary`, `coupon-hint`, `coupon-input`, `coupon-apply`, `subtotal`, `shipping` ("Free"), `cart-total`, `checkout-btn`                                                                                                                                                                        |
| after a coupon                       | refused: URL `/cart?coupon_error=…`, `coupon-error` ("This coupon has expired."), no `discount`; applied: `discount` "−$5.00" (U+2212) in the row "Discount (SAVE10)", total reduced                                                                                                                                                                                                  |
| `/checkout` (view only)              | `checkout-form`, `checkout-step-shipping`, `ship-email`, `ship-name`, `ship-address1`, `ship-city`, `ship-country`, `ship-postal`, `checkout-step-payment`, `test-cards`, `real-card-warning`, `card-number`, `card-name`, `card-exp`, `card-cvv`, `place-order`, `order-summary`, `summary-subtotal`, `summary-discount`, `summary-total`                                            |
| `/orders/{id}` (existing own orders) | `order-confirmation`, `order-number`, `order-status` ("Paid", "Failed"), `payment-status`, `order-items`, `order-total`. Not used by any test                                                                                                                                                                                                                                         |

**Not observed after a browser checkout, so not usable for that journey:** the page shown after
submitting the checkout form (paid or declined), `form-errors` and the declined error. The order page's
IDs are observed only on existing own orders. The cart line has **no image element** (product bug
SCRUM-166).

**Fallbacks (rule 10, `getByRole` / `getByText` with a reason), all in `CartPage`:** the line image (no
test ID; role `img` named by the product name, as on the product page), the variant label and the
"Discount (CODE)" label (no test ID; exact text inside the line or summary). No CSS class, XPath or
position is used. The line-image fallback finds nothing because no image exists (SCRUM-166).
