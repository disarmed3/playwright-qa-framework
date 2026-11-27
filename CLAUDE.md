# qa-framework — instructions for Claude

Playwright + TypeScript tests (browser, API, opt-in database) for one site with a blog and a store; see [README.md](README.md).

## Always ([rule 01](.claude/rules/01-guardrails.md))

1. No data changes on prod.
2. Human approval before any action that changes an outside system (dev data, Jira, Slack, …).
3. No secrets in tracked files or output.
4. Ask before installing packages, committing, pushing or opening a pull request (a non-draft one runs `@smoke` on dev, [rule 95](.claude/rules/95-ci-workflow.md)).

## Targets and data

- dev → https://dev.ai-orchestration-courses.com (used when `APP_ENV` is unset); prod → https://ai-orchestration-courses.com
- Defined only in [env/target.ts](env/target.ts); never hard-code URLs or add targets. `APP_ENV` is exactly `dev` or
  `prod`; leave `BASE_URL` unset; never set `LOCAL_SANDBOX_DIR`; one target per process. Helpers import
  [env/target.ts](env/target.ts) or [tests/support/env.ts](tests/support/env.ts), never `playwright.config.ts`.
- Database only via the restricted `postgres` MCP server, `scripts/verify-student-fence.sh`, `scripts/seed-integrity.sh`
  and the opt-in `tests/support/db.ts` (`QA_DB=1`); each run needs approval ([rule 40](.claude/rules/40-db-postgres.md)).

## Teaching logins

- `AUTHOR`, `ADMIN` and `OTHER_AUTHOR` in [tests/support/users.ts](tests/support/users.ts) are the only accounts; import them.
  Values: `AUTHOR_EMAIL`, `AUTHOR_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `OTHER_AUTHOR_EMAIL`, `OTHER_AUTHOR_PASSWORD`
  from the environment, else `.env` (the owner's; Claude never reads it), in CI repository secrets; `.env.example`
  lists the names. Never commit, copy or print a value; never add a personal account.
- Writes only on dev, only to the test's own `qa-auto-` records; `OTHER_AUTHOR` only makes refused requests against
  them. Never change or delete a seeded article (ids 1 to 7).

## Commands

- `npm test` (dev) · `test:list` (runs nothing) · `typecheck` · `lint` (any warning fails) · `format:check` · `check:env-gates`
  (`runIfEnv` first in every describe, writes inside `envGuard`) · `test:safety` (no browser, no network) ·
  `test:git-hooks` · `vault:sync` · `vault:check` · `vault:validate`
- Run alone (`node --test safety-tests/<name>.test.mjs`): the triage, quality, Slack, CI, prod-smoke and Jira suites.
- Typed by the owner only (`disable-model-invocation`): `/adopt-test`, `/design-tests`, `/cover`, `/self-heal`,
  `/quality-review`, `/flaky-triage`, `/triage-run`, `/triage-draft`, `/writeback` (proposes only). `/traceability`
  reads Jira; `/report-bug` previews and never files.
- Only with explicit approval in this conversation: `npm run test:prod`; `QA_DB=1 npm test -- tests/db`; Slack
  `--check-connection` or `--send` (rule 90); a model call by `/triage-draft` or `quality-run.mjs` (rules 60, 80);
  `writeback.mjs execute`, run by the owner in their own terminal (rule 55).

## Rule files (loaded automatically)

| File                         | Applies when                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `01-guardrails.md`           | Always, in every folder                                                               |
| `10-playwright-pom.md`       | Editing `tests/` or `pages/`                                                          |
| `20-data-management.md`      | Tests or Page Objects that read or create data; `scripts/`                            |
| `30-test-names.md`           | Adding or renaming a test in `tests/**/*.spec.ts`                                     |
| `40-db-postgres.md`          | Always: any database access                                                           |
| `45-test-design.md`          | Test design in `test-design/`; reading the case catalog for a design                  |
| `50-api-swagger.md`          | API tests; the case catalog in `vault/sources/test-catalog/`                          |
| `55-integrations.md`         | Jira: `scripts/jira/`, `/traceability`, `/writeback`, `/report-bug`                   |
| `60-agent-quality.md`        | `evidence/agent-quality/`; `/self-heal`, `/quality-review`                            |
| `70-flaky-triage.md`         | `scripts/flaky-triage.ts`, `evidence/fixtures/flaky/`, `/flaky-triage`                |
| `80-triage-run.md`           | `/triage-run`, `/triage-draft` (`scripts/triage/`), `evidence/triage/`, the playbooks |
| `90-failure-notification.md` | The Slack reporter `scripts/slack-report.ts`; running it                              |
| `95-ci-workflow.md`          | `.github/workflows/`, `scripts/ci-summary.mjs` and their checks                       |
