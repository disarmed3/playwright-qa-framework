# /triage-run --fleet round fleet-20261110T202344Z (original record)

- Recorded: 20261110T202344Z by `scripts/triage/triage-run.mjs`; one parallel round, every worker awaited
- Round interval (router clock): 2026-11-10T20:23:44.984Z → 2026-11-10T20:24:10.972Z; overlap: true
- Workers are separate `claude -p` processes, not subagents: `.claude/fleet-log.txt` does not record them
- Raw capture (ignored): `evidence/raw/week4/triage/20261110T202344Z-fleet/` (round.json, triage-report.proposed.md marked NOT REVIEWED)

| Role | Question | Input | ID · kind · label · version | inputSha256 | selectedTextSha256 | Worker session | Interval (router clock) |
| ---- | -------- | ----- | --------------------------- | ----------- | ------------------ | -------------- | ----------------------- |
| test-repair | Is a test-side repair supported by this evidence? | `evidence/agent-quality/fixtures/case-03/case.json` | case-03 · case-bundle · synthetic · v1 (2026-11-08) | `0f9d09f8d941a04fe96278064268e47031c3547b15749e14855283aa3239f676` | `aad3d660fd9de97248c37c78fb701e5ce0980e64858ee23b9357f1837ba80e9c` | 23c31ab5-d893-4b1a-8345-f26848d09a75 | 2026-11-10T20:23:44.984Z → 2026-11-10T20:24:07.975Z |
| flaky-results | Are the recorded outcomes inconsistent, and what does that support? | `evidence/fixtures/flaky/retry-flaky/report.json` | flaky-retry-flaky · playwright-json · synthetic | `0d018defa502438be459eecf12515776fb3338e9a066bbada3406e24eda7cead` | `d2ae1309f7f5e3a32d91a9e4e5edd820527762061f8204c738200ad5a5c16f5f` | babbabdf-35dd-4675-a90c-2dabac3584e3 | 2026-11-10T20:23:45.011Z → 2026-11-10T20:24:05.298Z |
| bug-report | Does the evidence support a defect against the requirement? | `evidence/agent-quality/fixtures/case-01/case.json` | case-01 · case-bundle · synthetic · v1 (2026-11-08) | `df7bf1ad13373c46f5fe8a6292aa0cdd14365b7e42c5dcef4f9d6b43d3e1c723` | `5e381e12eaffe3c44b889170e7bfdb219dbb564b421d3316b05087faa4f70bca` | ba531098-04d0-4307-a4e5-32d7f8fbff8c | 2026-11-10T20:23:45.032Z → 2026-11-10T20:24:10.972Z |

All inputs are synthetic. A proposal or draft is not a repair, a filed issue or a verified
result; the workers ran, edited, reset, filed and sent nothing.
