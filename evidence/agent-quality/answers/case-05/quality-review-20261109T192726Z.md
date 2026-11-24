# /quality-review reply (original, verbatim)

- Argument: `case-05 self-heal-20261108T212005Z`
- Recorded: 20261109T192726Z by `scripts/agent-quality/run-worker.mjs`; the reply below is unedited
- Input: case-05, synthetic, v1, 2026-11-08
- bundleSha256: 558ad7a7a77531cc06669ca8ab8b0c8b823ed4e1ac531574b53b7e6f0342ee20
- answerRecord: evidence/agent-quality/answers/case-05/self-heal-20261108T212005Z.md
- Worker: separate `claude -p` 2.1.317, model claude-opus-5-5, tools [], MCP [], tool uses 0
- Raw capture (ignored): `evidence/raw/week4/agent-quality/20261109T192726Z-review-case-05/`

## Reply

bundleSha256: 558ad7a7a77531cc06669ca8ab8b0c8b823ed4e1ac531574b53b7e6f0342ee20
answerRecord: evidence/agent-quality/answers/case-05/self-heal-20261108T212005Z.md

| Check | Verdict | References (file#line or file#field) | Reason |
|---|---|---|---|
| Hash (pre-check) | supported | original-answer#bundleSha256; header#caseBundleSha256; header#caseBundleMatchesRecord | The reply quotes `7db778c2…c8f200`. This equals `caseBundleSha256`, and the header reports `caseBundleMatchesRecord: yes`. |
| 1. Preserved requirement | supported | test-excerpt.txt#32; test-excerpt.txt#33; requirement.md#5; requirement.md#6 | The reply keeps the heading-text assertion and the two-row count unchanged. It rejects fixed waits and retries. Its optional extra test adds coverage for the sign-in clause rather than replacing anything. |
| 2. Relevance | not supported | page-a.html#6; page-a.html#7; page-a.html#9; page-a.html#10; page-a.html#11; observation-1.txt#2; observation-1.txt#4; observation-1.txt#5; requirement.md#6; run-summary.json#startedAt; run-summary.json#setup.steps[0].fileSavedAt; run-summary.json#setup.practiceSessionLifetimeHours; run-summary.json#test.finalUrl | Most references are correct. Examples: the 26h15m gap between 2026-11-07T08:00Z and 2026-11-08T10:15Z is right, the 24h lifetime is right, and the final URL is right. However, all three `page-a.html` line references are off by one. The title is on line 7, not line 6, which holds `meta practice-input`. Line 9 is `<body>`, not the expiry notice, which is on line 10. The sign-in heading is on line 11, not line 10. The claims themselves still stand, because `observation-1.txt#4` and `observation-1.txt#5` are cited correctly. |
| 3. Assumptions | supported | run-summary.json#setup.practiceSessionLifetimeHours; run-summary.json#note; header#missingObservations; original-answer §1 table; original-answer §6 | The conclusion "therefore expired" depends on the reported lifetime actually being enforced. The reply states this limit in §6 and keeps "invalidated for another reason" open as **unknown**. No missing observations were declared, and the reply does not invent any. |
| 4. Proposed action | supported | run-summary.json#setup.steps[0].title; test-excerpt.txt#5; original-answer §4 | The reply targets the cause: setup reuses an existing session file without checking that it is still valid. It offers two valid fixes, either always signing in fresh or adding an age/probe check. It is framed as a proposal ("nothing has been changed") and does not claim that a rerun happened. |
| 5. Checklist row | supported | rubric.md#2; observation-1.txt#4; run-summary.json#test.finalUrl | The evidence shows an expired login. The reply addresses that prerequisite and does not touch the locator. |

**Overall**: supported. References: run-summary.json#setup, run-summary.json#startedAt, run-summary.json#test.finalUrl, observation-1.txt#4, test-excerpt.txt#5, requirement.md#6. The bundle backs the stale-session diagnosis, and the proposal fixes setup while keeping both assertions. The one defect is the three off-by-one `page-a.html` line references. They should be corrected to lines 7, 10 and 11, but they do not change the conclusion, because correctly cited evidence elsewhere supports the same facts.

**Not checked**:
- Whether a fresh sign-in actually makes lines 32–33 pass.
- Whether the server enforces the reported 24h lifetime, which rules out other kinds of invalidation.
- What `practice-session.json` contains.
- Whether the file hashes in the headers match the file contents.
