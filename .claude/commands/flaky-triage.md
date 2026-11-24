---
description: Triage native Playwright JSON reports for retry-flaky results within a run and differing outcomes across runs (read-only; writes only an ignored report)
argument-hint: <report.json> [<report.json> ...]
disable-model-invocation: true
allowed-tools: Bash(node scripts/flaky-triage.ts:*)
---

The block below is the output of `scripts/flaky-triage.ts` (rule 70). It is not yours to rewrite.

!`node scripts/flaky-triage.ts $ARGUMENTS`

Reply with the block above unchanged, then repeat its final `flaky-triage: exit …` line. Do not
assign causes, predict results, rerun tests or edit files. If the block shows an ERROR line, report
it and stop.
