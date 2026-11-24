---
paths:
  - 'scripts/flaky-triage.ts'
  - 'scripts/flaky-fixtures.ts'
  - 'evidence/fixtures/flaky/**'
  - 'safety-tests/flaky-triage.test.mjs'
  - '.claude/commands/flaky-triage.md'
---

# Flaky triage (analyzer, command and synthetic fixtures)

Applies when the triage script, its command, its fixture generator, its synthetic fixtures or its
`node:test` file are run or changed. Every rule in `01-guardrails.md` still applies; this file adds to it.

## Standalone isolated check

- Do: run the triage checks with `node --test safety-tests/flaky-triage.test.mjs`. They are not part
  of `npm run test:safety` (an owner decision); run them after any change in this rule's paths, as well as
  `npm run test:safety`.
- Do: keep them isolated: no browser, no network, no app; every call passes `--out` to a fresh temp
  folder, so nothing is written to `evidence/raw/`.
- When: any change to a file in this rule's paths, and before a commit that includes one.
- Verify: the command exits 0 with every test passed; compare the count with the previous run (22 tests
  when this rule was last revised); a drop needs an explanation.
- ⚠️ This narrows `01-guardrails.md` "Safety checks stay isolated" for this one file: it lives in
  `safety-tests/` but is not in the `node --test` list of `test:safety`. `npm run test:safety` exits 0
  without it, so a broken triage check is caught only by the command above.

## Synthetic fixture suite

- Do: `evidence/fixtures/flaky/source/` runs only through `node scripts/flaky-fixtures.ts`, which
  passes its own `playwright.config.ts` with `--config`: no browser use, no `baseURL`, server, setup,
  storage state, credentials, network or `env/target.ts`. The project's `playwright.config.ts`
  (`retries: 0`) is never changed for it; only this config sets retries, for the retry case.
- Do: regenerate fixtures only with the generator (`--force` to replace them); never edit a fixture
  by hand. Each case keeps its `FIXTURE.md` (starts with `SYNTHETIC`) and, where it has one, a
  `provenance.txt` with `synthetic: true`.
- Do not: place fixtures under `evidence/raw/`, or pass a fixture together with a real report (the
  script exits 1, `mixed-synthetic`).
- When: generating, changing or reviewing fixtures.
- Verify: `npm run test:list` lists no fixture or synthetic title; the generator exits 0 (it checks
  each report's native stats, the installed Playwright version and that no local user path is left).
- ⚠️ The default `testDir` is `tests`, so a `*.fixture.ts` moved there would not be picked up, but a
  renamed `*.spec.ts` would join the browser suite and run on dev.

## Real reports

- Do: give `/flaky-triage` only explicit local paths of approved real captures (`run.json` next to
  its `provenance.txt`). The command has `disable-model-invocation: true`: the owner types it; Claude
  never runs the script on real reports in its place.
- Do: keep generated reports in the ignored `evidence/raw/week4/flaky-triage/`; copy only paths,
  hashes and counts into evidence. Error text may hold dev URLs or cookie values.
- Do not: rerun tests to produce instability, change retries, or treat a difference under changed or
  unknown conditions as proof of nondeterminism. The script assigns no cause; neither does Claude.
- When: every real triage.
- Verify: review the reply against the script's final line `flaky-triage: exit <n> …`.
