---
id: tests-blog-home-smoke
type: test-note
---

# home.smoke.spec.ts

<!-- generated:start -->
- **Source:** [tests/blog/home.smoke.spec.ts](../../../tests/blog/home.smoke.spec.ts)
- **SHA-256 (LF-normalised):** `2b58fdb786ca1d5e4cf506e53faf22bff8d4b1e86bfa9feeef7e1295b2d62a54`
- **Parser:** typescript — ok
- **Titles:**
  - `blog home smoke (dev only)`
    - `the banner is visible and identifies DEVELOPMENT`
    - `the first article card is visible and at least one card exists`
- **Page Object imports:**
  - `BlogListPage` — [pages/BlogListPage.ts](../../../pages/BlogListPage.ts)
- **Block SHA-256:** `20bdfc7ee4c87216d8158fd072bfdbde7000b99fb7a3be5bc93b449855462236`
<!-- generated:end -->

## About this test

Two read-only checks of the blog home page on dev. Nothing is created, so there is no `envGuard`.

- **The banner identifies DEVELOPMENT.** `BlogListPage.envBanner` (from `BasePage`) is
  `env-banner`, seen on `/`, `/login` and `/categories` with the text DEVELOPMENT on 2026-10-18
  (task02 note (`evidence/task02-note.md`, tag `week6-end`), "Locator ownership"). The requirement names the
  text, so the test asserts `toHaveText('DEVELOPMENT')`, not only visibility.
- **At least one article card exists.** `articleItems` is `article-item` inside `article-list`
  (6 items on 2026-10-18). Articles are shared dev data, so the test uses `.first()` visible and
  `not.toHaveCount(0)`, never an exact count ([rule 10](../../../.claude/rules/10-playwright-pom.md)).

Both tests are in the Week 2 baseline (`evidence/week2-baseline.md` (tag `week6-end`)). Last
recorded run: the five-test dev suite, 5 passed (3.7s), Chromium, zero retries, on 2026-10-23
(task10 note (`evidence/task10-note.md`, tag `week6-end`), "The allowed commands, run for real").
