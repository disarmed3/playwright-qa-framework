# Architecture

The package contains a React/Vite interface and a loopback Fastify service. SQLite stores run snapshots and saved suites inside the target framework's ignored local directory.

## Data flow

1. Static scan inventories supported framework files, package scripts, environment-variable references, and CI definitions.
2. Playwright's native list mode loads a bundled discovery reporter and collects projects, exact test IDs, annotations, selectors, and targets.
3. Configured path rules and optional labels enrich presentation without changing executable identity.
4. Run preview expands setup/teardown projects and validates prerequisites and environment policy.
5. The queue binds selections to a configuration/source fingerprint, then repeats exact native discovery before execution.
6. A supervisor launches the target framework's installed Playwright using argument arrays, captures structured events, and retains per-run reports.
7. The interface streams updates and polls for reconnect recovery. Closing the browser does not cancel a run.

The package resolves Playwright from the target framework, not its own directory. Dependencies are optional peers for packaging; the CLI gives a clear prerequisite error when they are absent.

## Isolation

Application code and built assets stay in the package. Project-specific configuration stays at the framework root. Data and exported prompts stay in .qa-dashboard. Packages use an explicit publish allowlist; local histories are never part of a release.

Origin/Host checks and a mutation header protect the localhost API against unrelated sites. Local users/processes remain inside the trust boundary. Framework code itself is trusted code and can perform side effects while loading or executing.

Production policy is declarative: enabled profile, reviewed file allowlist, permitted tags, framework skip annotations, and declared prerequisites. It cannot prove arbitrary test code is read-only.

## Lifecycle and evidence

One run is active per workspace. Up to eight queued/active runs are accepted. Windows cancellation targets only the owned process tree. POSIX cancellation uses an owned process group. IPC disconnect terminates owned work; unfinished persisted runs become interrupted after restart.

Results distinguish passed, failed, skipped, cancelled, interrupted, blocked, and runner error. Expected failures are marked explicitly; retry evidence is retained. Native report imports preserve source dates and are deduplicated by content and environment.

Historical records are snapshots. Refreshing classifications does not rewrite the past. CI definitions and Git history never become fabricated test outcomes.

## Scope

The first adapter supports Playwright. Live CI account connectors, pipeline dispatch, arbitrary shell commands, AI-provider execution, multi-user hosting, and other test runners are not part of this release. The prompt pack guides interpretation and configuration; it is not a hidden autonomous agent.
