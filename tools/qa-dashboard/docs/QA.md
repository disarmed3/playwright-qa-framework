# Release verification

## 0.1.3 Windows launcher — October 24, 2026

The evidence below was collected locally before release publication on Windows
with Node 24.11.0 and Playwright 1.61.1. Release distribution uses the
[0.1.3 release](https://github.com/tsarukoles/codemify-qa-dashboard/releases/tag/v0.1.3)
and its [team kit ZIP](https://github.com/tsarukoles/codemify-qa-dashboard/releases/download/v0.1.3/codemify-qa-dashboard-team-kit-0.1.3.zip).
These checks did not publish assets, update Kajabi or upload media. The package
has not been published to npm.

`npm run check` passed: TypeScript, the production build and **29 tests**
(the 23 existing checks and six Windows launcher checks). Launcher checks cover
paths with spaces and an ampersand, launch from another working directory,
generic environment preservation, scoped course cleanup, alternate ports,
missing configuration/package/Node, unsupported Node (simulated version),
invalid arguments and preservation of a failed server's exit code. The
launcher checks use a stub CLI; the separate package pilot below uses the real
installed application. The production build is repeated for the final archive.

An isolated framework installed the local `.tgz` and Playwright from the local
npm cache with scripts disabled. Its exact package reference remained portable
at `file:tools/qa-dashboard/codemify-qa-dashboard-0.1.3.tgz`. Init, discovery,
validation and prompt export succeeded; one fixture test was discovered with
execution disabled. The expected unclassified-test warning remained. No course
application, database, Jira or production target was contacted by this pilot.

The installed launcher started the real server from a different working
directory and a framework path containing spaces. Existing applications already
occupied 4173 and 4180; both conflicts produced visible errors without stopping
those applications. A free alternate port served the expected framework,
version 0.1.3, health endpoint and built interface. A second launch on another
free port correctly refused a duplicate instance for the same framework.

A headless Chromium walkthrough initially found Settings below the viewport at
1280 x 720. The desktop sidebar now reserves space for Settings and connection
status, scrolls the navigation when needed, and hides the optional help card at
window heights of 850 pixels or less. Keyboard focus outlines stay inside the
scrolling navigation. The mobile navigation retains its existing layout.

After this correction, TypeScript and the production build passed again. Local
Chromium checks opened Settings and the technical setup instructions at
1280 x 720, 1280 x 600, 1440 x 1000, 900 x 600, 768 x 600, 651 x 720,
650 x 720, 390 x 844, 1280 x 850 and 1280 x 851. Every desktop size kept Settings
fully visible before interaction and passed keyboard navigation through all
seven main links to Settings. The 1280 x 720 keyboard focus ring was checked for
clipping. All ten sizes passed mouse interaction and had no horizontal page
overflow or browser page errors. The shorter desktop sizes exercised scrolling;
the 650/651 widths and 850/851 heights exercised both sides of the breakpoints.
This targeted UI verification supplements the earlier 29-test launcher check;
it does not claim a new full course-framework run.

Ctrl+C stopped the owned server and removed its workspace lock; Windows
then requested `Terminate batch job (Y/N)?`, answered with Y and Enter. The
guides now explain that prompt. Closing the browser alone is not a stop action.

The reviewed course setting was also verified from a temporary Q: drive mapped
only to the isolated fixture. Its Playwright configuration rejected either
inherited `BASE_URL` or `LOCAL_SANDBOX_DIR` and required an unrelated marker.
Real discovery succeeded with course mode enabled, proving the two variables
were absent while the other prerequisite remained. The server and owned drive
mapping were removed after verification. This is an isolated launcher pilot,
not a new full student-framework/course-target validation.

The final team kit places `start.cmd` alongside its archive, README, license,
docs and checksum. Its installed-package copy is `templates/start.cmd`; both
default to generic course mode 0. The kit must be placed directly at
`<framework>/tools/qa-dashboard`. No installer, registry fallback, automatic
initialization, test execution or browser auto-opening was added.

A final pre-release pass extracted the complete generated team ZIP and freshly
installed the `.tgz` from that ZIP into an isolated framework. All 11 internal
kit checksums passed. All 44 npm archive files, including documentation and
compiled assets, matched their source/package paths byte-for-byte by SHA-256.
The kit's `start.cmd` also matched `templates/start.cmd`. Browser verification
then repeated the same ten viewport checks above against that fresh installed
package. These are package-integrity and targeted UI results, not a claim of a
full student-framework run or a live Kajabi publication check.

Initial sandbox checks could not resolve a source path or connect to a separate
loopback process. The successful build and browser/HTTP verification ran with
host access. The existing Node SQLite experimental warning remains. Explorer's
literal double-click gesture, macOS/Linux and a full existing student framework
were not exercised; Windows shell startup, package loading, paths and shutdown
were exercised as described above.

## 0.1.2 course-target compatibility — September 23, 2026

Prepared locally for review; this record does not claim a GitHub or npm release.
The Codemify preset no longer supplies `LOCAL_SANDBOX_DIR: ""`. The corrected
course framework rejects that obsolete setting even when blank. Existing
configurations are preserved and require the documented small migration;
unrelated inherited variables are not silently removed by the generic dashboard.
MIT and bundled third-party notices are byte-for-byte unchanged from 0.1.1.

`npm run check` passed on Windows with Node 24.11.0 and the existing dependencies:
TypeScript, the production build, and **23 isolated local tests**. These include
the original 21 checks, both preset profiles remaining disabled without the
obsolete field, and preservation of inherited blank/nonblank legacy settings.
`qa-dashboard --version` reports 0.1.2.

A separate read-only compatibility check passed both preset profiles through
the actual revised course `resolveTarget` helper and confirmed four rejection
cases for inherited blank/nonblank local-server settings. No application
request was made by that check. The full dashboard suite ran only isolated
local frameworks and a loopback test server, not course dev/prod, DB or Jira.

No dependency installation, network audit, fresh archive installation,
browser walkthrough, hosted CI or macOS/Linux pilot was performed for this
focused update. The existing SQLite warning remains. Prior functional evidence
below is dated and is not a claim that those activities were repeated.

## 0.1.1 student-license release — September 23, 2026

The owner authorized MIT licensing for the original dashboard source. Package metadata, the CLI version, and student distribution instructions now identify 0.1.1. Bundled third-party notices are unchanged. This release changes licensing and documentation, not dashboard behavior.

Re-ran `npm run check` on Windows with Node.js 24.11.0 using the existing installed dependencies: TypeScript and the production build passed, and all 21 isolated local checks passed. `qa-dashboard --version` reports 0.1.1. These checks did not contact the course development or production applications. The SQLite experimental-feature warning remains present on this Node version.

A targeted scan of all 45 tracked files and the single existing commit found no credential-format matches, credential-bearing URLs, sensitive tracked filenames, or personal filesystem paths. A secret-like assignment is an explicit dummy test fixture. This scan is not a guarantee that every possible sensitive value can be detected. No dependency installation, network vulnerability audit, fresh browser walkthrough, or cross-platform validation was performed for this license-only release.

Generate and distribute the 0.1.1 archive; the previous 0.1.0 archive has the old private-distribution notice. Verify the package's license, version, included notices, and checksum before sharing it. Source publication is separate from package or GitHub release publication.

## Original 0.1.0 functional verification

Verified on Windows with Node.js 24.11.0 and Playwright 1.61.1 on September 17, 2026.

## Automated checks

`npm test`: 21 checks passed. Coverage includes real server startup and workspace locking, generic discovery, project identity, setup/teardown expansion, configuration validation, disabled and production execution policy, stale selection rejection, local request validation, secret-file exclusion, prompt export, optional journals and case catalogs, SQLite persistence, native report import, expected failures, skipped outcomes, queue cancellation, and worker interruption.

The execution checks use isolated local test frameworks. They do not run tests against the Codemify application's development or production services. Intermittent Windows temporary-directory cleanup errors were addressed with asynchronous cleanup and bounded retries so process-close callbacks can release their handles.

`npm run build` checks TypeScript and builds the production React interface. Dependency audit reported zero known vulnerabilities at verification time; this is not a guarantee against future advisories.

## Compatibility evidence

Read-only discovery against the existing Codemify framework found 135 tests, five CI workflow definitions, 88 documented case IDs, and 25 work-journal entries. Its source and existing dashboard were not changed by this extraction.

Separate fixture frameworks exercise different folder names, two projects with the same test titles, and dependency/teardown projects. Classification comes from configuration or explicitly identified path conventions.

## Package and browser verification

The npm archive was installed into an independent temporary framework outside the package source, including spaces in its directory name, a custom config location, and a different test-folder layout. Its locally installed Playwright was resolved successfully. Verified the installed CLI's init, discovery, five prompt exports, proposal preview/apply with backups, and validation.

The installed runtime served its bundled frontend, retained its workspace lock, selected and passed exactly one check while leaving an unselected failing check untouched, and saved local history and an accessible HTML report. This exercised the actual archive rather than an npm link to the source folder.

Browser verification covered the Setup page, prompt export and opening, environment enable/save, project and text filtering, native dependency preview, starting a run, live results, and persistent history after a server restart. One selected check plus its required setup and cleanup completed with three passing results.

## Limits

Windows is the validated platform for this release. macOS/Linux process-group cleanup is implemented but has not been validated on those operating systems. Other Playwright versions within the declared range require a pilot before wider adoption.

Live CI connections and dispatch, hosted collaboration, autonomous AI execution, automatic legacy-database migration, repeated test instances, and multiline test titles are outside this release's supported scope. Imported history must come from actual native Playwright JSON reports.
