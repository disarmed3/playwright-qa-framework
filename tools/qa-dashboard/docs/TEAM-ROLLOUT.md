# Team rollout

## First pilot

1. Download and review the [0.1.3 team kit ZIP](https://github.com/tsarukoles/codemify-qa-dashboard/releases/download/v0.1.3/codemify-qa-dashboard-team-kit-0.1.3.zip) from the [0.1.3 release](https://github.com/tsarukoles/codemify-qa-dashboard/releases/tag/v0.1.3) before a pilot. Share the reviewed .tgz archive, `start.cmd`, SHA-256 checksum, README, LICENSE, and third-party notices together.
2. Pick one or two student frameworks, preferably with different folder layouts.
3. Install the local archive as an exact development dependency.
4. Place the extracted kit files directly in the framework's `tools/qa-dashboard` folder. Preserve existing files. For a reviewed Codemify course framework, change the local launcher's `QA_DASHBOARD_CODEMIFY_COURSE` setting from `0` to `1`, and remove `BASE_URL` and `LOCAL_SANDBOX_DIR` from the setup terminal as shown in the student instructions.
5. Run init, discover, and prompts export. Use init's `--preset codemify` option for a course framework, and apply the 0.1.2 configuration migration first when needed. Review questions together.
6. Start with `tools/qa-dashboard/start.cmd` on Windows. Use an existing coding assistant for interpretation, or configure manually in Setup.
7. Enable one approved development profile. Execute one small appropriate check.
8. Verify reports, history, launcher startup from File Explorer, an alternate port, and Ctrl+C shutdown. Then broaden usage.

The archive is an npm package, not a self-contained desktop executable. Node, dependencies, and the framework's Playwright/browser installation are required. npm normally downloads package dependencies during installation.

## Distribution and reproducibility

For a shared repository, place the archive in a deliberate versioned vendor location or host it at a stable team-accessible registry location. Installing from an arbitrary machine-local path can leave a non-portable file reference in package.json/package-lock.json; update that before teammates clone the repository.

The supplied source remains outside student frameworks. Installed runtime files live under node_modules. Each framework contains its own committed, non-secret qa-dashboard.config.json and ignored .qa-dashboard directory.

The team kit's top-level `start.cmd` belongs at `<framework>/tools/qa-dashboard/start.cmd`, beside the reviewed `.tgz`. It locates the framework two folders above itself and starts only the installed local CLI. Node 24 and first-time setup remain required. If distributing a bare `.tgz`, copy its installed `templates/start.cmd` from `node_modules/@codemify/qa-dashboard` to that same framework location after checking for an existing launcher.

The template preserves the inherited environment by default. Its local course-mode switch removes only `BASE_URL` and `LOCAL_SANDBOX_DIR` from the launcher's own process; other variables and persistent settings stay unchanged. Apply it only after confirming this is a Codemify course framework. Reopening uses the existing configuration and never initializes the project, approves a profile, or runs tests. The terminal stays open while serving; Ctrl+C stops it. If Windows asks `Terminate batch job (Y/N)?`, press Y then Enter. For another port, run `.\tools\qa-dashboard\start.cmd --port 4180` from the framework root. Other systems can use `npx --no-install qa-dashboard start` with the reviewed environment.

Version 0.1.2 retains the MIT student license introduced in 0.1.1 and corrects the Codemify preset for the framework's stricter target validation. Keep the copyright and permission notice with copies or substantial portions of the dashboard, and preserve the bundled third-party licenses. The previous 0.1.0 archive used a private-distribution notice; do not give it to students as the MIT release.

The [source repository](https://github.com/tsarukoles/codemify-qa-dashboard) can be cloned or downloaded into a separate folder and inspected before building. Do not merge its unrelated Git history into a student's framework. Pulling upstream updates belongs in that separate source clone after reviewing local and incoming changes. Build a new reviewed archive and install it into the framework.

No npm registry publication or GitHub release upload is performed by the build. The package has not been published to npm; a future registry release needs the owner's namespace, access policy, and account authentication. Generated archives are ignored by Git, so a source push alone does not distribute the team-kit ZIP. Use the [0.1.3 GitHub release assets](https://github.com/tsarukoles/codemify-qa-dashboard/releases/tag/v0.1.3), share the reviewed archive separately, or give students the source-build instructions.

## Updates

Install the next reviewed package version. Keep project configuration and local history in place. Run validate, then inspect the Setup refresh prompt for structural changes. Back up the .qa-dashboard directory with the server stopped before larger upgrades.

When moving to 0.1.3, review any existing `tools/qa-dashboard/start.cmd` before adding or updating it. Preserve local customizations and recheck the course-mode setting. Installing the package or rerunning init does not copy or overwrite a framework launcher. Re-export the prompt pack after upgrading to obtain the launcher verification guidance.

For existing Codemify 0.1.1 configurations, apply the [0.1.2 migration](CONFIGURATION.md#codemify-012-migration)
before discovery or validation. The dashboard does not overwrite existing
`qa-dashboard.config.json` files or silently erase inherited local-server settings.

Do not copy one student's .qa-dashboard directory to the class; it contains their results, artifacts, and potentially application evidence. Distribute configuration templates without credentials instead.

## AI-assisted onboarding

The prompt pack is provider-neutral Markdown. It does not ship an AI API key or silently invoke a model. The student selects their existing coding assistant and gives it the exported prompt. The assistant follows repository instructions, asks unresolved questions, and proposes configuration.

For a first-time user, begin with discover.md and tailor.md. connections.md is optional. validate.md checks the outcome. refresh.md supports ongoing maintenance. Manual configuration remains supported.

## Success criteria

- No source-code changes to the dashboard are needed for ordinary adaptation.
- Different products, tags, config locations, and optional documentation work.
- Native test identity and setup/teardown requirements remain accurate.
- Execution stays disabled until the environment is reviewed.
- Recorded outcomes come from real runs or imported reports.
- Package upgrades retain local customizations and results.
- Students can reopen the installed dashboard with the Windows launcher and stop it with Ctrl+C, with the correct framework and reviewed environment.
