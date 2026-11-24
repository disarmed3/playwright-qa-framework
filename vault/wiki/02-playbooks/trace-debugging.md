---
id: trace-debugging
type: playbook
---

# Trace debugging

How to read one Playwright trace to find the evidence behind a failure and choose the next check.
Written 2026-11-09 (Week 4 Task 05) from one inspected practice trace and one real failure whose
trace was opened in the viewer but not inspected (see "Worked examples"). A playbook is a procedure;
it is not a permission boundary and it changes no test.

## Sources

- Practice trace (SYNTHETIC): `test-results/trace-practice/20261109T212027Z/` (ignored), captured
  2026-11-09 from the Task 03 local check
  [locator.check.ts](../../../evidence/agent-quality/local-check/locator.check.ts) with its own
  [config](../../../evidence/agent-quality/local-check/playwright.config.ts) and `--trace on`;
  case-03 fixture pages (`sourceVersion` v1, 2026-11-08), `setContent`, every request aborted, no
  app, `baseURL`, setup, storage state or credentials. `provenance.txt` beside it says
  `synthetic: true`. Result: 2 passed, 2 skipped (no repair decided).
- Real failure (dev): TC-SUI-020, run `20261108T202049Z`, trace at
  `evidence/raw/week4/store-ui/20261108T202049Z/test-results/store-ui-cart-store-UI-car-7757b-total-and-total-for-the-tee-chromium/trace.zip`
  (ignored; holds the guest cart cookie, page snapshots and screenshots; stays local, never shared,
  see `evidence/week4-checks.md` (tag `week6-end`), Store UI). Report used instead of the
  trace: [week4-store-ui-20261108T202049Z.sanitized.json](../../../evidence/week4-store-ui-20261108T202049Z.sanitized.json).
- Test and Page Object: [cart.spec.ts](../../../tests/store/ui/cart.spec.ts) (TC-SUI-020, line 43;
  image check line 70), [CartPage.ts](../../../pages/CartPage.ts) (`rowImage()`, a role fallback
  because the image has no test ID). Requirement: catalog row TC-SUI-020 in
  [store-ui.md](../../sources/test-catalog/store-ui.md) (SCRUM-51). Known product bug: SCRUM-166.
- Clues, never proof: [error-signatures.md](../../../evidence/agent-quality/error-signatures.md) (row 1
  is TC-SUI-020). The `/triage-run` router does not read it (signature clues off, 2026-11-09).
- Added 2026-11-10: the 2026-11-09 practice trace above no longer exists (a later Playwright run
  emptied `test-results/`). Replacement, same check and command with a durable output folder:
  `evidence/raw/week4/practice/20261110T185314Z/` (ignored; `provenance.txt` says `synthetic: true`;
  2 passed, 2 skipped). Its test-2 trace shows the same actions, error, log, 0 network events and
  `after@call@28` buttons `line-remove` and `cart-checkout`. The snapshots at the failing action are
  stored as `[[1,45]]` / `[[2,45]]`, read as references to the unchanged page (inference from the
  format; the owner's viewer check is recorded in `evidence/week4-checks.md` (tag `week6-end`)).
- Added 2026-11-10 (owner, local viewer): at the failing action `Expect "toBeVisible"`
  (`getByTestId('checkout-button')`, 1.0 s), the Before and After snapshots both show the same cart
  page with a "Proceed to checkout" button; the viewer's Pick locator on that button gives
  `getByTestId('cart-checkout')`. Seen: the button exists under the new test ID at the failing
  moment, so the earlier "not checked" item for the practice trace is closed. Next check stays:
  confirm the rename was intended, then [POM refactoring](pom-refactoring.md).

## Open a trace locally

1. Pick the failing test and its `trace.zip` from the report or the router output; note whether the
   input is synthetic or real.
2. Open it with the installed viewer, bound to this machine only:
   `npx playwright show-trace --host 127.0.0.1 --port <free port> "<path to trace.zip>"`
   (Playwright 1.61.1; it prints `Listening on http://127.0.0.1:<port>`). Stop it when done.
3. Never upload a trace to trace.playwright.dev or any other service, and never paste its network
   headers, cookies, bodies or screenshots into evidence or chat. Copy observations, not content.

## Inspect in this order

Record each item as **seen**, **absent** or **not checked**. Never fill in an item you did not look at.

| Step | Where in the viewer          | Question                                                               |
| ---- | ---------------------------- | ---------------------------------------------------------------------- |
| 1    | Actions list                 | Which action failed (red), and its duration against the timeout?       |
| 2    | Before / After snapshot tabs | Is the target element there? With which test ID, role, name, state?    |
| 3    | Log tab (of that action)     | What did the locator wait for ("waiting for …")?                       |
| 4    | Errors / Console tabs        | Any page or console errors around the step?                            |
| 5    | Network tab                  | Requests for the element's data or resource; status only.              |
| 6    | Source tab                   | Which test line ran; compare with the spec and the Page Object member. |

## What the next check depends on

| Observation                                                         | Next useful check                                                                                   | Playbook                              |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Element absent, everything else as the requirement says             | Keep the assertion; confirm against the requirement and treat it as a product question (draft only) | none                                  |
| Element present under another test ID, role or name                 | Confirm the change was intended; observe the new ID on dev (rule 10)                                | [POM refactoring](pom-refactoring.md) |
| Element present but appears after the timeout, or in another state  | Look for the state the page waits on (request, spinner); no fixed sleep                             | none                                  |
| Different result in another run under changed or unknown conditions | Compare provenance first; not proof of flakiness                                                    | none                                  |

## Worked examples

### Practice trace, test 2 (SYNTHETIC, inspected 2026-11-09)

Read with a local script over the unpacked trace (event files only) and served in the viewer.

- Actions: `Route requests` → `Set content` → `Expect "toBeVisible"` (`call@30`) → `Expect "toThrow"`.
- Failing action `call@30`: "expect(locator).toBeVisible() failed · Locator:
  getByTestId('checkout-button') · Timeout: 1000ms · element(s) not found". Test 2 still passes,
  because it expects this failure; the viewer shows the inner `expect` in red inside a passing test.
- Log: "waiting for getByTestId('checkout-button')".
- Snapshot after `Set content` (`after@call@28`): buttons `line-remove` and `cart-checkout`; no
  `checkout-button`. **Not checked:** the snapshots at the failing action (`before/after@call@30`).
  The trace stores later snapshots as references to earlier ones, so the script could not read their
  IDs, and the owner did not check them in the viewer.
- Console and page errors: none recorded. Network: 0 events, as expected with `setContent` and
  aborted requests; this says nothing about a real trace.
- Source: `locator.check.ts:24` `const original = (page) => page.getByTestId('checkout-button')`.
- Context: no `baseURL`, no storage state. Screencast: 1 frame, not looked at.
- Next check: confirm whether `checkout-button` → `cart-checkout` was intended → [POM refactoring](pom-refactoring.md).
  The case-03 repair was not performed (local-check `candidate = null`).
  Added 2026-11-11: the owner's decision (`getByTestId('cart-checkout')`) is now entered as
  `candidate`; a new practice capture would run tests 3 and 4 too. Not run yet. Later the same day
  (20:15Z) the local check ran without a trace: 4 of 4 passed; no new practice trace was captured.

### TC-SUI-020 (real, dev; trace not inspected)

From the sanitized report only:

- `toBeVisible()` failed on `getByTestId('cart-row').filter({ hasText: 'Codemify Classic Tee' })
.getByRole('img', { name: 'Codemify Classic Tee' })`, timeout 5000 ms, at `cart.spec.ts:70:39`;
  test duration 7829 ms; attachments `error-context` and `trace` (named only).
- The image check is the last assertion (moved last on 2026-11-08 so the amounts get a result), so
  by code order every earlier check in the test passed. This is inferred, not seen in the trace.
- **Not checked** (the viewer was served on 127.0.0.1 on 2026-11-09; the owner did not inspect it):
  the failing action's duration in the trace; any `img`, `picture`, `svg`, `role="img"` or CSS
  background in the tee's `cart-row` snapshot; console errors; image network requests; the Source
  tab line.
- Next check: steps 2 to 6 above on this trace. If no image exists in the row, keep the assertion
  (SCRUM-51 requires an image; SCRUM-166 is already filed, so no new report). If an image exists
  under another role or name, it is a locator question.
- Added 2026-11-11: "trace not inspected" here means the re-check run `20261108T202049Z` (Sources
  above). The earlier run 1, `20261108T194122Z`, is a different capture: its page snapshot and trace
  DOM were read on 2026-11-08 when SCRUM-166 was confirmed (evidence/week4-checks.md in tag week6-end, "Store UI").

## Capture a practice trace

Only the Task 03 local check, only through its own config, output in the ignored
`evidence/raw/week4/practice/<UTC>/` (rule 80, "Practice trace location", 2026-11-10; it replaced
`test-results/trace-practice/`, which later Playwright runs emptied):

```
npx playwright test --config evidence/agent-quality/local-check/playwright.config.ts --trace on --output evidence/raw/week4/practice/<UTC>/test-results
```

Add a `provenance.txt` with `synthetic: true` beside it. The fixtures are only read. This trace
replays case-03 (a locator change); it does not rehearse the image check. A capture is a run and
needs the owner's approval; it never uses the shared app.

## Limits

- One practice trace and one uninspected real trace are the whole basis of this playbook.
- A script over trace event files misses referenced snapshot content; the viewer is the reference.
- Nothing here proves a cause; the router's class and these observations are evidence for a person.
