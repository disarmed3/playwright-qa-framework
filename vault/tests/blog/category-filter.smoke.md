---
id: tests-blog-category-filter-smoke
type: test-note
---

# category-filter.smoke.spec.ts

<!-- generated:start -->
- **Source:** [tests/blog/category-filter.smoke.spec.ts](../../../tests/blog/category-filter.smoke.spec.ts)
- **SHA-256 (LF-normalised):** `6e490b2aee77b5959d17342000cb19f7f8b414b90be1997e9bb72c1edfd6a90e`
- **Parser:** typescript — ok
- **Titles:**
  - `blog category filter smoke (dev only)`
    - `filtering by the Playwright category shows only Playwright articles`
- **Page Object imports:**
  - `BlogListPage` — [pages/BlogListPage.ts](../../../pages/BlogListPage.ts)
- **Block SHA-256:** `0415a5de9c30427a9422dfbbaee141550c9d090bbdd399acb60d3934994a5d4e`
<!-- generated:end -->

## About this test

Filters the blog home page by the Playwright category and checks that only Playwright articles
remain. The filter is a GET form, so the test changes no data and needs no `envGuard`
(task04 note (`evidence/task04-note.md`, tag `week6-end`), "Active tests").

- **Test IDs.** `category-select`, `filter-submit` and `article-category` (inside `article-list`),
  observed read-only on dev on 2026-10-20 22:08. At that time `/` showed 6 articles in 4 categories
  and the filtered page showed 2, both "Playwright" (task04 note, "New test IDs"). These counts are
  observations, not assertions: articles are shared dev data.
- **Precondition from review.** Before filtering, the unfiltered list must contain at least one
  article whose category is not "Playwright". Otherwise a filter that removes nothing would pass
  (task04 note, "Category filter: draft and review"). The first passing draft is archived unchanged as
  `evidence/task04-raw-draft.ts` (tag `week6-end`).
- **Assertions after filtering.** The URL carries `category=playwright`, the list is not empty, and
  every remaining category text is exactly "Playwright".

First run: 5 passed (3.1s) on dev, 2026-10-20 22:28. Last recorded run: 5 passed (3.7s) on 2026-10-23
(task10 note (`evidence/task10-note.md`, tag `week6-end`)).
