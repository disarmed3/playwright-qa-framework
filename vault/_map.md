# Vault map

A short guide to the vault folders.

- `_raw/` — unprocessed notes and captures. Empty for now; `.gitkeep` keeps the folder in Git.
- `_changelog/` — written only by `scripts/vault-sync.mjs`, never by hand.
  - `YYYY-MM-DD.md` (local date): one entry per Claude `Edit`/`Write` of a project file outside
    `vault/`. Kept locally, ignored by Git (since 2026-11-24).
  - `sessions.log`: one `- session START <UTC>` line per session start, plus
    ` · source: … · session: …` when the event provides them; one `- session END <UTC>` line per
    session end, plus ` · reason: … · session: …`. Ignored by Git (`*.log`).
- `12-progress-report/` — daily journals, one file per person per local day:
  `12-progress-report/<slug>/YYYY-MM-DD.md` (slug from Git `user.name`). Written only through
  `/worklog` (`.claude/commands/worklog.md`), which appends `## HH:MM` entries and never rewrites earlier
  ones. Read by `scripts/hooks/session-preflight.mjs` (newest journal at session start) and
  `scripts/hooks/stop-worklog.mjs` (Stop reminder when there is work today but no entry). Kept locally,
  ignored by Git (since 2026-11-24); the course-time journals are in the tags `week1-end` to `week6-end`.
- `03-framework/` — how the framework's own tooling works.
  - [Hook lifecycle guide](03-framework/hook-lifecycle-map.md): which hooks are configured,
    verified or only planned.
- `wiki/01-framework/` — reference guides built from project sources.
  - [Database map](wiki/01-framework/db-map.md): tables, columns, keys and relationships from schema
    metadata only (read 2026-10-28), and how to refresh it.
  - [Verified test IDs](wiki/01-framework/verified-test-ids.md): every `data-testid` a Page Object may
    use, with the page and date it was observed on dev (rule 10).
- `wiki/02-playbooks/` — step-by-step procedures built from inspected evidence.
  - [Trace debugging](wiki/02-playbooks/trace-debugging.md): reading a Playwright trace locally and
    choosing the next check.
  - [Page Object refactoring](wiki/02-playbooks/pom-refactoring.md): callers, selector-bypass search
    and its limits before a locator or journey change.
- `tests/` — one note per spec: `tests/<path>.spec.ts` → `tests/<path>.md`.
  The part between `<!-- generated:start -->` and `<!-- generated:end -->` is written only by
  `npm run vault:sync`; the explanation below it is written by people. `npm run vault:check`
  reports missing, stale or damaged notes. Not formatted by Prettier. Also refreshed (not staged)
  when Claude edits a spec, and refreshed and staged by `pre-commit` for staged specs. A spec saved
  in an editor by a person refreshes nothing until `npm run vault:sync` or the next commit of that
  spec (the optional `FileChanged` watcher is not configured).
  A note whose spec is deleted or renamed is archived by a person, e.g. in `_raw/archived-tests/`.
- Links: `npm run vault:validate` checks every local link and wikilink in `vault/` (also before each
  push); a note that no other note links to is a warning, except the map, raw notes, logs, imports
  (`sources/`) and journals. A guide under `03-framework/` without a `# Title` (H1) outside code is also a warning.
- `sources/` — imported requirements, product facts and the case catalog.
  - Requirement notes: [SCRUM-15](sources/jira/SCRUM-15.md); store:
    [SCRUM-29](sources/jira/SCRUM-29.md), [SCRUM-33](sources/jira/SCRUM-33.md),
    [SCRUM-37](sources/jira/SCRUM-37.md); backlog seed:
    jira-seed.md (Jira backlog seed, not published).
  - Product notes (confirmed behaviour and shared-data agreements):
    [Blog API](sources/product/blog-api.md), [Store API](sources/product/store-api.md) (items cited by
    number from code), [Store UI checkout](sources/product/store-ui-checkout.md); seed facts:
    [starting data](sources/database/starting-data.md).
  - Test catalog: [Blog API](sources/test-catalog/blog-api.md),
    [Blog UI](sources/test-catalog/blog-ui.md), [baseline map](sources/test-catalog/baseline-map.md);
    store: [Store API](sources/test-catalog/store-api.md),
    [Store UI](sources/test-catalog/store-ui.md).
- [\_context.md](_context.md) — what is verified today, the known limits and the next work.

Nothing under `vault/` is ever recorded in the change log.

## Tree

```
vault/
├── _map.md                     this file
├── _context.md                 verified state, limits, next work
├── _raw/                       unprocessed notes (empty)
├── _changelog/                 written by scripts/vault-sync.mjs only (ignored by Git)
│   ├── YYYY-MM-DD.md
│   └── sessions.log
├── 03-framework/
│   └── hook-lifecycle-map.md
├── 12-progress-report/
│   └── <slug>/YYYY-MM-DD.md    daily journals, /worklog only (ignored by Git)
├── sources/
│   ├── database/
│   │   └── starting-data.md    starting data (seed facts)
│   ├── jira/
│   │   └── SCRUM-*.md          requirement notes (15, 29, 33, 37)
│   ├── product/
│   │   ├── blog-api.md         confirmed blog API behaviour
│   │   ├── store-api.md        store API facts and agreements (numbered items)
│   │   └── store-ui-checkout.md  UI checkout allocation and journeys
│   └── test-catalog/
│       ├── blog-api.md         API cases
│       ├── blog-ui.md          browser cases
│       ├── baseline-map.md     required behaviors → cases
│       ├── db.md               database cases
│       ├── store-api.md        store API cases
│       └── store-ui.md         store browser cases
├── wiki/
│   ├── 01-framework/
│   │   ├── db-map.md           database map (schema metadata only)
│   │   └── verified-test-ids.md  observed data-testid values (rule 10)
│   └── 02-playbooks/
│       ├── trace-debugging.md  reading a trace, next check
│       └── pom-refactoring.md  callers and selector-bypass search
└── tests/                      generated block + human explanation
    ├── blog/                   blog browser notes; api/ holds the blog API notes
    ├── db/                     db-integrity.md (optional QA_DB layer)
    └── store/
        ├── api/                products, cart, coupons, checkout
        └── ui/                 product, cart, coupons, checkout
```

## Tests and their notes

| Note                                                                | Spec                                                                                |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [home.smoke — note](tests/blog/home.smoke.md)                       | [home.smoke.spec.ts — spec](../tests/blog/home.smoke.spec.ts)                       |
| [article-detail.smoke — note](tests/blog/article-detail.smoke.md)   | [article-detail.smoke.spec.ts — spec](../tests/blog/article-detail.smoke.spec.ts)   |
| [category-filter.smoke — note](tests/blog/category-filter.smoke.md) | [category-filter.smoke.spec.ts — spec](../tests/blog/category-filter.smoke.spec.ts) |
| [categories.smoke — note](tests/blog/categories.smoke.md)           | [categories.smoke.spec.ts — spec](../tests/blog/categories.smoke.spec.ts)           |
| [api/auth — note](tests/blog/api/auth.md)                           | [api/auth.spec.ts — spec](../tests/blog/api/auth.spec.ts)                           |
| [api/drafts — note](tests/blog/api/drafts.md)                       | [api/drafts.spec.ts — spec](../tests/blog/api/drafts.spec.ts)                       |
| [api/articles — note](tests/blog/api/articles.md)                   | [api/articles.spec.ts — spec](../tests/blog/api/articles.spec.ts)                   |
| [api/listing — note](tests/blog/api/listing.md)                     | [api/listing.spec.ts — spec](../tests/blog/api/listing.spec.ts)                     |
| [api/comments — note](tests/blog/api/comments.md)                   | [api/comments.spec.ts — spec](../tests/blog/api/comments.spec.ts)                   |
| [api/sessions — note](tests/blog/api/sessions.md)                   | [api/sessions.spec.ts — spec](../tests/blog/api/sessions.spec.ts)                   |
| [auth — note](tests/blog/auth.md)                                   | [auth.spec.ts — spec](../tests/blog/auth.spec.ts)                                   |
| [sessions — note](tests/blog/sessions.md)                           | [sessions.spec.ts — spec](../tests/blog/sessions.spec.ts)                           |
| [drafts — note](tests/blog/drafts.md)                               | [drafts.spec.ts — spec](../tests/blog/drafts.spec.ts)                               |
| [comments — note](tests/blog/comments.md)                           | [comments.spec.ts — spec](../tests/blog/comments.spec.ts)                           |
| [db-integrity — note](tests/db/db-integrity.md)                     | [db-integrity.spec.ts — spec](../tests/db/db-integrity.spec.ts)                     |
| [store/api/products — note](tests/store/api/products.md)            | [store/api/products.spec.ts — spec](../tests/store/api/products.spec.ts)            |
| [store/api/cart — note](tests/store/api/cart.md)                    | [store/api/cart.spec.ts — spec](../tests/store/api/cart.spec.ts)                    |
| [store/api/coupons — note](tests/store/api/coupons.md)              | [store/api/coupons.spec.ts — spec](../tests/store/api/coupons.spec.ts)              |
| [store/api/checkout — note](tests/store/api/checkout.md)            | [store/api/checkout.spec.ts — spec](../tests/store/api/checkout.spec.ts)            |
| [store/ui/product — note](tests/store/ui/product.md)                | [store/ui/product.spec.ts — spec](../tests/store/ui/product.spec.ts)                |
| [store/ui/cart — note](tests/store/ui/cart.md)                      | [store/ui/cart.spec.ts — spec](../tests/store/ui/cart.spec.ts)                      |
| [store/ui/coupons — note](tests/store/ui/coupons.md)                | [store/ui/coupons.spec.ts — spec](../tests/store/ui/coupons.spec.ts)                |
| [store/ui/checkout — note](tests/store/ui/checkout.md)              | [store/ui/checkout.spec.ts — spec](../tests/store/ui/checkout.spec.ts)              |

## Page Objects

- [BasePage.ts](../pages/BasePage.ts) — parts shared by every page (`envBanner`).
- [BlogListPage.ts](../pages/BlogListPage.ts) — blog home: article list, category filter.
- [ArticleDetailPage.ts](../pages/ArticleDetailPage.ts) — one article.
- [LoginPage.ts](../pages/LoginPage.ts) — sign-in.
- [CategoriesPage.ts](../pages/CategoriesPage.ts) — category list (read-only members only).
- [DashboardPage.ts](../pages/DashboardPage.ts) — `/dashboard`, read-only view.
- Store: [ProductPage.ts](../pages/ProductPage.ts) — `/shop/{slug}`;
  [CartPage.ts](../pages/CartPage.ts) — the guest cart; [CheckoutPage.ts](../pages/CheckoutPage.ts) —
  `/checkout`, read-only part. Their test IDs: [Verified test IDs](wiki/01-framework/verified-test-ids.md),
  "Store".

## Environment helpers

- [env/target.ts](../env/target.ts) — the only place the dev and prod addresses are defined.
- [env/runIfEnv.ts](../env/runIfEnv.ts) — skips a spec outside the allowed environments.
- [env/envGuard.ts](../env/envGuard.ts) — blocks a write on prod before it starts.
- [tests/support/env.ts](../tests/support/env.ts) — import point for helpers.
- [tests/support/users.ts](../tests/support/users.ts) — the teaching login (import it; never copy it).
- [tests/support/db.ts](../tests/support/db.ts) — optional read-only database helpers, opt-in with
  `QA_DB=1` ([rule 40](../.claude/rules/40-db-postgres.md), "Optional test layer").
- [tests/support/seed-facts.ts](../tests/support/seed-facts.ts) — `SEED_FACTS`, read from the
  [starting data](sources/database/starting-data.md) block.

## Rules and checks

- Rules: [01 guardrails](../.claude/rules/01-guardrails.md),
  [10 Playwright and Page Objects](../.claude/rules/10-playwright-pom.md),
  [20 test data](../.claude/rules/20-data-management.md),
  [30 test names](../.claude/rules/30-test-names.md),
  [40 database access](../.claude/rules/40-db-postgres.md),
  [45 test design](../.claude/rules/45-test-design.md),
  [50 API tests and the case catalog](../.claude/rules/50-api-swagger.md),
  [60 agent quality](../.claude/rules/60-agent-quality.md),
  [70 flaky triage](../.claude/rules/70-flaky-triage.md),
  [80 triage router and playbooks](../.claude/rules/80-triage-run.md).
- Commands typed by the owner: [/self-heal](../.claude/commands/self-heal.md),
  [/quality-review](../.claude/commands/quality-review.md),
  [/flaky-triage](../.claude/commands/flaky-triage.md),
  [/triage-run](../.claude/commands/triage-run.md), [/adopt-test](../.claude/commands/adopt-test.md);
  daily journal: [/worklog](../.claude/commands/worklog.md).
- Case decisions: [scorecard.md](../evidence/agent-quality/scorecard.md). The weekly course records
  (results, decisions, handoffs) are in the tags `week1-end` to `week6-end`.
- Test design: [test-design/](../test-design/) holds requirement inputs, reviewed designs
  and the boundary fixture; dev contract snapshots under `test-design/contract/` stay untracked. Drafted by
  the read-only [test-designer agent](../.claude/agents/test-designer.md) through
  [/design-tests](../.claude/commands/design-tests.md) and [/cover](../.claude/commands/cover.md).
- Isolated Playwright checks: [safety/](../safety/) through
  [playwright.safety.config.ts](../playwright.safety.config.ts).
- `node:test` checks: [vault-log test](../safety-tests/vault-log.test.mjs),
  [vault-sync test](../safety-tests/vault-sync.test.mjs), [guard test](../safety-tests/guard.test.mjs),
  [worklog test](../safety-tests/worklog.test.mjs),
  [secret-scan test](../safety-tests/secret-scan.test.mjs),
  [pre-push-check test](../safety-tests/pre-push-check.test.mjs),
  [fleet-log test](../safety-tests/fleet-log.test.mjs); run separately (not in
  `test:safety`): [agent-quality bundle test](../safety-tests/agent-quality-bundle.test.mjs),
  [flaky-triage test](../safety-tests/flaky-triage.test.mjs),
  [triage-run test](../safety-tests/triage-run.test.mjs).
- Recorder and note generator: [vault-sync.mjs](../scripts/vault-sync.mjs),
  [vault-notes.mjs](../scripts/vault-notes.mjs); link check: [vault-links.mjs](../scripts/vault-links.mjs).
- Git integration checks: [vault-git test](../safety-tests/vault-git.test.mjs) (disposable
  repository, real hooks), run by `npm run test:git-hooks`.
- Hooks: [guard hook](../scripts/hooks/guard.mjs), [secret-scan hook](../scripts/hooks/secret-scan.mjs),
  [pre-push-check hook](../scripts/hooks/pre-push-check.mjs),
  [pre-commit-notes hook](../scripts/hooks/pre-commit-notes.mjs),
  [session-preflight hook](../scripts/hooks/session-preflight.mjs),
  [stop-worklog hook](../scripts/hooks/stop-worklog.mjs).
