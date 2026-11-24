---
description: Append today's worklog entry (## HH:MM with Did, Worked / didn't, Next)
allowed-tools: Bash(node scripts/hooks/stop-worklog.mjs --path), Bash(date +%H:%M), Read, Edit, Write
---

Append one entry to today's journal.

- Journal path: !`node scripts/hooks/stop-worklog.mjs --path`
- Local time: !`date +%H:%M`

If either value above is missing or is not of the form `vault/12-progress-report/<slug>/YYYY-MM-DD.md`
and `HH:MM`, run `node scripts/hooks/stop-worklog.mjs --path` and `date +%H:%M` yourself. Never guess
the path or the time.

Steps:

1. If the file does not exist, create it with **Write**: `# Worklog <YYYY-MM-DD from the path>`, an
   empty line, then the entry.
2. If it exists, **Read** it first, then add the entry with **Edit**: `old_string` is the file's last
   lines, `new_string` is those same lines followed by an empty line and the entry. Never use Write on
   an existing journal, and never change, reorder or remove earlier entries.
3. The entry, with the local time from above:

   ```text
   ## HH:MM
   - Did: <one line: what this session changed or checked>
   - Worked / didn't: <one line: results, including failures or skipped steps>
   - Next: <one line: the next concrete step>
   ```

   Base each bullet on this session's real work and `git status`; keep each to one short line.

4. Never include passwords, tokens, keys, the contents of `.env*` or `.auth/`, account values from
   `tests/support/users.ts`, or session IDs.
5. Reply with the path and the heading you added.
