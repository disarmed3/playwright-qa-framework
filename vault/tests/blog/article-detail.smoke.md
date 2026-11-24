---
id: tests-blog-article-detail-smoke
type: test-note
---

# article-detail.smoke.spec.ts

<!-- generated:start -->
- **Source:** [tests/blog/article-detail.smoke.spec.ts](../../../tests/blog/article-detail.smoke.spec.ts)
- **SHA-256 (LF-normalised):** `75aa4e444064a977a845b8e962e75b1d93df331c44722c310e99a3bd8e88fa72`
- **Parser:** typescript — ok
- **Titles:**
  - `article detail smoke (dev only)`
    - `opening the first article card shows its detail page with the same title`
- **Page Object imports:**
  - `ArticleDetailPage` — [pages/ArticleDetailPage.ts](../../../pages/ArticleDetailPage.ts)
  - `BlogListPage` — [pages/BlogListPage.ts](../../../pages/BlogListPage.ts)
- **Block SHA-256:** `cf21c07f0cca06c1885b663566915469ae62b9341f71856a112ec528d671b784`
<!-- generated:end -->

## About this test

Opens the first article card on the blog home page and checks that its detail page shows the same
title. Read-only; no `envGuard`.

- **Origin.** The reviewed version of the Task 01 draft
  (`evidence/task01-raw-draft.ts` (tag `week6-end`)): same steps, assertions and title;
  elements and navigation now come from `BlogListPage` and `ArticleDetailPage`
  (task04 note (`evidence/task04-note.md`, tag `week6-end`), "Active tests").
- **Test IDs.** `article-link`, `article-detail` and `article-title`, recorded for the first article
  only ([rule 10](../../../.claude/rules/10-playwright-pom.md), "Verified test IDs only").
- **Assertions.** The clicked title is read first and must not be empty, so an empty card cannot
  compare equal to an empty heading. Then the URL must match `/articles/<slug>`, the detail element must
  be visible, and its title must have exactly the clicked text, which is what the test title promises.

First run with these IDs: 5 passed (3.1s) on dev, 2026-10-20 22:28 (task04 note, "Verification").
Last recorded run: 5 passed (3.7s) on 2026-10-23 (task10 note (`evidence/task10-note.md`, tag `week6-end`)).
