---
paths:
  - '.github/workflows/**'
  - 'scripts/ci-summary.mjs'
  - 'safety-tests/ci-summary.test.mjs'
  - 'safety-tests/ci-workflow.test.mjs'
  - 'scripts/prod-smoke-select.mjs'
  - 'scripts/prod-smoke-allowlist.json'
  - 'safety-tests/prod-smoke.test.mjs'
---

# CI workflow

Applies when the workflow, its helper or their isolated checks change, and whenever anyone starts a run.
A written rule guides this route; it does not stop someone with repository access from changing the file.

## What it is

- `.github/workflows/ci.yml`, jobs `static` (no browser, no secret, no contact with the app), `browser`
  (needs a successful `static`), `ci-result` (the single check worth requiring) and `pr-summary`.
- `scripts/ci-summary.mjs` classifies a run. It runs the reviewed `scripts/slack-report.ts` in preview mode
  and relays its lines; it reimplements no report parsing and never contacts Slack.
- Triggers: pull request to `main` (opened, synchronize, reopened, ready for review), push to `main`,
  manual dispatch. No schedule: a recurring run would be a separate reviewed change with its own approval.
- Target: dev only. The workflow never sets `APP_ENV`, `BASE_URL` or `LOCAL_SANDBOX_DIR`; the npm scripts
  pin dev and `env/target.ts` rejects anything else. `test:prod` never appears in it.

## Do

- Do: ask the owner before pushing the branch, opening the pull request, marking a draft ready or starting a
  manual run: a non-draft pull request run and every manual run contacts dev. Regression writes
  `qa-auto-<runId>-<testId>` records and runs only by hand from `main`; smoke writes nothing.
- Do: keep `browser` on `needs.static.result == 'success'`, never `always()` or `!cancelled()`, and keep the
  dev group `qa-dev-target` with `cancel-in-progress: false`: a killed job skips fixture teardown.
- Do: treat a missing or malformed native report as an error, and zero executed, all-skipped or no executed
  smoke test as incomplete verification. Neither is a pass, whatever Playwright's exit code says.
- Do: upload only the scrubbed native JSON and HTML report, 14 days. Traces are captured on the runner by
  the existing `retain-on-failure` setting and are withheld by design (an owner decision): they can
  hold the session cookie and login request bodies.
- Do: take the empty-input proof from an explicit empty value supplied by the step itself, through the same
  reviewed gate (`resolveDbAccess`). Never delete or change a repository secret to prove a skip; a branch
  does not isolate repository secrets.
- Do not: add `pull_request_target`, a `schedule`, a `secrets.` reference, Slack, a model or MCP call, or
  an action that is not GitHub-owned and pinned to a full commit SHA with its tag in a comment.
- One exception to the `secrets.` line above, approved by the owner. The six teaching-login secrets (`AUTHOR_EMAIL`, `AUTHOR_PASSWORD`,
  `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `OTHER_AUTHOR_EMAIL`, `OTHER_AUTHOR_PASSWORD`) are passed, each as
  `NAME: ${{ secrets.NAME }}`, to the `browser` steps "Run the dev tests" and "Scrub before upload" only;
  `safety-tests/ci-workflow.test.mjs` fails on any other secret or place. Both steps run only for same-repo,
  non-draft pull requests, pushes to `main` and manual runs, so other repositories never receive them. The
  repository owner adds the secrets on GitHub; without them the signed-in smoke test fails and the scrub step
  withholds both reports.

## Limits and open points

- Required checks cannot be set on this private repository (rulesets and branch protection answer 403
  "Upgrade to GitHub Pro or make this repository public"), so the workflow is advisory. A
  workflow file alone enforces no merge gate; if it becomes possible, require `CI result`.
- The scrub step is a text scan for the values exported by `tests/support/users.ts`, a session cookie
  shape and a bearer shape, plus the report data embedded in the HTML. It cannot prove that no private
  page content remains. Anything it cannot read is withheld.
- A cancelled or timed-out regression run can leave `qa-auto-` records, and a store cart row may remain by
  design. Nothing sweeps them; the summary names the run id so a person can review.
- The checks are written on Windows and CI runs on Linux: a Linux run skips 2 Windows-only safety checks,
  and a change can fail there although it passed locally.
- Action versions are pinned by commit (tag to commit and runtime only; their code is not reviewed here).
- Verify: `node --test safety-tests/ci-summary.test.mjs safety-tests/ci-workflow.test.mjs`, then the pull
  request run itself.

## Optional production smoke (manual only)

- `.github/workflows/prod-smoke.yml` is a separate workflow, so `ci.yml` and its policy tests stay as
  reviewed. Manual dispatch only, from `main`, with the exact input `READ-ONLY-PROD`. No schedule, push or
  pull request trigger.
- A tag is not eligibility. Only `scripts/prod-smoke-allowlist.json` selects tests for production, and
  `scripts/prod-smoke-select.mjs` re-checks every entry: the spec declares `runIfEnv(test, [..'prod'..])`,
  the whole file is guest-only (no credentials, no `envGuard`, none of the write names that
  `check-env-gates` knows) and the title is in the file. Nothing is approved today: the allowlist is
  empty, so the job stops at the gate, before a browser is installed and before any request to production.
- Target: the existing resolver (`npm run test:prod`, `APP_ENV` prod) with `BASE_URL` unset. No credential
  and no secret. Reports: the same scrubbed JSON and HTML, 14 days, as `prod-native-json` and
  `prod-html-report`; the summary uses `--role prod-smoke --target prod`.
- Do: ask the owner before every dispatch; it reads production (rule 01).
- Do not: add an allowlist entry without the owner's written approval and a reviewed policy change. Rule 01,
  the README and `check:env-gates` (`E_NOT_DEV_ONLY`) require every spec to be dev-only today, so a
  prod-eligible spec cannot pass the checker yet.
- Limits: `workflow_dispatch` needs this file on `main`; it has not run. No document confirms that any page
  is safe to read on production, and nothing here proves one is.
- Verify: `node --test safety-tests/prod-smoke.test.mjs`.
