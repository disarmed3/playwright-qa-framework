# Framework configuration contract

The framework owns `qa-dashboard.config.json`; the installed package owns the application. Configuration is JSON, not executable code. Never store secrets here.

## Minimal configuration

`qa-dashboard init` writes a complete configuration with disabled execution. Edit through Setup or propose JSON using the bundled prompts. The schema is in [schema.json](schema.json).

The root fields are:

| Field              | Meaning                                                       |
| ------------------ | ------------------------------------------------------------- |
| schemaVersion      | Currently 1                                                   |
| name               | Friendly workspace name                                       |
| playwright.config  | Config path relative to the framework root                    |
| defaultEnvironment | ID of one configured environment                              |
| environments       | One to eight reviewed execution profiles                      |
| classifications    | Path-prefix rules for product, layer, and feature             |
| suites             | Declarative selections that follow discovered tests           |
| labels             | Friendly per-test descriptions, preserving native identity    |
| sources            | Optional journal paths and case-catalog paths                 |
| prerequisites      | Required variable names by source path                        |
| execution          | workers (1/2/4), retries (0/1/2), timeoutMs (1,000–3,600,000) |

## Environments

Each profile has `id`, `name`, `description`, `enabled`, `production`, `env`, `requiredEnv`, `allowedTags`, and `approvedFiles`. Optional `url` describes the target. If `urlEnv` is provided, `env[urlEnv]` must equal `url`.

The target is controlled by the **framework's own configuration**. An environment variable only changes it if that framework actually reads the variable. Discovery reports the Playwright baseURL values; a mismatch with the declared URL produces a warning. Tests can still call explicit URLs, so review source and policy before approving execution.

`env` may contain non-secret strings such as APP_ENV or BASE_URL. Credential-bearing names and runtime injection options such as NODE_OPTIONS are rejected. Required variable names belong in `requiredEnv`; supply their values through the server's normal process environment.

When `production: true` and `enabled: true`, both file and tag allowlists must be non-empty. A production test must satisfy both, as must applicable dependency checks. Approved files use exact framework-relative paths. The user is responsible for reviewing them as read-only; neither tag names nor AI inference establish that.

New configuration starts with execution disabled. Review the framework's discovered target, global setup, teardown, dependency projects, and web-server hooks before enabling it.

## Codemify 0.1.2 migration

The corrected course framework accepts only its two canonical dev/prod targets.
`APP_ENV` must be exactly `dev` or `prod`; `BASE_URL` must be absent or exactly
match the selected target. `LOCAL_SANDBOX_DIR` must be absent, not a blank string.
The 0.1.2 Codemify preset no longer supplies that obsolete field.

For a configuration created by the 0.1.1 preset:

1. Stop the dashboard and back up `qa-dashboard.config.json` without copying
   secret values into another file or message.
2. In each Codemify environment's `env` object, remove the `LOCAL_SANDBOX_DIR`
   property entirely. Keep your reviewed targets, enable/disable choices, suites,
   labels and other customizations. Check that the JSON remains valid.
3. Unset the same variable in the terminal starting the dashboard. For PowerShell:
   `Remove-Item Env:LOCAL_SANDBOX_DIR -ErrorAction SilentlyContinue`.
   For bash/zsh: `unset LOCAL_SANDBOX_DIR`.
4. Start a fresh dashboard process, review the framework imports and run
   `npx qa-dashboard validate`. Discovery loads project code but does not execute
   test bodies; do not use it on an untrusted project.
5. Keep production disabled. Preview and run only a separately approved small
   development selection when ready.

Installing a package update and rerunning `init` preserve an existing config;
they do not perform this migration for you. If an obsolete variable is still
inherited, the course framework stops with an error asking you to unset it.
The generic dashboard does not silently strip arbitrary framework variables.

## Windows launcher environment

The 0.1.3 launcher template belongs at `tools/qa-dashboard/start.cmd` in the framework. It preserves the inherited environment with `set "QA_DASHBOARD_CODEMIFY_COURSE=0"` by default. Only for a reviewed Codemify course framework, change that local line to `set "QA_DASHBOARD_CODEMIFY_COURSE=1"`. Before starting the installed CLI, this mode removes `BASE_URL` and `LOCAL_SANDBOX_DIR` from the launcher's own process. It keeps other prerequisite variables and does not modify persistent settings or `.env` files.

This switch does not migrate `qa-dashboard.config.json` or affect commands run in another terminal. Apply the 0.1.2 configuration migration above when needed. Before direct course discovery or validation commands, remove both variables from that terminal: in PowerShell use `Remove-Item Env:BASE_URL -ErrorAction SilentlyContinue` and `Remove-Item Env:LOCAL_SANDBOX_DIR -ErrorAction SilentlyContinue`; in bash/zsh use `unset BASE_URL LOCAL_SANDBOX_DIR`.

## Classifications and labels

Rules use relative forward-slash path prefixes. The **last matching rule wins**.

```json
{
  "pathPrefix": "checks/payments/api/",
  "product": "Payments",
  "layer": "api",
  "feature": "Payment service"
}
```

Layers: `ui`, `api`, `db`, `other`. If no rule matches, recognized path conventions are used; anything else remains Other. These conventions are labeled as such.

Labels are keyed by `framework/relative/file.spec.ts::Exact original title`:

```json
{
  "checks/payments.spec.ts::GET /balance returns 200": {
    "name": "A customer can see their balance",
    "description": "Checks that the balance service accepts an authorized request.",
    "feature": "Account balance"
  }
}
```

Labels affect presentation only. Native test IDs and project-qualified selectors determine execution. One label can describe the same test across browser projects.

## Suite rules

Each suite has a unique lowercase `id`, a `name`, a `description`, and a `filter`.

Filter keys: `tags`, `files`, `products`, `layers`, `projects`. Values within one key are ORed; different keys are ANDed. File rules match path prefixes. Tags omit the leading @. An empty filter means all tests.

```json
{
  "id": "payments-smoke",
  "name": "Payment readiness",
  "description": "The team's tagged API essentials.",
  "filter": { "products": ["Payments"], "layers": ["api"], "tags": ["smoke"] }
}
```

UI-saved suites are fixed native-ID selections. Configured suite rules automatically include matching new tests. Removed or renamed tests are not silently remapped.

## Documentation and prerequisites

`sources.journals` accepts Markdown files or directories. Dated filenames provide journal dates; otherwise file modification dates are used. `sources.cases` accepts Markdown tables whose first column contains TC-style IDs and bold TC-style case headings. Missing optional paths do not block startup.

```json
{
  "sources": { "journals": ["docs/work-log"], "cases": ["docs/test-cases.md"] },
  "prerequisites": [
    { "pathPrefix": "checks/database/", "requiredEnv": ["TEST_DATABASE_URL"] }
  ]
}
```

Paths cannot escape the framework root. Symlinks leaving it are rejected for configured source paths.

## Review, apply, and refresh

A coding assistant proposes `.qa-dashboard/proposal.json`. Inspect the difference with `qa-dashboard apply <proposal>`; apply the accepted result with `--yes`. Stop the server before CLI application, or use Setup's save action while no run is active. Backups are kept under `.qa-dashboard/config-backups/`.

Run `qa-dashboard validate` after applying changes. Discovery uses installed Playwright and loads repository modules, so treat it as trusted-code execution even though it does not run test bodies. Do not point it at an untrusted repository.

Refresh updates facts. It does not discard manual configuration or fabricate past results.
