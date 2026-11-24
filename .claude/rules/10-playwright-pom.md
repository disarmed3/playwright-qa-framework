---
paths:
  - 'tests/**/*.ts'
  - 'pages/**/*.ts'
---

# Playwright and Page Objects

Applies when editing browser tests in `tests/` or Page Objects in `pages/`. Not `safety/`.
No lint enforces these rules today; "Verify" names the review or grep that confirms each one.

## Locators

- Do: use a verified `data-testid` via `getByTestId`; if none exists, `getByRole` with an accessible
  name; then `getByText`. Record a one-line reason for any fallback in
  `vault/wiki/01-framework/verified-test-ids.md` ("Fallbacks").
- When: adding or changing a locator in `pages/`.
- Verify: grep `pages/` for `getByRole`/`getByText`; each has a recorded reason.
- Do: no CSS or XPath chains, no `.nth()` positions, no `locator('div > …')`.
- Verify: grep for `locator(`, `css=`, `xpath=`, `.nth(`.

## Verified test IDs only

- Do: use only IDs recorded as observed on dev in
  [vault/wiki/01-framework/verified-test-ids.md](../../vault/wiki/01-framework/verified-test-ids.md).
  Before using a new ID, observe it read-only on dev and add a row there with page, element and date.
  Never present a guessed ID as verified.
- When: adding or changing any `getByTestId` string.
- Verify: every `getByTestId` string in `pages/` appears in that note's tables.
- Status of the blog IDs:
  - Observed and exercised by a test: `env-banner` (on `/`), `article-list`, `article-item`,
    `article-link`, `article-detail`, `article-title` (first article only), `article-category`,
    `category-select`, `filter-submit`, `login-email`, `login-password`, `login-submit`, `category-list`,
    `category-item`.
  - Observed but not exercised: `env-banner` on `/login` and `/categories`.
  - Observed, deliberately not exposed: `category-form`, `category-name-input`, `category-desc-input`,
    `category-create`, `category-delete`.
  - Not recorded: the comment form's IDs.
  - Store page IDs are in the note's section "Store". IDs listed there as not observed (the checkout
    confirmation and declined-error elements) stay unusable.
- ⚠️ A Page Object member no test uses can hold a wrong ID: typecheck passes and nothing fails.

## Tests use Page Objects

- Do: specs get elements and navigation only from `pages/`; no `getBy*`, `locator(`, `page.goto` or
  direct `page.click/fill` in `tests/`. Page-level matchers such as `expect(page).toHaveURL` are fine.
- When: writing or editing a spec in `tests/`.
- Verify: grep `tests/` for `getBy`, `locator(`, `page.goto`, `page.click`, `page.fill`.

## Page Object shape

- Do: one class per app page, one file each in `pages/` (`BlogListPage`, `LoginPage`, …).
  `BasePage` holds only parts shared by every page (e.g. `envBanner`).
- Do: name methods for the user's intention — `openFirstArticle()`, `login()` — not `clickLink()`.
- Do: do not expose data-changing controls (create, delete, comment) until a task needs them.
- When: adding or changing a class or method in `pages/`.
- Verify: review.

## Waits

- Do: no fixed waits (`waitForTimeout`, `setTimeout`); rely on web-first assertions and auto-waiting.
  A Page Object may wait for its own action to finish if a comment says so (see `LoginPage.login()`).
- When: waiting for anything in `tests/` or `pages/`.
- Verify: grep for `waitForTimeout` and `setTimeout`.
- ⚠️ A fixed wait can make a flaky test look stable; the run stays green.

## Assertions

- Do: scenario assertions live in the spec and check what the requirement states — text when it names
  text, not only visibility.
- When: writing or changing an `expect` in a spec.
- Verify: review — compare the requirement and test title with each `expect`.
- ⚠️ A weaker assertion than the requirement still passes; no check compares the two.
- Do: no exact counts on shared, changing lists (articles, categories). Use `not.toHaveCount(0)` or
  `.first()` visible, unless the requirement calls for an exact count and the test created its own data.
- When: asserting on a list the test did not create (e.g. articles, categories).
- Verify: grep for `toHaveCount(` followed by a number.
- ⚠️ An exact count on shared dev data passes today and fails when someone else changes the data.

## Checks that exist now

"No lint enforces these rules today" (above) still holds for locators, test IDs, Page Object shape and
assertion strength; those stay with review and the greps named in "Verify". Some related mistakes are
caught automatically:

- The edit guard (`scripts/hooks/guard.mjs`, Claude's `Edit`/`Write` only) refuses, in
  `*.spec.ts`: an added `.only`, `.skip`, `.fixme(`, `.fail(` or `waitForTimeout(`; an Edit with fewer
  `expect(`, `runIfEnv(` or `envGuard(` calls; and a Write under `tests/` without
  `runIfEnv(test, ['dev'])`. Edits made outside Claude are not checked.
- ESLint (`eslint.config.mjs`) applies the Playwright recommended rules to
  `tests/**/*.spec.ts` and reports `test.only` and `test.skip` as errors, so `npm run lint` and the
  pre-commit hook refuse them; `forbidOnly: true` in `playwright.config.ts` also fails a run with `.only`.
- A hard wait typed outside Claude, or added to `pages/`, is still caught only by review.
