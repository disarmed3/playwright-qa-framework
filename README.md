# qa-framework

Automated tests for one web application with two parts: a **blog** (articles, categories, comments, drafts,
login) and an **online store** (products, cart, coupons, checkout, orders). Playwright + TypeScript.

- **73 tests in 23 files**: browser (UI) tests through Page Objects, API tests against the documented
  contract, and opt-in read-only database checks.
- **Two targets, one of them protected:** tests run on dev; prod is read-only and every current test skips there.
- **Checks around the tests:** an environment checker, isolated safety suites, Git hooks, CI on every pull
  request, a Slack failure reporter, Jira traceability and a local dashboard.
- **An AI-assisted workflow with limits:** Claude Code works under written rules, hooks and owner approvals;
  AI drafts come from separate no-tool processes and are proposals, never decisions.

## Quick start

You need Node 24.

```sh
npm install                        # exact versions from package-lock.json; also switches on the Git hooks
npx playwright install chromium    # downloads the browser; runs no test
npm run test:safety                # isolated checks: no browser, no network, no credentials
npm run test:list                  # lists the 73 tests; runs nothing
```

Signed-in tests need three teaching logins. Copy `.env.example` to `.env` and fill in the six values
(`AUTHOR_EMAIL`, `AUTHOR_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `OTHER_AUTHOR_EMAIL`, `OTHER_AUTHOR_PASSWORD`).
`.env` is ignored by Git and never committed. Then `npm test` runs the suite against dev. Some tests create
their own `qa-auto-…` records on dev and delete them afterwards.

## Commands

| Command                                   | What it does                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm test`                                | Runs the tests against **dev**.                                                                   |
| `npm run test:prod`                       | Runs against **prod**; chosen on purpose only. Every current test skips there.                    |
| `npm run test:list`                       | Lists all tests without running them.                                                             |
| `npm run check:env-gates`                 | Reads every spec as syntax: each describe starts with `runIfEnv`, every write sits in `envGuard`. |
| `npm run test:safety`                     | Isolated checks of the target rules, helpers and hook scripts. No browser, no network.            |
| `npm run test:git-hooks`                  | Isolated checks of the Git hooks in a disposable repository.                                      |
| `npm run typecheck`                       | Checks the TypeScript types; runs no code.                                                        |
| `npm run lint`                            | ESLint on the TypeScript and `.mjs` files; any warning fails.                                     |
| `npm run format` / `npm run format:check` | Prettier rewrites / only checks formatting.                                                       |
| `npm run vault:sync`                      | Refreshes the generated block of each spec note in `vault/tests/` from its spec.                  |
| `npm run vault:check`                     | Fails when a spec note is missing, out of date or damaged.                                        |
| `npm run vault:validate`                  | Fails when a link in `vault/` points at a file that does not exist.                               |

`typecheck` proves the code fits together; `test:safety` runs it and proves it behaves. You need both. The
tool suites (triage, Slack, Jira, CI helpers) run alone: `node --test safety-tests/<name>.test.mjs`.

## The two environments and what protects them

| `APP_ENV`          | Site                                     |
| ------------------ | ---------------------------------------- |
| `dev` (or not set) | https://dev.ai-orchestration-courses.com |
| `prod`             | https://ai-orchestration-courses.com     |

- The address is defined in one place only, `env/target.ts`; tests open pages by path, like `/login`.
- `APP_ENV` must be exactly `dev` or `prod`; any other value (empty, `DEV`, `staging`, extra spaces) stops the
  run. Leave `BASE_URL` unset; `LOCAL_SANDBOX_DIR` is not supported. Each process picks its target once.
- `npm test` always sets `APP_ENV=dev`, even if your shell says `prod`; only `npm run test:prod` targets prod.
- Every test group starts with `runIfEnv(test, ['dev'])`, so on prod it is **skipped** before any page opens.
- Every action that changes data runs inside `envGuard(() => …)`, which throws on prod before the action starts.
- `npm run check:env-gates` (also before every push) fails when a spec misses either of the two.
- Retries are zero: a test that fails once and then passes would otherwise be shown as passed.

**What these do not stop:** they protect only this test code. A browser you open yourself, or an MCP browser,
can still visit prod. `envGuard` protects only writes that go through it, and `check:env-gates` sees spec
syntax, not what a helper does. The `DEVELOPMENT` banner check is a test, not a safety lock.

## Project layout

| Path                                | What it holds                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `tests/`                            | The specs: `blog/`, `blog/api/`, `store/api/`, `store/ui/`, `db/`; `support/` helpers |
| `pages/`                            | Page Objects, one class per page                                                      |
| `env/`                              | `target.ts` (the only target definition), `runIfEnv.ts`, `envGuard.ts`                |
| `safety/`, `safety-tests/`          | Isolated checks (Playwright with its own config, and `node:test`)                     |
| `scripts/`                          | Hooks, the environment checker, triage, Slack reporter, Jira tools, CI helpers        |
| `vault/`                            | Knowledge base: case catalog, requirement notes, guides, playbooks, one note per spec |
| `test-design/`                      | Requirement inputs and reviewed test designs                                          |
| `evidence/`                         | Inputs the tools and their checks read: fixtures, sanitized reports, practice cases   |
| `.claude/`                          | Rules, commands, the test-designer agent, hook settings                               |
| `.husky/`, `.github/workflows/`     | Git hooks; CI                                                                         |
| `tools/qa-dashboard/`, `jira-seed/` | The dashboard kit; the Jira backlog seed pack                                         |

Start reading the vault at [vault/\_map.md](vault/_map.md).

## How the AI workflow is controlled

Three layers, each with a limit:

- **Project rules** — [CLAUDE.md](CLAUDE.md) and `.claude/rules/`: instructions Claude reads in every
  session and people read in review (for example: every write inside `envGuard`; approval before any outside
  change). Limit: nothing enforces a rule by itself; only review or a hook catches a violation.
- **Claude hooks** — `.claude/settings.json`: the edit guard before `Edit`/`Write` (it refuses, for example,
  an added `.only` or a removed `runIfEnv`, and warns on shared files), the change recorder, the startup
  summary and the journal reminder. Limit: they see only Claude's own edit tools, and the guard fails open on
  unexpected input.
- **Git hooks** — `.husky/`, for everyone who commits or pushes. `pre-commit`: a secret scan of every staged
  file (protected names such as `.env` and keys, and known token patterns; it names the file, never the value),
  Prettier and ESLint, and the spec-note refresh. `pre-push`: refuses any push to `main`, then typecheck, the
  test listing, `check:env-gates`, `vault:check` and `vault:validate`. Limit: hooks are local; a fresh clone
  has none until `npm install`. Never bypass them (`--no-verify`, `HUSKY=0`).

Slash commands in `.claude/commands/` wrap the workflows. The ones that call a model (`/triage-run`,
`/triage-draft`, `/self-heal`, `/quality-review`) start a separate `claude -p` process with no tools, no MCP
servers and no settings, send it only sanitized text, and trust its reply only when its first event proves
that. Their output is a draft for the owner to check. `/writeback` and `/report-bug` only propose Jira changes;
a Jira comment is written only by the owner, in their own terminal, after approving one exact row.

## CI

`.github/workflows/ci.yml` runs on every pull request to `main`, on pushes to `main` and by hand:

1. **Static checks**: format, lint, typecheck, environment checker, test listing, the safety suites, the hook
   and CI checks, and the vault checks. No browser, no secret.
2. **Dev tests**: the `@smoke` tests against dev, only after the static checks pass, and only for pushes to
   `main`, manual runs and non-draft pull requests from this repository (a manual `regression` run, which
   writes `qa-auto-` records, only from `main`). The six login values come from repository secrets, the only
   secrets the workflow reads.
3. Reports are scrubbed for login values and session data before upload; a summary comment lands on the pull
   request.

The workflow is advisory: branch protection is not available on this private repository, so `CI result` is
not a required check.

## What is excluded

| Path                                                    | Compile | Lint     | Format   | Secret scan |
| ------------------------------------------------------- | ------- | -------- | -------- | ----------- |
| `jira-seed/**`, `scripts/jira-seed.mjs` (supplied pack) | —       | excluded | excluded | **scanned** |
| `tools/qa-dashboard/`, `qa-dashboard.config.json`       | —       | excluded | excluded | **scanned** |
| `vault/_changelog/`, `vault/12-progress-report/` (logs) | —       | —        | —        | not tracked |

Our `.mjs` scripts and `node:test` files are linted with Node globals but not type-checked; the isolated
suites run them instead.

## Local QA dashboard

QA Dashboard **0.1.3**, a local companion that lists every test, runs selected ones on dev and keeps run
history (MIT License, © 2026 Oles Tsaruk; notices in `tools/qa-dashboard/LICENSE` and
`tools/qa-dashboard/docs/THIRD-PARTY-NOTICES.md`). It installs from the archive in `tools/qa-dashboard/`
(a `file:` dev dependency pinned by hash), so every computer gets the same file.

**Start on Windows:** double-click `tools\qa-dashboard\start.cmd`, open the URL it prints (normally
http://localhost:4173) and keep that terminal open. **Stop:** close the dashboard tab, then press Ctrl+C in the
terminal (answer Y if Windows asks `Terminate batch job`). Use `--port 4180` when port 4173 is taken.
**Other platforms:** with `BASE_URL` and `LOCAL_SANDBOX_DIR` unset, run `npx --no-install qa-dashboard start`.

- `start.cmd` sets `QA_DASHBOARD_CODEMIFY_COURSE=1`, which removes `BASE_URL` and `LOCAL_SANDBOX_DIR` from its
  own process; that one line is why it differs from `tools/qa-dashboard/SHA256SUMS.txt`.
- Dev is enabled; prod is disabled and not approved. Selecting tests that change data still needs approval.
- Run history, reports and traces stay in the ignored `.qa-dashboard/` folder.
- Not supported: `repeatEach` above 1, multiline titles, live CI or Jira connections. Windows is the verified
  platform. Case links come from a TC ID in the test title; the older smoke titles have none.

## Using this in a team

- **Kept apart:** defined checks (scripts and CI, the same answer every time); AI drafts (useful, fallible,
  checked against the report); and changes to outside systems (Slack, Jira, dev data, prod), each approved by
  a person for that one action. An approval says an action may happen; it does not say the result is right.
- **Widen in this order**, reading the result of each step first: `test:safety` and `test:list`; the `@smoke`
  tests on dev (read-only); the full dev suite (writes its own `qa-auto-` records, needs approval); any Slack,
  Jira or prod action, each approved separately.
- **Scope decisions:** prod is read-only and nothing is approved for it; one target per process; test data is
  only `qa-auto-` records and seeded articles (ids 1 to 7) are never changed; secrets stay out of files and
  output; a Slack send needs a preview and a matching digest; a Jira write needs one approved row, the owner's
  terminal and a separate token; only the owner accepts a result.
- **Accounts:** GitHub access; the three dev teaching logins in `.env` (and as repository secrets for CI); a
  Claude Code subscription for the AI drafts; optionally a Slack bot, a Jira site with a write token, and a
  database login for `QA_DB=1`. Plans, limits and costs of these services are not verified here.

## History

Built week by week during a six-week QA automation course. The tags `week1-end` to `week6-end` hold each
graded state, with its weekly notes, run records and the dated history of every rule; the main branch holds
the framework itself.
