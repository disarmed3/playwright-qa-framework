---
id: hook-lifecycle-map
type: guide
---

# Hook lifecycle map

Which Claude Code events are connected to which program in this project, and how much of that has
been checked. The status words mean exactly this:

- **Configured**: the entry exists in `.claude/settings.json`.
- **Script verified**: `npm run test:safety` ran the program with sample events in a temporary
  repository and checked the files it wrote and its exit codes.
- **Live verified**: a real Claude Code session in this project triggered the event and the expected
  record (or, for the guard, the expected block) appeared. Results are in `evidence/task05-note.md` (tag `week6-end`),
  `evidence/task06-note.md` (tag `week6-end`) and `evidence/task07-note.md` (tag `week6-end`).
- **Planned**: described here, not installed.

## Timeline of edits to this setup

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-20 | Task 05: recorder `scripts/vault-sync.mjs` created (`--from-hook`, `--session-start`); isolated checks `safety-tests/vault-log.test.mjs` added to `npm run test:safety`.                                                                                                                                                                                                                                                                 |
| 2026-10-20 | Task 05: `PostToolUse` (`Edit\|Write`) and `SessionStart` connected in `.claude/settings.json`.                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-20 | Task 05: `PostToolUse` live verified in the same session (one Write, two Edits recorded; an Edit in `vault/` not recorded). `SessionStart` awaits a new session.                                                                                                                                                                                                                                                                         |
| 2026-10-20 | Task 05: fresh conversation — `SessionStart` wrote `- session START 2026-10-20T19:56:07Z` on startup with no manual run; one Edit of `tests/blog/home.smoke.spec.ts` added exactly one change-log entry (19:58:13Z).                                                                                                                                                                                                                     |
| 2026-10-20 | Task 05: two more isolated checks for the `commit:` field (12-character `core.abbrev`; ID follows a new commit, earlier bytes kept). Recorder unchanged.                                                                                                                                                                                                                                                                                 |
| 2026-10-20 | Task 05: `--session-start` now adds ` · source: … · session: …` from the SessionStart event on stdin, so a line can be tied to one session and trigger. Earlier lines unchanged.                                                                                                                                                                                                                                                         |
| 2026-10-20 | Task 06: edit guard `scripts/hooks/guard.mjs` created; isolated checks `safety-tests/guard.test.mjs` added to `npm run test:safety`.                                                                                                                                                                                                                                                                                                     |
| 2026-10-20 | Task 06: `PreToolUse` (`Edit\|Write`) connected in `.claude/settings.json`; live verified in the same session (Write of a `.pem` and an assertion-removing Edit blocked; a comment-only Edit allowed and recorded).                                                                                                                                                                                                                      |
| 2026-10-20 | Task 06: fresh conversation — one Edit adding the comment `// Task 06 guard check: test.only(` to `tests/blog/category-filter.smoke.spec.ts` blocked with the `.only` reason; spec and change log byte-identical afterwards. Hook settings unchanged.                                                                                                                                                                                    |
| 2026-10-20 | Task 06: check 7 (`waitForTimeout(` added to a `*.spec.ts`, Edit and Write) added to the guard; 8 isolated checks added (guard 71, `node:test` 95). Checks 1–6 and hook settings unchanged. Script verified only.                                                                                                                                                                                                                        |
| 2026-10-20 | Task 06: check 4 extended to `.fixme(` and `.fail(`; check 8 added (Write of a `tests/` spec must contain `runIfEnv(test, ['dev'])`); guard 87 isolated checks, `node:test` 111. `forbidOnly: true` set in `playwright.config.ts` (not a hook). Hook settings unchanged. Script verified only.                                                                                                                                           |
| 2026-10-20 | Task 06: `SessionStart` session fields live verified from `sessions.log` (two `source: startup` lines, IDs match transcript files). Recorder and settings unchanged.                                                                                                                                                                                                                                                                     |
| 2026-10-22 | Task 07: `scripts/hooks/session-preflight.mjs` (five-line startup summary) and `scripts/hooks/stop-worklog.mjs` (daily-note reminder, `--path`) created; `/worklog` command added; isolated checks `safety-tests/worklog.test.mjs` (54) added to `npm run test:safety` (`node:test` 165).                                                                                                                                                |
| 2026-10-22 | Task 07: preflight added as a second `SessionStart` command beside the recorder (recorder entry unchanged). Then, after the isolated checks passed, `Stop` connected. Live results: see the rows below and `evidence/task07-note.md` (tag `week6-end`).                                                                                                                                                                                  |
| 2026-10-22 | Task 07 review: preflight live verified (new conversations at 21:11 and 21:12 local received the five lines); recorder `source: resume` lines observed live; `sessions.log` has no END line (`SessionEnd` not configured). Scripts and settings unchanged.                                                                                                                                                                               |
| 2026-10-22 | Task 07 second review: `/clear` live verified (`source: clear` line matches the conversation; preflight received); `/worklog` live verified (Read + Edit append of `## 21:25`). Still no END line. Scripts and settings unchanged.                                                                                                                                                                                                       |
| 2026-10-22 | Task 07 END fix: `vault-sync.mjs --session-end` added (START output unchanged); 3 isolated checks added (recorder 27, `node:test` 168). Then, after they passed, `SessionEnd` connected. Script verified; live pending (needs a session end, e.g. `/clear`).                                                                                                                                                                             |
| 2026-10-22 | Task 07 third review: `SessionEnd` live verified from `sessions.log` (one `reason: clear` END paired in the same second with the next conversation's `source: clear` START; three `reason: other` END lines). Preflight seen again at startup. Scripts and settings unchanged.                                                                                                                                                           |
| 2026-10-24 | Task 11 stage 1: `vault-sync.mjs` gains `--write` and `--check` (spec notes in `vault/tests/`, generator in `scripts/vault-notes.mjs`, loaded only by those modes). Logging modes unchanged except that extra arguments now exit 2. No hook calls the generator yet; settings unchanged.                                                                                                                                                 |
| 2026-10-25 | Task 11 stage 2: `PostToolUse` recorder now also refreshes the note of an edited existing spec (no staging; a problem is one stderr line, exit 0). Script verified only; live pending. Git hooks: `.husky/pre-commit` adds `pre-commit-notes.mjs --preflight`/`--refresh`, `.husky/pre-push` adds `vault:check` and `vault:validate`; checked in a disposable repository (`safety-tests/vault-git.test.mjs`). Claude settings unchanged. |

## The real hook settings

| Event          | Matcher                                            | Command                                                             | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------- | -------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PreToolUse`   | `Edit\|Write`                                      | `node "$CLAUDE_PROJECT_DIR/scripts/hooks/guard.mjs"`                | Configured 2026-10-20. Script verified (87 isolated checks, all eight checks). Live verified 2026-10-20, same session: protected filename and removed `expect(` blocked; comment-only Edit allowed. Live verified again 2026-10-20 in a fresh conversation (hook loaded at startup): added `.only` blocked. Checks 2, 4, 6, 7 and 8 live: not tested (script verified only).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `PostToolUse`  | `Edit\|Write`                                      | `node "$CLAUDE_PROJECT_DIR/scripts/vault-sync.mjs" --from-hook`     | Configured. Script verified. Live verified 2026-10-20 (Write, Edit, vault exclusion; again in a fresh conversation: one Edit → one entry). Since 2026-10-25 (Task 11) the same command also refreshes the note of an edited existing spec, without staging: script verified only, live not yet observed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `SessionStart` | none (startup, resume, `/clear`, compaction, fork) | `node "$CLAUDE_PROJECT_DIR/scripts/vault-sync.mjs" --session-start` | Configured. Script verified. Live 2026-10-20: a startup line appeared, but it carried no session ID (written before the source/session fields existed). Live verified 2026-10-20: two later conversation starts each wrote one line with `source: startup` and a session ID that matches that conversation's transcript file (`evidence/task05-note.md` (tag `week6-end`)). Resume live verified 2026-10-22: three `source: resume` lines whose IDs match existing transcripts (`evidence/task07-note.md` (tag `week6-end`)). `/clear` live verified 2026-10-22: one `source: clear` line matching the conversation; a second `/clear` at 18:33:56Z wrote its `source: clear` START in the same second as the previous conversation's `reason: clear` END. Compaction and fork not tested. Writes START only; END comes from the `SessionEnd` row.                                                                                                                                                                                                                                         |
| `SessionStart` | none                                               | `node "$CLAUDE_PROJECT_DIR/scripts/hooks/session-preflight.mjs"`    | Configured 2026-10-22 (second command in the same group as the recorder; neither reads what the other writes, so order does not matter). Script verified (isolated checks; exact command run by hand on the project). Live verified 2026-10-22: two new conversations (21:11 and 21:12 local) received the five lines in context before any tool ran, and each still got its `sessions.log` `startup` line. Seen again 2026-10-22 21:34 local (startup at 18:34:39Z): `Uncommitted files: 13`, equal to `git status --short`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Stop`         | none                                               | `node "$CLAUDE_PROJECT_DIR/scripts/hooks/stop-worklog.mjs"`         | Configured 2026-10-22, after the isolated checks passed. Script verified. Live verified 2026-10-22, same session (picked up without restart): with 10 changed files and no journal, the reply's stop was blocked with the `worklog: BLOCKED — …` line naming `vault/12-progress-report/anastasios-athanasiadis/2026-10-22.md`. Pass after an entry and the `stop_hook_active` retry: script verified; by-hand runs on the project with the `## 21:09` entry present → 0, and later live stops showed no feedback (consistent with a pass, but a passing hook shows nothing). `/worklog` live verified 2026-10-22: invoked in the review conversation, Read + Edit appended `## 21:25` to the existing journal.                                                                                                                                                                                                                                                                                                                                                                             |
| `SessionEnd`   | none (all reasons)                                 | `node "$CLAUDE_PROJECT_DIR/scripts/vault-sync.mjs" --session-end`   | Configured 2026-10-22, after the isolated checks passed. Script verified (3 checks: exact `- session END <UTC> · reason: … · session: …` line after the START line, plain line for bad input, write failure exits 0). Exact command run by hand on a temporary folder → one END line, exit 0. **Live verified 2026-10-22** (`evidence/task07-note.md` (tag `week6-end`), IDs compared, not printed): `/clear` at 18:33:56Z → `reason: clear` END for the conversation whose `source: clear` START was at 18:26:05Z, and in the same second a `source: clear` START for the new one; 18:34:13–37Z → three `reason: other` END lines, one for that new conversation and two for conversations started earlier that day (17:51:33Z, 18:12:49Z), followed at 18:34:39Z by a `source: startup` START. Every ID matches a transcript file. Which user action produced `other` was not recorded (in the VS Code extension it is not the CLI `/exit`, which would be `prompt_input_exit`). `prompt_input_exit` and `logout` not observed. Sessions that ended before 21:32 local have no END line. |
| `FileChanged`  | —                                                  | —                                                                   | Optional watcher. **Not enabled** for this exercise; no watcher existed before Task 05, so none was removed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## Event roles and which can block

| Event          | When it runs                                                                          | What its output does                                                      | Can block?                                                                      | Here                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `SessionStart` | A session starts: startup, resume, `/clear`, compaction                               | Role: set up and orient. stdout is added to Claude's context              | **No** — the session starts whatever the exit code                              | Recorder (START line) + preflight (five lines). Recorder live verified on startup, resume and `/clear`; preflight on startup and `/clear`. |
| `PreToolUse`   | Before a tool call, after Claude has chosen its input                                 | Role: gatekeeper. Exit 2: stderr goes to Claude                           | **Yes** — exit 2 cancels the call before it runs                                | Guard on `Edit\|Write`. Live verified.                                                                                                     |
| `PostToolUse`  | After a tool call succeeded                                                           | Role: record or react. Exit 2: stderr goes to Claude as feedback          | **No** — the tool has already run; it can only report                           | Recorder on `Edit\|Write`. Live verified.                                                                                                  |
| `Stop`         | Claude finishes a reply (each reply, not the session)                                 | Role: end-of-reply check. Exit 2: stderr goes to Claude, which continues  | **Yes** — exit 2 stops Claude from stopping; `stop_hook_active` marks the retry | Daily-note reminder. Block live verified.                                                                                                  |
| `SessionEnd`   | The session ends; `reason` says why (`clear`, `logout`, `prompt_input_exit`, `other`) | Role: cleanup or logging. Not shown to Claude, which has already finished | **No** — the session ends whatever the exit code                                | Recorder writes an END line. Live verified 2026-10-22 for `clear` and `other`. A killed process may skip it.                               |

Only the two events that run _before_ something happens can block it: `PreToolUse` (the tool call)
and `Stop` (Claude stopping). The other three run when it is too late to prevent anything; they can
only add context (`SessionStart`), give feedback (`PostToolUse`) or leave a record (`SessionEnd`).

How the command finds things:

- **The script**: `$CLAUDE_PROJECT_DIR` is set by Claude Code to the project folder, so the script is
  found even when the session's working folder has moved into a subfolder. A plain
  `node scripts/vault-sync.mjs` would depend on the working folder.
- **The project root**: the script uses `VAULT_SYNC_ROOT` (set only by the isolated tests), else
  `CLAUDE_PROJECT_DIR`, else the working folder. Relative paths in events are resolved against it.

## Edit timeline (what happens on one edit)

1. Claude calls `Edit` or `Write` on a file.
2. `PreToolUse` runs the guard with the proposed call on stdin. Exit 2 blocks the call: its stderr
   line (`guard: BLOCKED — …`) goes back to Claude, the file is not touched, and steps 3–6 do not
   happen, so a blocked edit leaves no change-log entry. Exit 0 lets the call go ahead.
3. The tool finishes.
4. `PostToolUse` matches `Edit|Write`; Claude Code starts the command and sends the event on stdin.
5. The recorder works out the project-relative path. If it is valid and outside `vault/`, it appends
   one entry to `vault/_changelog/<local date>.md`.
6. The recorder exits 0 and prints nothing; Claude continues.

`SessionStart` follows the same path at the start of a session and appends one line to
`vault/_changelog/sessions.log`. Its stdin event carries `source` (`startup`, `resume`, `clear`,
`compact`, `fork`) and `session_id`; when both are plain IDs the line ends with them:

```text
- session START 2026-10-20T20:30:00Z · source: startup · session: <session_id>
```

Otherwise the line is just `- session START <UTC>`. The session ID matches the transcript file name in
`~/.claude/projects/<project>/`.

The same `SessionStart` group also runs the preflight, which prints five lines to stdout; Claude Code
adds them to the session's context:

```text
Date: <local YYYY-MM-DD>
Branch: <branch, or no-branch>
Uncommitted files: <count from git status --porcelain --untracked-files=all -z, or unknown>
Latest journal: <newest vault/12-progress-report/**/YYYY-MM-DD.md by file-name date, or none yet>
Map: vault/_map.md
```

## The daily-note reminder (Stop)

When Claude finishes a reply, `Stop` runs `stop-worklog.mjs` with the event on stdin. The journal is
`vault/12-progress-report/<slug>/<local YYYY-MM-DD>.md` (`--path` prints it). First match wins:

1. Input is not a JSON object (after removing leading byte-order marks): exit 0.
2. `stop_hook_active` is true (Claude is already continuing after a block): exit 0. This is what stops
   the reminder repeating within one stop.
3. No uncommitted `.ts`/`.mjs`/`.json`/`.md`/`.sh` file and no commit on today's local date: exit 0.
4. Today's journal has a line beginning `## HH:MM`: exit 0. Once an entry exists, the day is quiet.
5. Otherwise exit 2 with one stderr line, `worklog: BLOCKED — …`, naming the journal path and `/worklog`.
   Claude Code returns it to Claude, which continues instead of stopping.

Any unexpected error exits 0 (fails open), and the script never writes a file. `/worklog` writes the
entry with Read/Edit (Write only for a new file), so the guard's secret check covers it; the recorder
ignores `vault/`, so journal edits add nothing to `_changelog/`. If Claude does not add an entry, the
next reply's stop blocks once more: once per stop, not a loop.

To see which hooks are loaded: `/hooks` in the CLI; in the VS Code extension (2.1.269+), **Customize →
Hooks**. Both show configuration, not whether a hook ran.

One entry looks like this (file name = local date; time = UTC):

```text
- **when:** 2026-10-20T14:03:12Z · **who:** <Git user.name>@<computer> · **branch:** week-2
  **what:** tests/blog/home.smoke.spec.ts · **why (last commit):** <last commit subject> · **commit:** <short HEAD>
```

The last commit is background only: it is the newest commit when the edit happened, not the reason
for the edit. Any value Git cannot provide is written as `unknown`.

## What the recorder receives (stdin)

Claude Code does not pass the file name as an argument. It writes a JSON description of the event
into the program's standard input — the same channel a `|` pipe uses in a terminal — and the program
reads it. After an `Edit` or `Write`, the file is at `tool_input.file_path`; a `FileChanged` event
would put it at a top-level `file_path`. The recorder accepts both. Windows tools sometimes put
invisible byte-order marks in front of the text, so the recorder removes every leading one before
reading the JSON. Input it cannot read, or a path outside the project or inside `vault/`, is ignored.

## The two loop protections

1. **No trigger.** The hook fires only for Claude's own `Edit` and `Write` tools. The recorder writes
   its log with Node, which is not a Claude tool call, so its own writes never start the hook again.
2. **No write.** The recorder ignores `vault` and every path inside `vault/`. Even if an event about
   a change-log file arrived (from a watcher, or Claude editing a vault note), nothing is appended.

## What the recorder does not see

Edits made through shell commands (`sed`, heredocs, `Set-Content`), `NotebookEdit`, and changes made
by people or tools outside Claude. The `Edit|Write` matcher covers only those two tools.

## The edit guard (PreToolUse)

The guard reads only the proposed call: `old_string`/`new_string` for Edit, `content` for Write (old
text treated as empty). It never opens the target file or applies the edit. Checks, first match wins:

1. Protected filename: `.env`, `.env.*` except `.env.example`, `*.pem`, `*.key`, `*.p12`, `id_rsa`,
   `id_ed25519` (basename, any folder, case ignored). Edit and Write.
2. Secret-looking new text: Slack bot, Atlassian and AWS key prefixes, private key header. Any file.
3. `*.spec.ts`: `.only` in new text, not in old text.
4. `*.spec.ts`: `.skip`, then `.fixme(`, then `.fail(` in new text, not in old text.
5. Edit on `*.spec.ts`: fewer `expect(` calls.
6. Edit on `*.spec.ts`: fewer `runIfEnv(` or fewer `envGuard(` calls (counted separately).
7. `*.spec.ts`: `waitForTimeout(` in new text, not in old text; the reason asks for a web-first wait on
   the real condition instead.
8. Write of a `*.spec.ts` under `tests/` without the exact text `runIfEnv(test, ['dev'])`. The path
   is placed relative to `CLAUDE_PROJECT_DIR`; a path outside it is not checked (fails open).

A Write has no old text, so checks 3, 4 and 7 look at the whole content, and checks 5 and 6 (removals)
are **not** run for Write; check 8 covers a whole-file Write that drops `runIfEnv`, but not one that
drops assertions. Checks 3, 4, 7 and 8 match text, not meaning: a comment mentioning `.only` or
`waitForTimeout(` is blocked, and adding a second one where one already exists is allowed.

Outside the hook, `playwright.config.ts` sets `forbidOnly: true`, so a `.only` added by a terminal,
an editor or a second `.only` fails the browser run. Configured; not demonstrated with a real `.only`.

**It fails open.** Malformed input, other tools and internal errors exit 0. If `node` or the script
cannot start, the exit is not 2, so Claude Code treats it as a non-blocking error and the edit goes
ahead (checked by hand: the unanchored `node scripts/hooks/guard.mjs` exits 1 from `tests/blog/`,
which is why the command is anchored). Shell edits and `NotebookEdit` never reach it. It is a course
guard, not a security boundary.

## Future proposal (documentation only, not configured)

(`Stop`, configured in Task 07, covers the end of each reply. **Update 2026-10-22:** `SessionEnd` is now
configured, but differently from this proposal: it appends an END line to `sessions.log`, not to the
journal. See the `SessionEnd` row above. The proposal is kept as written.)

Event: SessionEnd.
Matcher: omitted, so it would apply to all session endings.
Behavior: append a closing journal line so a reviewer can see when the session ended.
