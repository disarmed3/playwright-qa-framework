---
paths:
  - 'scripts/slack-report.ts'
  - 'safety-tests/slack-report.test.mjs'
---

# Failure notification (Slack reporter)

Applies when the reporter or its isolated checks change, and whenever anyone runs the reporter. Written
rules guide this route; they do not prevent every possible Slack action. Anyone holding the token can call
Slack directly.

## What it is

- `scripts/slack-report.ts` turns one native Playwright JSON report into a Slack message. Node's own
  type stripping runs it (Node 24.2 or later, erasable TypeScript only, no new package). It reads the
  report file only; it never starts a test and never imports `env/target.ts`.
- Target is a label taken from `--run-target dev|prod` or a `provenance.txt` beside the report, else
  "unknown". It is never guessed from `APP_ENV`, which describes the current process, not the old run.

## Modes (never combined)

- Default and `--dry-run`: local preview. No `.env` read, no Slack call, even when credentials exist.
  Prints the message and a digest.
- `--check-connection`: one `auth.test`. Prints success or failure and the workspace and bot names. No
  message, no channel lookup.
- `--send <report> --approve-digest <12 hex>`: one `chat.postMessage`, only when the digest equals the one
  the preview printed for the same report bytes, target, evidence link and message. No retry, no
  schedule. The digest does not cover the channel (preview never reads `.env`); the send prints the
  channel masked, and the approval names it.

## Do

- Do: get the owner's approval in the conversation before `--check-connection` or `--send`, naming the
  system (Slack), the channel and the action, and the report it sends. Claude never runs either on its
  own. Preview needs no approval. This is rule 01, "Human approval before changing an outside system".
- Do: read the private settings `SLACK_BOT_TOKEN` and `SLACK_CHANNEL` only through the script. A non-empty
  process value wins; only when one is missing is the root `.env` read, and only those two lines are
  parsed. Claude never opens `.env` and never prints a token, channel or workspace identifier beyond the
  masked channel and the workspace and bot names.
- Do: treat an invalid, interrupted, unreadable, zero-test or all-skipped report as an error (exit 2),
  never PASS, in preview and in send.
- Do: keep counts as tests, and attempts apart. Elapsed time is `stats.duration`; the sum of test
  durations is labelled "not elapsed".
- Do: take smoke counts only from the tags inside the report. A report without tag data says "not
  recorded"; today's source is never used for an older run.
- Do: link evidence only through `--evidence-url` (https, no credentials). Otherwise label it local-only
  with the repo-relative path and say how to ask for a copy. Never print a machine path.
- Do not: add a retry, a loop, a schedule, a second sender or a second report format.

## Exit codes

0 done · 1 usage or digest refused · 2 invalid or unusable report · 3 credentials missing · 4 Slack
refused or unreachable (`ok:false` code only) · 5 delivery uncertain (check the channel before any
resend) · 6 rate limited (`Retry-After` shown, nothing retried). The last stdout line is
`slack-report: exit <n> <mode> <verdict|kind>`.

## Isolated checks

- `node --test safety-tests/slack-report.test.mjs` (not part of `test:safety`: `package.json` is
  CRITICAL). Slack is a fake `fetch`, credentials are fake, `.env` is never read, every variant is built
  in memory or a temp folder that is removed. No fixture goes to real Slack.
- Fake token prefixes are assembled from pieces in tests and in the script, because the secret scan
  blocks a literal prefix in any staged file.
- Verify: that command exits 0; `npm run typecheck`, `npm run lint` and `npm run format:check` stay clean.
- ⚠️ The checks prove the script against a fake Slack. They do not prove the real token, channel or the
  bot's membership in the channel; only an approved `--check-connection` and `--send` show that.
