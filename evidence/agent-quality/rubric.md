# Agent-quality rubric (supplied checklist)

Week 4 Task 03 · Source: the lesson's "Practice case / Supplied review checklist" table, supplied by
the owner in the conversation on 2026-11-08 and copied word for word below. Practice inputs are
synthetic.

Owner-only. This file is never part of a bundle and is never given to `self-heal-worker` or
`quality-reviewer` (rule 60): its rows describe the expected useful proposals. The case-to-row mapping
is not recorded here; it is entered per row in `scorecard.md` when the owner scores a recorded reply.

## Supplied review checklist

| Practice case                   | Supplied review checklist                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Locator                         | The intended button exists under a changed attribute. A useful proposal points to that evidence and preserves the meaningful assertion.     |
| Waiting                         | The expected result appears after a controlled event. A useful proposal waits for that state, rather than adding a fixed sleep.             |
| Setup                           | Evidence shows expired login or the wrong starting state. A useful proposal addresses the prerequisite instead of renaming a locator.       |
| Product                         | The local fixture violates its written requirement. A useful proposal keeps the assertion and describes a clearly labeled simulated defect. |
| Healthy — reserved until Step 5 | The evidence matches the requirement. A useful proposal recommends no change.                                                               |
| Missing evidence                | The selected report lacks enough page/state evidence. A useful proposal identifies the missing information rather than guessing.            |

## Verdicts

The `/quality-review` worker returns one of **supported**, **not supported** or **insufficient
evidence** per check, with references and a reason (task text). Confidence, answer length and
agreement are not quality measures.
