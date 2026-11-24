# Instruction review after the first attempts

Week 4 Task 03 · 2026-11-09 · Synthetic practice inputs only. Written by Claude in the main
conversation and approved by the owner; it is not a mentor's acceptance.

## Input

The five proposals submitted in the course step and their course reviews (each review saw only its
own case's checklist row):

| Case    | Proposal                     | Review                            |
| ------- | ---------------------------- | --------------------------------- |
| case-01 | `self-heal-20261108T211714Z` | `quality-review-20261109T192341Z` |
| case-02 | `self-heal-20261108T211728Z` | `quality-review-20261109T192640Z` |
| case-03 | `self-heal-20261108T213444Z` | `quality-review-20261109T192706Z` |
| case-05 | `self-heal-20261108T212005Z` | `quality-review-20261109T192726Z` |
| case-06 | `self-heal-20261108T211510Z` | `quality-review-20261109T192742Z` |

All records are in `evidence/agent-quality/answers/<case>/`. The owner's decisions are rows 7 to 11 of
`scorecard.md` (all five: accept with correction).

## Finding

Three of the five proposals cite lines that are wrong or do not exist; the quoted facts are right each
time. Checked against the fixture files on 2026-11-09:

| Case    | Cited                        | Actual                                                          |
| ------- | ---------------------------- | --------------------------------------------------------------- |
| case-03 | `requirement.md#6-7`         | the file has 6 lines; the text is on 5–6                        |
| case-05 | `page-a.html#6`, `#9`, `#10` | title on 7, notice on 10, heading on 11                         |
| case-06 | `requirement.md#7`, `#8`     | the file has 7 lines; the text is on 6–7; line 8 does not exist |

Likely cause: the bundle shows files without line numbers, and the instruction asked for `file#line`
without a way to check it.

## Change (one, approved by the owner on 2026-11-09)

`scripts/agent-quality/instructions/self-heal.md`, reply item 3: each evidence reference carries the
quoted words it relies on; lines are counted from the first line after the file's `=== FILE` marker; a
line that cannot be placed exactly is cited by quote alone. It names no case, category or expected
answer, and the rubric is unchanged.

Considered, not made: asking the analyst to label assumptions (case-02 only, once); numbering lines in
the bundle (a code change that would alter every bundle hash).

## Repeat (case-06 only)

| Run                          | Instruction | Citations (recounted against the files) | Review relevance          |
| ---------------------------- | ----------- | --------------------------------------- | ------------------------- |
| `self-heal-20261108T211510Z` | before      | `requirement.md#7`, `#8` wrong          | not supported (`192742Z`) |
| `self-heal-20261109T193352Z` | after       | 9 of 9 correct, each with its quote     | supported (`193539Z`)     |

The proposal is the same in substance. One case, one run on each side, and a model's output varies
between runs: this is one observation, **not a measured improvement**. The repeat is a note in the
scorecard and does not replace the original.

## Held-back healthy case

case-04 ran once before this review (Step 5, `self-heal-20261108T212206Z`; review
`quality-review-20261108T212654Z`, before reviews got the checklist row). The course order runs it after
the instruction review; a run now would be an extra, disclosed run under the changed instruction:

```
/self-heal evidence/agent-quality/fixtures/case-04
/quality-review case-04 self-heal-<UTC stamp from the new record>
```

Not run at the time of writing.

## Post-review run of the healthy case (added 2026-11-09)

- `self-heal-20261109T195349Z`: run after the instruction change, same bundle hash as the held-back
  input (`43b4f469ee2b…`); recommends no change and leaves the undefined stock-zero behaviour open. All
  17 citations recounted against the files: each line exists and holds the quoted words.
- `quality-review-20261109T195529Z`: saw only the "Healthy" checklist row; every check and the overall
  verdict supported.
- Owner decision: accept, action outcome "no change" (`scorecard.md` row 12). The early run
  `212206Z` stays as recorded and is disclosed, not scored.
- Still one observation per run; no measured improvement is claimed.
