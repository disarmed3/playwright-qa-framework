# Codemify QA Dashboard

A local, configurable companion for Playwright frameworks. Explore tests, combine suites, run selected checks, inspect reports, and understand project work without memorizing commands.

This is a separate package source project. The existing Codemify automation dashboard remains independent.

## Get the source

Source: [tsarukoles/codemify-qa-dashboard](https://github.com/tsarukoles/codemify-qa-dashboard).

Version 0.1.3 adds a Windows launcher. Download the [0.1.3 team kit](https://github.com/tsarukoles/codemify-qa-dashboard/releases/download/v0.1.3/codemify-qa-dashboard-team-kit-0.1.3.zip) from the [0.1.3 release](https://github.com/tsarukoles/codemify-qa-dashboard/releases/tag/v0.1.3), use a reviewed kit supplied by your instructor, or follow the source-build route below. The earlier [0.1.2 release](https://github.com/tsarukoles/codemify-qa-dashboard/releases/tag/v0.1.2) is the course-target compatibility update and does not include this launcher.

Clone or download this repository into its own folder, outside your test framework. Inspect the source, package scripts, and dependency list before installing or running it. Follow **Develop and package** below to build the installable archive, or use a reviewed archive supplied by your instructor. The repository source and an installable package are different: a GitHub source ZIP does not include the built interface.

Do not pull this repository's unrelated Git history into your framework. Keep the dashboard source separate; install its package into the framework. To update a source clone, first review its local changes and the upstream changes, then pull in that dashboard clone and rebuild. Do not overwrite your customizations.

## Share with your team

The ready-to-install archive is produced with `npm pack`. Give teammates the reviewed `codemify-qa-dashboard-0.1.3.tgz` file from `releases/` and this quick start. The [0.1.3 team kit ZIP](https://github.com/tsarukoles/codemify-qa-dashboard/releases/download/v0.1.3/codemify-qa-dashboard-team-kit-0.1.3.zip) also contains `start.cmd`, student instructions, configuration/rollout documentation, licenses, and a SHA-256 checksum. Release archives are generated locally and are not tracked in the source repository; GitHub release assets are uploaded separately to the [0.1.3 release](https://github.com/tsarukoles/codemify-qa-dashboard/releases/tag/v0.1.3). This package has **not** been published to npm; install the reviewed local archive.

For a portable installation, extract the reviewed team kit so its files are directly inside the student's framework at `tools/qa-dashboard/`. The resulting paths include `tools/qa-dashboard/start.cmd` and `tools/qa-dashboard/codemify-qa-dashboard-0.1.3.tgz`. Keep the launcher in that location: it finds the framework two folders above itself. Inspect and preserve any existing files before copying the kit.

First-time setup still requires **Node.js 24 LTS** and the framework's installed Playwright. Run from that framework's root:

For a Codemify course framework, use `npx qa-dashboard init --preset codemify` instead of plain init below. Before discovery, remove `BASE_URL` and `LOCAL_SANDBOX_DIR` from that PowerShell terminal with `Remove-Item Env:BASE_URL -ErrorAction SilentlyContinue` and `Remove-Item Env:LOCAL_SANDBOX_DIR -ErrorAction SilentlyContinue`. If upgrading an existing course configuration, apply the [0.1.2 migration](docs/CONFIGURATION.md#codemify-012-migration) before discovery too.

Installing normally downloads npm dependencies. Review the framework's Playwright configuration and imported code before discovery: discovery loads that code even though it does not run test bodies. Use only a framework you trust.

```powershell
npm install --save-dev --save-exact ./tools/qa-dashboard/codemify-qa-dashboard-0.1.3.tgz
npx qa-dashboard init
npx qa-dashboard discover
npx qa-dashboard prompts export
```

Environments begin disabled until reviewed. The course preset does not copy the author's history or approve production access.

The supplied launcher preserves the inherited environment by default. For a reviewed Codemify course framework, change only its local line `set "QA_DASHBOARD_CODEMIFY_COURSE=0"` to `set "QA_DASHBOARD_CODEMIFY_COURSE=1"`. In that mode it removes `BASE_URL` and `LOCAL_SANDBOX_DIR` from its own process before starting the dashboard. It does not edit saved environment settings, `.env` files, or the parent terminal.

Upgrading an existing Codemify configuration? Remove the obsolete
`LOCAL_SANDBOX_DIR` entry from each profile's `env` object, even if its value is
blank. See the [migration steps](docs/CONFIGURATION.md#codemify-012-migration).
Installing the package or rerunning init will not overwrite your configuration.

### Open or reopen on Windows

After setup, double-click `tools/qa-dashboard/start.cmd` in File Explorer. Open the localhost URL printed in its terminal, normally http://localhost:4173. Keep that terminal open; Ctrl+C stops the dashboard. If Windows asks `Terminate batch job (Y/N)?`, press Y then Enter. Reopening does not install dependencies, initialize configuration, approve environments, or run tests.

From a terminal in the framework root, use the same launcher with an alternate port:

```powershell
.\tools\qa-dashboard\start.cmd --port 4180
```

The launcher checks Node 24, the installed local package, and configuration, then starts that installed CLI. It does not download another package. A missing prerequisite or startup error stays visible in the terminal.

If you received only the `.tgz`, create `tools/qa-dashboard` if needed and, after installation, copy `node_modules/@codemify/qa-dashboard/templates/start.cmd` there. Inspect and preserve any existing `tools/qa-dashboard/start.cmd`; do not overwrite it blindly. Apply the course-mode setting above only for a reviewed course framework. Other platforms can use `npx --no-install qa-dashboard start` from the framework root; add `--port 4180` when needed. A course terminal must first have `BASE_URL` and `LOCAL_SANDBOX_DIR` removed as described above.

In **Setup & prompts**, review the discovered facts and questions. Open/copy the adaptation prompts for your coding assistant, or use the manual configuration form. Review the framework target and enable the desired environment, then save. No AI service is called by the package.

## How it adapts

- The package contains the compiled React interface, localhost server, Playwright adapter, reporter, and five guided prompts.
- `qa-dashboard.config.json` describes one framework: environment policy, classifications, suite rules, friendly labels, and optional documentation.
- `.qa-dashboard/` contains ignored local discovery evidence, exported prompts, backups, SQLite history, logs, and artifacts.
- Tests are discovered from the framework's installed Playwright. Native test IDs distinguish projects with identical titles. Required setup/teardown projects appear in previews.
- Configuration changes preserve package source and recorded runs. Upgrades replace the package, not project customizations.

Prompt workflow: **discover → tailor → connections (optional) → validate**. Use **refresh** after structural framework changes. Prompts need the user's existing coding assistant. Manual configuration works without AI.

## Commands

All commands accept `--root <framework-directory>`. The default is the current directory.

| Command                                                | Purpose                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `init [--preset codemify] [--config path]`             | Create starter configuration; preserve any existing configuration      |
| `scan`                                                 | Static inventory, without loading framework code                       |
| `discover`                                             | Collect Playwright tests, CI definitions, and setup questions          |
| `prompts discover`                                     | Print a context-specific prompt for a coding assistant                 |
| `prompts export`                                       | Write all five prompts under the framework's ignored local folder      |
| `validate` / `doctor`                                  | Check configuration and discovery; does not execute test bodies        |
| `apply proposal.json`                                  | Show current and proposed configuration without changing it            |
| `apply proposal.json --yes`                            | Apply a reviewed proposal, preserving a backup                         |
| `import report.json --environment default --source ci` | Import actual native Playwright JSON results with their original dates |
| `start [--port 4173]`                                  | Serve this framework's dashboard on loopback                           |

## Local execution

One run executes at a time. Selections are checked against fresh discovery before launch; source changes invalidate stale previews. The dashboard uses per-run output/report directories. Existing root reports are not overwritten by its reporter/output options.

The framework's own global setup, teardown, web servers, fixture actions, and external application calls still apply. Those can have their own filesystem/network side effects. The queue only serializes this dashboard's runs.

The server binds to 127.0.0.1, validates Host/Origin, and accepts only structured actions. Production execution requires both reviewed file and tag allowlists. A smoke tag is not proof of read-only behavior.

History and artifacts remain on the student's computer. No analytics, hosted backend, live CI connector, AI API, Jira posting, or Slack posting is included. A cloud coding assistant handles any content supplied to it under that assistant's own policies; localhost is not a claim that external AI runs offline.

## Requirements and limits

- Node 24 LTS. This version uses built-in SQLite.
- Playwright 1.61.1 or later in major 1, installed in the target framework; 1.61.1 is the verified version.
- One Playwright config per workspace. Point `--root` to the relevant package in a monorepo and use `--config` during init.
- Windows is verified. POSIX process-group cleanup is implemented but macOS/Linux require platform validation before a team rollout.
- Multi-project selection and setup/teardown dependencies are supported. `repeatEach > 1` and multiline test titles are not supported for dashboard execution.
- Generic path classification is intentionally conservative. Configure unusual browser/API/database folders in Setup.
- CI files are configuration evidence. Import downloaded JSON reports for past outcomes. Live CI account connection/dispatch is not implemented.
- Optional work-journal Markdown and TC-style case catalogs are supported; missing files show warnings and do not prevent startup.
- Existing legacy dashboard history is not automatically copied. Native JSON report import is available.
- Runtime data is retained until removed manually with the dashboard stopped.

## Develop and package

Run these in the separate dashboard source folder, after reviewing the code. This installs dependencies from npm and generates the built interface and package:

```powershell
npm ci
npm run build
npm test
New-Item -ItemType Directory -Force releases
npm pack --pack-destination releases
```

`prepack` rebuilds the interface. Runtime package contents are explicitly allowlisted, including `templates/start.cmd`. Test fixtures, local histories, and credentials are not included. The generated `.tgz` is the installable artifact; creating a team-kit ZIP with the launcher at its top level is a separate distribution step. Keep the archive at the same relative path in a shared framework so its package reference remains usable by teammates.

To develop the UI, start the server against an initialized fixture, then run `npm run dev`. Vite's API proxy defaults to port 4173.

See [student quick start](docs/STUDENT-START-HERE.md), [configuration](docs/CONFIGURATION.md), [team rollout](docs/TEAM-ROLLOUT.md), [architecture](docs/ARCHITECTURE.md), and [verification](docs/QA.md).

## License and student adaptations

The dashboard's original source is available under the [MIT License](LICENSE). You may use, change, share, and build on it, including for a portfolio or commercial work, while retaining its copyright and permission notice. Third-party libraries and fonts keep their own licenses; retain [third-party notices](docs/THIRD-PARTY-NOTICES.md) when distributing the bundled interface.

Make the configuration and improvements your own, and describe what you changed honestly. For example: “Adapted the MIT-licensed Codemify QA Dashboard for my test framework; I added custom suites, labels, and reporting views.” The example is not a required claim: list only work you actually did. You do not need to claim that you wrote the original dashboard.
