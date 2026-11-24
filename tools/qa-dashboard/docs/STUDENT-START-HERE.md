# Your local QA dashboard

This kit adds a visual dashboard to your existing Playwright framework. It runs on your computer. It does not publish your project or require an AI subscription.

## 1. Install it in your framework

Use Node.js 24 and a framework with Playwright 1.61.1 or newer in major version 1. Version 1.61.1 is the tested release. Ask your instructor before upgrading an older course framework.

Download the [0.1.3 team kit ZIP](https://github.com/tsarukoles/codemify-qa-dashboard/releases/download/v0.1.3/codemify-qa-dashboard-team-kit-0.1.3.zip) from the [0.1.3 release](https://github.com/tsarukoles/codemify-qa-dashboard/releases/tag/v0.1.3), or use the reviewed kit supplied by your instructor. It includes the Windows launcher. You can also get the [dashboard source on GitHub](https://github.com/tsarukoles/codemify-qa-dashboard) and follow its README to inspect and build the package. The earlier [0.1.2 kit](https://github.com/tsarukoles/codemify-qa-dashboard/releases/tag/v0.1.2) does not include the launcher. A GitHub source ZIP is not a ready-to-install team kit. Keep a source clone outside your framework; do not pull the dashboard's Git history into your framework.

Extract the team kit so its files are directly inside `tools/qa-dashboard` in your framework. You should see `tools/qa-dashboard/start.cmd` beside `tools/qa-dashboard/codemify-qa-dashboard-0.1.3.tgz`. Do not add an extra nested kit folder. Inspect and preserve any existing files in that location. Keeping the archive there makes the installation path portable when your team shares the repository.

If you received only the built `.tgz`, put it at that location. After installation, copy `node_modules/@codemify/qa-dashboard/templates/start.cmd` into `tools/qa-dashboard`. Inspect an existing launcher before copying; do not overwrite it blindly.

Before running discovery commands in a **Codemify course framework**, remove `BASE_URL` and `LOCAL_SANDBOX_DIR` from that PowerShell terminal:

```powershell
Remove-Item Env:BASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:LOCAL_SANDBOX_DIR -ErrorAction SilentlyContinue
```

These course commands affect only that terminal's environment. Generic frameworks can keep their own reviewed environment settings.

For a Codemify course framework, use `npx qa-dashboard init --preset codemify` instead of plain init below. If the framework has several Playwright configurations, add `--config path/to/playwright.config.ts` to init. Installation normally downloads npm dependencies.

If you already initialized the dashboard with 0.1.1, keep your existing
configuration and history. Follow the [small 0.1.2 migration](CONFIGURATION.md#codemify-012-migration)
before discovery: remove `LOCAL_SANDBOX_DIR` from each Codemify profile. A blank value is not the same as
an absent setting. Init deliberately preserves existing configurations.

Before discovery, review the framework's configuration and imported code. Discovery loads that code without running the test bodies; this can still have side effects. Use only a framework you trust.

Open a terminal in the framework's root folder:

```powershell
npm install --save-dev --save-exact ./tools/qa-dashboard/codemify-qa-dashboard-0.1.3.tgz
npx qa-dashboard init
npx qa-dashboard discover
```

## 2. Open the dashboard on Windows

The supplied `start.cmd` preserves the inherited environment. For a reviewed **Codemify course framework**, open `tools/qa-dashboard/start.cmd` in your editor. Change only this local setting:

```cmd
set "QA_DASHBOARD_CODEMIFY_COURSE=1"
```

The template starts with `0`. Leave it at `0` for a generic framework. Course mode removes `BASE_URL` and `LOCAL_SANDBOX_DIR` from the launcher's own process before starting the dashboard. It does not change saved environment settings, `.env` files, or the parent terminal. It leaves other variables available, including any reviewed local prerequisites.

Double-click `tools/qa-dashboard/start.cmd` in File Explorer. Keep it in this folder: it locates your framework two folders above itself, even if the path contains spaces. It checks Node 24, the installed dashboard package, and configuration. It does not install packages or run tests.

Open the localhost address printed in its terminal, normally http://localhost:4173. Keep the terminal open; Ctrl+C stops the dashboard. If Windows asks `Terminate batch job (Y/N)?`, press Y then Enter. Errors stay visible so you can read the setup guidance.

If port 4173 is occupied, open a terminal in the framework root and run:

```powershell
.\tools\qa-dashboard\start.cmd --port 4180
```

For another operating system, or to start directly from a terminal, use `npx --no-install qa-dashboard start` from the framework root. Add `--port 4180` if needed. A Codemify course terminal must first have the two variables removed as shown in step 1.

## 3. Make it yours

Go to **Setup & prompts**. Review the discovered framework, target environments, and questions. The optional prompts can guide your existing coding assistant through discovery, tailoring, connections, validation, and later refreshes. Click **Export prompt pack** to create the instructions inside `.qa-dashboard/prompts`.

Give your assistant `discover.md`, then `tailor.md`. It should inspect the evidence, ask for missing choices, and propose configuration. Review its changes before applying them. Use `connections.md` when needed, and finish with `validate.md`. The dashboard itself does not run a model or connect external accounts. Manual setup is also supported.

Review the intended environment, enable execution, and save. Start with one appropriate test in **Test library**. The preview lists required setup and cleanup tests too. Open **Run history** for results, logs, and reports.

## 4. Reopen it and keep your work

Next time, double-click `tools/qa-dashboard/start.cmd`. You do not need to repeat installation, init, or adaptation. The launcher starts your installed package with the existing configuration and history. It does not enable environments automatically.

- `qa-dashboard.config.json` contains your non-secret framework configuration and can be shared with your team.
- `tools/qa-dashboard/start.cmd` is your framework's launcher. Keep its location and reviewed course-mode setting when sharing the framework.
- `.qa-dashboard` contains your local history, reports, prompt exports, and configuration backups. Keep it private to your workspace.
- The application stays in `node_modules`; you do not need to edit its source.
- Use **Rediscover framework** and the refresh prompt after framework changes.

CI workflow definitions are visible. Past outcomes can be imported from a downloaded native Playwright JSON report; live CI accounts and remote pipeline triggers are not included.

## 5. Share your adaptation honestly

Version 0.1.3 retains the MIT License introduced in 0.1.1. You may customize it, share your adaptation, and demonstrate it in your portfolio. Keep the copyright and permission notice in `LICENSE`, and keep the third-party notices for bundled libraries and fonts. Explain which configuration and improvements are yours; do not claim authorship of the original dashboard.

The package has not been published to the npm registry. Install the reviewed local archive, not an assumed registry package. Full configuration and rollout notes are included in `docs`.
