# Task 08B digest — three parallel designer runs (`t08b-20261031-r1`)

Saved 2026-10-31 by the main conversation after the owner's review. It collects the sources, the run
evidence, the review decisions, the one ID allocation and the questions for SCRUM-29, SCRUM-33 and
SCRUM-37. The proposals themselves stay unchanged in their design files. No raw runtime log is
copied here: the fleet log (`.claude/fleet-log.txt`) is git-ignored and only summarized below.

## 1. Sources

| Source                      | What                                                                                                                                                 | Record                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Jira                        | `SCRUM-29`, `33`, `37` and their 21 case subtasks, 24 read-only `jira_get_issue` calls, 2026-10-31; all match the seed                               | Task 08B note (`evidence/week3-task08b-note.md`, tag `week6-end`), "Facts: Jira reads"                   |
| Requirement notes           | [SCRUM-29](../../vault/sources/jira/SCRUM-29.md), [SCRUM-33](../../vault/sources/jira/SCRUM-33.md), [SCRUM-37](../../vault/sources/jira/SCRUM-37.md) | SCRUM-37 Comparison corrected 2026-10-31 (card numbers are in the pay description)                       |
| Inputs                      | [SCRUM-29](../inputs/SCRUM-29-AC1.md), [SCRUM-33](../inputs/SCRUM-33-AC1.md), [SCRUM-37](../inputs/SCRUM-37-AC1.md)                                  | SHA-256 at launch: `f9723945d402…`, `045dec870030…`, `3eeac43fcb2b…` (SCRUM-37 corrected after the run)  |
| Contract                    | `test-design/contract/openapi-dev-2026-10-30.json` (untracked)                                                                                       | SHA-256 `8f2ef6955633222799ab685067bd0c44d32066a6ce8ee4298ce6ddc680c83350`, same as the Blog API catalog |
| Committed catalog           | `vault/sources/test-catalog/` at `e7ff113`: `baseline-map.md`, `blog-api.md`, `blog-ui.md`, `db.md`; 60 definitions, no store UI or store API ID     | read-only during the runs                                                                                |
| Seed                        | course backlog (Jira backlog seed, not published): neighbouring store tasks (SCRUM-30, 34, 40) not read in Jira                                      | cited as "seed only"                                                                                     |
| Starting data, database map | [starting data](../../vault/sources/database/starting-data.md), [database map](../../vault/wiki/01-framework/db-map.md)                              | as read by the designers                                                                                 |

## 2. Run evidence

Three `test-designer` runs, launched in one message, no isolation, same committed catalog. Designer
tools: Read, Grep, Glob, `jira_get_issue` (not called: every input said "Do not call Jira"). Times
from the fleet log (UTC):

| Run | Key      | Start        | Stop         | Duration |
| --- | -------- | ------------ | ------------ | -------- |
| A   | SCRUM-29 | 20:15:21.873 | 20:16:52.209 | 90.3 s   |
| B   | SCRUM-33 | 20:15:21.873 | 20:16:55.913 | 94.0 s   |
| C   | SCRUM-37 | 20:15:21.870 | 20:17:50.425 | 148.6 s  |

- Observed overlap: all three were running from 20:15:21.873 to 20:16:52.209 (90.3 s). Wall time
  148.6 s; the three durations add up to 332.9 s. The runtime allows 20 concurrent subagents by
  default (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`, not set); no launch was refused.
- Six lines in the log, one Start and one Stop per run, one `session_id`, no other agent. Start and
  Stop pair by `session_id` + agent ID; the agent IDs equal those the three launches returned, and
  the durations agree with the runtime's own completion reports (90.6, 94.3, 148.8 s).
- `prompt_id` cannot pair Start and Stop: the three Start lines share one value; each Stop line has
  the prompt current when it stopped.
- All three Stop lines had `reply_sha256` and `reply_chars` null: `last_assistant_message` was not a
  string. `reply_type` was added to the logger afterwards (owner approved; CROSS-IMPACT in the Task
  08B note), so the next run shows what is sent. Saved proposals are therefore matched to their run
  by run ID, key and these times, not by a reply hash.
- The runs' task output files were empty (0 bytes); each proposal was saved from its hand-back text
  as received.

## 3. Proposals

| Run | Design file                           | Rows                          | SHA-256 at save |
| --- | ------------------------------------- | ----------------------------- | --------------- |
| A   | [SCRUM-29](../SCRUM-29/AC1-design.md) | 2 Gap, 6 New (A-1 to A-6)     | `6c2d584ebff9…` |
| B   | [SCRUM-33](../SCRUM-33/AC1-design.md) | 16 Gap (10 Jira cases), 0 New | `2998f0e49df6…` |
| C   | [SCRUM-37](../SCRUM-37/AC1-design.md) | 9 Gap, 3 New (C-1 to C-3)     | `852373122522…` |

Covered: 0 in every run, rechecked: the committed catalog defines no store UI or API ID and `tests/`
has none. TC-SDB-002 and 003 are cited as related seed checks only, correctly.

The designers' "Gap" means "a Jira case with no test". In the catalog, Task 04's keys apply instead
(New = sources sufficient, no test; Gap = blocked, blocker named), so most of those rows are New
there.

## 4. Decisions (owner, 2026-10-31)

| Proposal row                   | Decision                                                          | Catalog result                    |
| ------------------------------ | ----------------------------------------------------------------- | --------------------------------- |
| A: TC-SUI-010                  | keep                                                              | TC-SUI-010                        |
| A: TC-SUI-012                  | keep; A-5 and A-6 join its Expected                               | TC-SUI-012                        |
| A-1                            | keep                                                              | TC-SUI-014 (new)                  |
| A-2, A-3                       | change: merged into one row (one variant / several)               | TC-SUI-015 (new)                  |
| A-4                            | reject; its image point kept as a question                        | no ID; Q17                        |
| A-5, A-6                       | change: part of TC-SUI-012's Expected                             | no ID                             |
| B: all 16 rows                 | keep; sub-rows of one ID become parts of its Expected             | TC-SAPI-001 to 010                |
| B: "TC-SAPI-003 (SCRUM-58→59)" | change: label corrected to SCRUM-59                               | TC-SAPI-003, requirement SCRUM-59 |
| B: TC-SAPI-001 "active only"   | keep, Expected OPEN                                               | part of TC-SAPI-001; Q21          |
| C: TC-SAPI-050 to 057, 070     | keep; TC-SAPI-070's Expected stays OPEN (mentor)                  | TC-SAPI-050 to 057, 070           |
| C-1                            | keep                                                              | TC-SAPI-058 (new)                 |
| C-2                            | change: part of TC-SAPI-054's Expected                            | no ID                             |
| C-3                            | keep separate (comparison decision, §5)                           | TC-SAPI-059 (new)                 |
| C: Q14 (store catalog SHA)     | reject: it assumes a store catalog that did not exist             | —                                 |
| SCRUM-37 note and input        | corrected (pay description gives all test cards); run C `r1` kept | —                                 |

## 5. Overlap and comparison decisions

No two rows from different requirements test the same behaviour at the same layer. Candidates:

| #   | Rows                                                        | Source                                                                                         | Decision                                                                                                                               |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | C-3 (two pays at once) ↔ TC-SAPI-055 (pay a paid order)     | SCRUM-37 description "idempotent pay"; SCRUM-93; `db-map.md` payments: no UNIQUE on `order_id` | **keep separate** (owner, 2026-10-31): a sequential test could be marked Covered while concurrency stays untested; becomes TC-SAPI-059 |
| 2   | C-1 (Luhn-invalid) ↔ TC-SAPI-053 (undocumented, Luhn-valid) | SCRUM-91; pay description "any other card number → 422"                                        | keep separate (decision §4)                                                                                                            |
| 3   | TC-SUI-015 (UI variants) ↔ TC-SAPI-009 (API tee variants)   | SCRUM-49, SCRUM-65; starting data                                                              | keep separate: different layer and products                                                                                            |
| 4   | TC-SUI-014 (UI price) ↔ TC-SAPI-009 (2500) ↔ TC-SDB-002     | SCRUM-29, SCRUM-65; `db.md`                                                                    | keep separate: the UI risk is formatting cents                                                                                         |
| 5   | TC-SAPI-008 ↔ TC-SAPI-057 (`delay`)                         | SCRUM-64, SCRUM-95; OAS "capped"                                                               | keep separate; one shared question (Q2)                                                                                                |
| 6   | TC-SUI-012 ↔ seed TC-SUI-020 (SCRUM-30)                     | seed                                                                                           | keep: 012 checks the item arrives, 020 the line fields                                                                                 |
| 7   | TC-SAPI-050, 051 ↔ seed TC-SDB-010, 013 (SCRUM-40)          | seed; excluded from `db.md` (need writes)                                                      | keep; cited as seed text, never defined                                                                                                |

## 6. ID allocation (once, at this save)

| Proposal label | Permanent ID    | Catalog                                                    |
| -------------- | --------------- | ---------------------------------------------------------- |
| A-1            | **TC-SUI-014**  | [Store UI](../../vault/sources/test-catalog/store-ui.md)   |
| A-2 + A-3      | **TC-SUI-015**  | [Store UI](../../vault/sources/test-catalog/store-ui.md)   |
| C-1            | **TC-SAPI-058** | [Store API](../../vault/sources/test-catalog/store-api.md) |
| C-3            | **TC-SAPI-059** | [Store API](../../vault/sources/test-catalog/store-api.md) |

- Each new number sits in its task's block of ten (SCRUM-29 `TC-SUI-01x`, SCRUM-37 `TC-SAPI-05x`),
  outside the range its description names, and was unused in the seed and this repo (0 files each).
  TC-SUI-011 and 013 stay free because "010..013" names them (Q5), as Task 04 did with TC-API-050 to 054.
- Reused unchanged as definitions: the 21 Jira case IDs TC-SUI-010, 012; TC-SAPI-001 to 010, 050 to
  057, 070. No existing catalog ID changed.
- A/B/C labels remain temporary references in the design files and this digest.

## 7. Questions carried forward

All 38 are in the catalogs, numbered across the store catalog: Q1 to Q4 for every store case, Q5 to
Q17 for SCRUM-29 ([Store UI](../../vault/sources/test-catalog/store-ui.md#open-questions)), Q18 to Q28
for SCRUM-33 and Q29 to Q38 for SCRUM-37 ([Store API](../../vault/sources/test-catalog/store-api.md#open-questions)).
Each names the design question it came from.

Settled or rejected, not carried: A14 and B15 (the contract SHA matches: `8f2ef695…`), C1's card
numbers (corrected in the sources; its "does a description count" part is Q4), C14 (rejected, §4).

## 8. Reconciliation with the Blog baseline

All 25 store definitions are store only. No row, case ID or total of the
[Blog baseline map](../../vault/sources/test-catalog/baseline-map.md) changes (11 behaviours, 44
scenarios). Patterns repeated from Blog rows, for review only: Pagination (TC-SAPI-007), Delay
(TC-SAPI-008, 057), Filtering (TC-SAPI-002, 003, 005, 006), required-field validation (TC-SAPI-054),
and "a disclosure is never an expected pass" (TC-SAPI-070, like TC-API-070).

## 9. Checks after the save

Run 2026-10-31 after the save (rule 50 "Verify"):

- Definition uniqueness, over the first table column of every file in `vault/sources/test-catalog/`:
  85 definitions, 85 unique, 0 duplicates, 0 bad format (`TC-<FAMILY>-<digits>`), 0 rows with a
  temporary A/B/C label or a non-bold ID in the first column. Per file: `blog-api.md` 33,
  `blog-ui.md` 11, `db.md` 16, `store-api.md` 21, `store-ui.md` 4. The 60 existing definitions are
  unchanged.
- New IDs defined exactly once: TC-SUI-014, 015, TC-SAPI-058, 059. TC-SUI-011 and 013 not defined.
  References are counted separately and may repeat (e.g. TC-SUI-014 appears twice in the catalog:
  its row and the ID notes).
- Questions: Q1 to Q38 each listed once; every Q cited in a row is listed.
- This digest: 20 local links, 0 broken; no fleet-log line, agent ID, session ID or prompt ID.
- `npm run format:check`: all files use Prettier style. `npm run vault:check`: 14 of 14 fresh.
  `npm run vault:validate`: 50 notes, 213 links, 0 broken, 0 warnings.
