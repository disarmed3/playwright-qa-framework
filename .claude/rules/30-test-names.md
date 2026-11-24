---
paths:
  - 'tests/**/*.spec.ts'
---

# Test names

## Rule

Each line printed by `npm run test:list` must say who acts or what state applies, the action, and the
expected result, so a reader understands the test without opening the code.

- The `describe` names the page or feature and keeps its `(dev only)` tag.
- The `test` title names the action and the expected result, in the requirement's words.
- The title promises no more than the assertions check.
- No IDs, emails or secrets in titles, except the catalog case ID below.

## When

Adding a test or renaming one. Existing titles stay as they are unless a rename is approved: tools and
records refer to tests by their title.

## Example

- ❌ `categories › test 2`, `› should work`
- ✅ `categories smoke (dev only) › a signed-in author sees the category list with at least one item`

## Verify

1. Run `npm run test:list` and read each line without opening the code.
2. Compare each title with its `expect` calls; every promise in the title is asserted.

⚠️ A title that claims more than the test checks (e.g. "…shows the same title" while asserting only
visibility) passes every current check; no check reads titles.

## Exception: catalog case IDs

Emails and secrets stay forbidden.

- Do: a test mapped to a catalog case starts its own title with that exact case ID, then the action
  and expected result in the requirement's words:
  `TC-API-010 login returns a token and the full user record`.
- Only an ID defined once in `vault/sources/test-catalog/` (format in
  [rule 50](50-api-swagger.md)). No other ID, Jira key, selector or environment name in a title.
- The ID goes in the individual `test` title. A `describe` title, comment or mapping note alone does
  not link a result to the case.
- Existing titles stay as they are (see "When"); adding an ID to the five early smoke tests is a rename
  and needs separate approval.
- Verify: every ID at the start of a title in `npm run test:list` is defined in the catalog.

## Suite tags

Tags select tests; they never permit production changes, and `runIfEnv(test, ['dev'])` stays the first
line of every describe.

- Do: put a tag in the details argument, never in the title: `test.describe('…', { tag: '@regression' }, …)`
  or `test('…', { tag: '@smoke' }, …)`. A test inherits its describe's tags.
- `@regression`: every describe outside `tests/db` (full dev run before a PR). `@smoke`: a few
  guest, read-only tests for a quick check after a dev change. `@e2e`: a journey that writes
  test-owned records on dev; run only with approval. `tests/db` stays untagged (opt-in `QA_DB=1`).
- Verify: `npm run test:list` lists them; select with `--grep "@smoke"`. A text search for `@` is not an audit.
