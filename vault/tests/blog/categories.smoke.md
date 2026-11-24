---
id: tests-blog-categories-smoke
type: test-note
---

# categories.smoke.spec.ts

<!-- generated:start -->
- **Source:** [tests/blog/categories.smoke.spec.ts](../../../tests/blog/categories.smoke.spec.ts)
- **SHA-256 (LF-normalised):** `83f1138700d57003ff10d79682bc92cad2b43040d9d8800e94d0c00f57893b50`
- **Parser:** typescript — ok
- **Titles:**
  - `categories smoke (dev only)`
    - `a signed-in author sees the category list with at least one item`
- **Page Object imports:**
  - `CategoriesPage` — [pages/CategoriesPage.ts](../../../pages/CategoriesPage.ts)
  - `LoginPage` — [pages/LoginPage.ts](../../../pages/LoginPage.ts)
- **Block SHA-256:** `3544f979284dc7494740789764b33dde21682c5ac5d3f35c869e17ff6c65512b`
<!-- generated:end -->

## About this test

Signs in as the course teaching account and checks that the categories page lists at least one
category. Reading only; no `envGuard`.

- **Account.** `AUTHOR` is imported from
  [tests/support/users.ts](../../../tests/support/users.ts), the course-approved training account for
  dev. Its values are never copied into notes or evidence
  ([data rule](../../../.claude/rules/20-data-management.md), "Shared data is imported").
- **Sign-in.** `LoginPage.open()` and `login()` use `login-email`, `login-password` and
  `login-submit`. `login()` waits until the URL is no longer `/login`; that confirms the sign-in
  finished and is not a scenario assertion. Signed out, `/categories` redirects to `/login`
  (task02 note (`evidence/task02-note.md`, tag `week6-end`), "Locator ownership").
- **Assertions.** `category-list` is visible and its first `category-item` is visible (4 items were
  seen on 2026-10-18). Categories are shared dev data, so there is no exact count.
- **Not exposed.** `/categories` also has `category-form`, `category-name-input`,
  `category-desc-input`, `category-create` and `category-delete`. They change shared data, so
  `CategoriesPage` deliberately leaves them out.

In the Week 2 baseline (`evidence/week2-baseline.md` (tag `week6-end`)). Last recorded run:
5 passed (3.7s) on 2026-10-23 (task10 note (`evidence/task10-note.md`, tag `week6-end`)).
