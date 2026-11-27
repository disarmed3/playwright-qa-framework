# Guardrails (apply everywhere)

No `paths:` restriction: these rules apply in every folder and every session.
"Verify" says how a reviewer or an existing check confirms the rule. Only a rule marked
"checked by" has a command that catches a violation; everything else depends on review.

## Prod is read-only

- Do: never submit forms, create, edit or delete anything on prod — from tests, scripts or the MCP browser.
- When: always.
- Verify: review. For tests, an approved `npm run test:prod` must show every test skipped.

## Data-changing tests run on dev only

- Do: every `test.describe`, nested ones too, starts with `runIfEnv(test, ['dev'])`.
- When: every file in `tests/**/*.spec.ts`.
- Verify: checked by `npm run check:env-gates` (`scripts/check-env-gates.mjs`, also a `.husky/pre-push` step),
  which reads every spec as syntax. It also requires every write in a dev-only block to sit inside an
  `envGuard(() => …)` closure (next section). Limits: it knows only the closed list of write names in its
  header, does not read `tests/support/` or `pages/` and cannot see what a helper does; sign-in and
  sign-out calls are a NOTE, not a failure (an owner decision).
- What the helper does ([env/runIfEnv.ts](../../env/runIfEnv.ts)): calls `test.skip(...)` unless the
  process's pinned environment is in the allowed list; the skip reason names both.
- ⚠️ A spec without `runIfEnv` runs on prod. Typecheck, `test:list` and `npm test` on dev all pass;
  only the checker or an approved prod run would reveal it, and by then a prod run is already hitting prod.

## Every write goes through envGuard

- Do: pass the write as a closure and describe it in a step title:
  ```ts
  await test.step('create category "qa-auto-…"', () => envGuard(() => categories.create(name)));
  ```
- When: any call that creates, edits or deletes data (UI submit, API call, cleanup).
- Verify: review — the write starts inside the closure, and the step title names the action and record.
- What the helper does ([env/envGuard.ts](../../env/envGuard.ts)): checks synchronously and, on prod,
  throws `EnvGuardError` (`PROD_ACTION_BLOCKED`) before calling the action. It takes no description and
  has no dry-run mode, so the description lives in the `test.step` title.
- ⚠️ A write started outside the closure (`const p = create(); envGuard(() => p)`) or not wrapped at all
  is not blocked. Dev runs pass, and `test:safety` checks the helper itself, not how tests call it.

## Human approval before changing an outside system

- Do: before acting, state the action, the system (dev app, Jira, Slack, …) and the records it touches;
  wait for approval. Approval covers only that described activity — not later or unrelated changes.
- When: running a test that changes dev data; submitting a form with the MCP browser; `npm run test:prod`;
  any Slack or Jira write.
- Verify: the conversation shows the description and the approval before the action.
- ⚠️ `npm test` is pre-allowed in [.claude/settings.json](../settings.json). Running the suite changes
  dev data with no permission prompt; only this rule stops it.

## No secrets in git or output

- Do: never read or print `.env*`, `.auth/`, keys, tokens or storage-state files. Never put passwords or
  tokens in notes, logs, commits, test titles or chat.
- When: always.
- Verify: checked by `.gitignore`, which keeps `.env*` (except `.env.example`), `.auth/`, keys and
  storage-state files out of commits (`git check-ignore .env` prints `.env`), and by the pre-commit secret
  scan. The deny list in `.claude/settings.json` is meant to block Claude reading those files; only the
  `Read(./.env.*)` and `Edit(.env*)` denials were tested (with harmless fixtures). It has no storage-state
  entry, and a shell command such as `cat` is not covered by a `Read(...)` rule. Review covers notes and
  output.
- ⚠️ `.gitignore` does not cover tracked notes in `vault/`, `evidence/` or `test-design/`, and the secret
  scan knows only four token patterns; a pasted password there would be committed unnoticed.

## Safety checks stay isolated

- Do: isolated checks live in `safety/` (Playwright, only through `playwright.safety.config.ts`) and
  `safety-tests/` (`node:test`, through the `node --test` part of `npm run test:safety`,
  `npm run test:git-hooks` for the Git hook scripts, or alone with `node --test` for the tool suites) — no
  browser or device project, no `baseURL`, no network, no setup that contacts the app. Browser, API and
  database tests live in `tests/`.
- When: adding or changing a check in either folder, either Playwright config, or the `test:safety` script.
- Verify: review the output — `npm run test:list` lists only tests from `tests/` (73 in 23 files when this
  rule was last revised) and no `@safety` title, and `npm run test:safety` exits 0 with every check passed
  in both runners. Compare both counts with the previous run; a change needs an explanation.
  Neither command fails when a check is in the wrong folder.
- ⚠️ A safety check placed in `tests/` joins the test suite, and both commands still exit 0; only
  someone comparing the listed titles or the counts would notice.

## MCP browser

- Do: use the Playwright MCP browser read-only, on dev only, unless an action was approved as above.
- When: any MCP browser session.
- Verify: review of the session.

## Never bypass a failing Git hook

- Do: when `.husky/pre-commit` or `.husky/pre-push` fails, fix the cause. Never use `--no-verify`
  (or `-n` on commit), `HUSKY=0`, or unset or change `core.hooksPath` to get past it. `ALLOW_MAIN_PUSH=1`
  is only for an exceptional, agreed push to `main` by a maintainer — never for routine work.
- When: every commit and push, by Claude or a person.
- Verify: review; a hook cannot detect its own bypass. `git config core.hooksPath` should print
  `.husky/_` after `npm install`.
- ⚠️ A bypass silently skips the secret scan, lint, the `main` block, typecheck and the test listing;
  the commit or push looks normal.

## Shared files: tiers and cross-impact

- Do: before changing a tracked file, find its tier below and follow it. A change to a CRITICAL file,
  or a rename or removal of an existing EXTEND-ONLY member, needs a CROSS-IMPACT record (format below)
  in the pull request description and the owner's approval in the conversation before it is made.
- When: every change to a tracked file, by Claude or a person.
- Verify: review — each such change has its record and approval. `scripts/hooks/guard.mjs` prints
  `guard: WARN — shared file; review the affected callers before approving` for its coded CRITICAL list.
- ⚠️ The warning is not approval: the guard exits 0 and returns no `permissionDecision`, so whatever
  the permission mode allows still happens. Only the owner's yes in the conversation approves.

| Tier         | Meaning                                                                                      | Paths                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRITICAL     | Owner approves a change before it is made, with a CROSS-IMPACT record. The guard warns.      | `playwright.config.ts`, `playwright.safety.config.ts`, `tsconfig.json`, `package.json`, `eslint.config.mjs`, `.prettierrc.json`, `.gitignore`, `env/target.ts`, `env/runIfEnv.ts`, `env/envGuard.ts`, `tests/support/env.ts`, `tests/support/users.ts`, `.claude/settings.json`, `.husky/pre-commit`, `.husky/pre-push`, `scripts/hooks/guard.mjs`, `scripts/hooks/secret-scan.mjs`, `scripts/hooks/pre-push-check.mjs`, `scripts/hooks/session-preflight.mjs`, `scripts/hooks/stop-worklog.mjs`, `scripts/vault-sync.mjs`, `.claude/hooks/fleet-log.mjs` |
| ADD-ONLY     | Add entries, cases or records; changing or removing existing ones needs review.              | `safety/**`, `safety-tests/**` (the isolated checks), `.claude/rules/*.md`, `CLAUDE.md`, `README.md`, `.claude/commands/*.md`, `vault/wiki/01-framework/verified-test-ids.md`                                                                                                                                                                                                                                                                                                                                                                             |
| EXTEND-ONLY  | Add members; renaming or removing an existing member needs a CROSS-IMPACT record and review. | `pages/*.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FULL CONTROL | Normal edits under every other rule here, still tested and reviewed.                         | `tests/blog/*.spec.ts`, the other `evidence/*` files, `vault/_raw/**`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

- Generated files are not a tier: `vault/_changelog/**` (written by `scripts/vault-sync.mjs`), the spec-note
  blocks in `vault/tests/` (written by `npm run vault:sync`) and `package-lock.json` (written by
  `npm install`). Their tool writes them again on its next run, so a hand edit is overwritten or leaves a
  record that no longer matches what happened. Change the tool, never the output.
- Not tracked: `vault/_changelog/**` and the daily journals `vault/12-progress-report/**` are kept locally
  and ignored by Git. The journals are read by `session-preflight.mjs` and `stop-worklog.mjs` and written
  only through `/worklog`.
- Why `verified-test-ids.md` is ADD-ONLY: it is the only source of test IDs that rule 10 allows. Adding an
  observed row cannot weaken it; changing or removing one can.
- Why the isolated checks are ADD-ONLY: `safety/target.safety.spec.ts:50` lists `'staging'` among the values
  that must be rejected (asserted at `:95-98`); adding a case cannot weaken that, editing an existing
  assertion can.

### What could break for each CRITICAL entry

| Path                                                                                                             | Used by                                                                                                  | What breaks on a careless change                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env/target.ts`                                                                                                  | `playwright.config.ts`, `env/runIfEnv.ts`, `env/envGuard.ts`, `tests/support/env.ts`, `safety/**`        | a changed address or pinning sends every run to the wrong site without an error                                                                   |
| `env/runIfEnv.ts`                                                                                                | every `describe` of all 23 specs in `tests/`, `safety/probes/run-if-env.probe.ts`                        | an inverted or loosened check runs dev-only tests on prod; only an approved prod run shows it                                                     |
| `env/envGuard.ts`                                                                                                | every write in 13 spec files and `tests/support/api.ts`, `store.ts`; `safety/probes/env-guard.probe.ts`  | the last block before a data change on prod; on dev it never throws, so no dev run exercises the refusal                                          |
| `tests/support/env.ts`                                                                                           | `tests/support/api.ts`, `tests/support/db.ts`; `CLAUDE.md` names it as the import point for helpers      | helpers would read a wrong target                                                                                                                 |
| `tests/support/users.ts`                                                                                         | `tests/support/api.ts`, three specs under `tests/blog/`, the CI report scrub in `scripts/ci-summary.mjs` | a changed login or variable name fails every signed-in test, and the scrub withholds the CI reports; its values must never be copied              |
| `playwright.config.ts`                                                                                           | every test run                                                                                           | `baseURL`, `testIdAttribute` (every `getByTestId`), `forbidOnly` or `retries: 0` change silently                                                  |
| `playwright.safety.config.ts`                                                                                    | `npm run test:safety`                                                                                    | a `baseURL` or browser project breaks the isolation rule while every check still passes                                                           |
| `tsconfig.json`, `package.json`, `eslint.config.mjs`, `.prettierrc.json`                                         | typecheck, lint, format, lint-staged, both Git hooks, CI, `npm test` (`APP_ENV=dev`)                     | a changed include, script or exclusion changes what the checks cover, with every check green                                                      |
| `.gitignore`                                                                                                     | every `git add`                                                                                          | `.env*`, `.auth/` or keys can be committed; logs that should stay local are committed                                                             |
| `.claude/settings.json`, `.husky/pre-commit`, `.husky/pre-push`, `scripts/hooks/*.mjs`, `scripts/vault-sync.mjs` | every Claude session, every commit and push; tested by `safety-tests/*.test.mjs`                         | a broken hook silently removes a check (the edit guard fails open) or blocks all work                                                             |
| `.claude/hooks/fleet-log.mjs`                                                                                    | `SubagentStart` and `SubagentStop` in every Claude session; tested by `safety-tests/fleet-log.test.mjs`  | an exit 2 or any output can keep a subagent running or add text to its context; a changed field list writes the reply or a user path into the log |

Counts in this table were taken when the rule was last revised; recount with
`git ls-files 'tests/**/*.spec.ts'` and `git grep -l "envGuard(" -- tests` before relying on a number.

### CROSS-IMPACT record format

`changed symbol -> used-by file:line -> breaking / behavioral / safe -> action`

One line per caller. breaking: the caller stops compiling or running until it is changed. behavioral:
it still compiles and passes but behaves differently. safe: the caller is not affected. Example:

`users.ts AUTHOR (env getters) -> tests/blog/auth.spec.ts:6 -> behavioral -> a missing variable fails that test by name`

### The coded list in the guard

- `CRITICAL_PATHS` in `scripts/hooks/guard.mjs` is the only thing that creates the warning, and
  `safety-tests/guard.test.mjs` keeps its own copy. The guard reads only the proposed tool call, never
  this table, so a path added here and not there gets review but no warning, and nothing fails.
  Change all three together.
- The warning comes only after all eight refusal checks pass; a refusal still exits 2 with no JSON.
  It covers Claude's `Edit` and `Write` only, paths it can place inside the project.
