---
id: pom-refactoring
type: playbook
---

# Page Object refactoring

What to check before and after a locator or journey change in a Page Object. Written 2026-11-09
(Week 4 Task 05) from the Task 03 locator case and the real `CartPage`. It is a procedure, not a
verified repair: no repair from this playbook has been made or tested.

## Sources

- Locator case (SYNTHETIC): case-03,
  [case.json](../../../evidence/agent-quality/fixtures/case-03/case.json) (`sourceVersion` v1,
  2026-11-08). The check uses `getByTestId('checkout-button')`
  ([test-excerpt.txt](../../../evidence/agent-quality/fixtures/case-03/test-excerpt.txt), line 12);
  the earlier page has `data-testid="checkout-button"`
  ([page-a.html](../../../evidence/agent-quality/fixtures/case-03/page-a.html), line 20); the failing
  page has `data-testid="cart-checkout"`
  ([page-b.html](../../../evidence/agent-quality/fixtures/case-03/page-b.html), line 20). The 2026-11-09
  practice trace confirms `cart-checkout` and no `checkout-button` after the page loaded (see
  [Trace debugging](trace-debugging.md)).
- Task 03 proposals (unchanged records):
  [self-heal-20261108T211242Z.md](../../../evidence/agent-quality/answers/case-03/self-heal-20261108T211242Z.md),
  [self-heal-20261108T213444Z.md](../../../evidence/agent-quality/answers/case-03/self-heal-20261108T213444Z.md):
  confirm the rename first, then point the locator at the new ID; keep `toBeVisible` and `toBeEnabled`.
- Local check: [locator.check.ts](../../../evidence/agent-quality/local-check/locator.check.ts) —
  tests 3 and 4 stay skipped while `candidate = null` (no owner decision on a repair).
  Added 2026-11-11: the owner's case-03 decision (`getByTestId('cart-checkout')`) is entered as
  `candidate`; tests 3 and 4 have not run yet. Later the same day (20:15Z): the check ran, 4 of 4
  passed (evidence/week4-checks.md in tag week6-end, "Checks after the cleanup (2026-11-11)").
- Real Page Object: [CartPage.ts](../../../pages/CartPage.ts), `checkoutButton =
getByTestId('checkout-btn')` (line 32, ID recorded in
  `evidence/week4-checks.md` (tag `week6-end`), Store UI observations), used only by
  `goToCheckout()` (lines 79–82). Rules: [10-playwright-pom.md](../../../.claude/rules/10-playwright-pom.md),
  tiers in [01-guardrails.md](../../../.claude/rules/01-guardrails.md).

The synthetic IDs `checkout-button` and `cart-checkout` appear only under `evidence/agent-quality/`.
A synthetic case never justifies editing the real `CartPage`.

## Before any change

1. Confirm the change was intended (page owner, requirement). A failing locator alone does not say
   whether the page or the test is wrong.
2. Observe the new test ID read-only on dev and record page, element and date (rule 10). A guessed
   ID is never presented as verified.
3. Decide the scope:
   - an ID change: one Page Object line, callers unchanged;
   - a changed journey (new step, new URL, new state): the Page Object method, every spec that calls
     it and the catalog rows that describe the journey;
   - renaming or removing a Page Object member: EXTEND-ONLY tier, a CROSS-IMPACT record per caller
     and the owner's approval first.

## Find the callers

Results of 2026-11-09:

```
grep -rn "checkoutButton\|goToCheckout" tests pages
```

- `pages/CartPage.ts:20, 32, 79, 80` (declaration, locator, method)
- `tests/store/ui/checkout.spec.ts:43, 86, 117` (`cart.goToCheckout()`)
- `CartPage` is imported by `tests/store/ui/cart.spec.ts`, `checkout.spec.ts` and `coupons.spec.ts`.

Then `npm run typecheck`: it catches a renamed or removed member, not a changed ID string.

## Search for selectors that bypass Page Objects

The rule 10 greps, results of 2026-11-09:

```
grep -rnE "getBy[A-Z][a-zA-Z]*\(|locator\(|page\.goto|page\.click|page\.fill|page\.\$" tests --include=*.ts
grep -rnE "css=|xpath=|\.nth\(" tests pages --include=*.ts
grep -rn "checkout-btn" tests pages
```

- First two: 0 hits. Third: only `pages/CartPage.ts:32`.

Limits — a clean search is not proof of complete coverage:

- `.ts` files only; nothing outside `tests/` and `pages/` (support helpers in `tests/support/` are
  inside `tests/`, other folders are not).
- Missed: IDs built from variables or template strings, bracket calls (`page['click']`), wrappers
  with other names, and generated vault notes or catalog text that quote a locator.
- A grep finds text, not behaviour: a hit in a comment counts, a dynamic selector does not.

## After a change (procedure; not performed for case-03)

1. Change only the decided scope; keep the assertion as strong as before (visible and enabled for
   case-03). Never weaken, skip or add a fixed wait to make it pass.
2. For case-03: enter the candidate in the local check after the owner's decision, then run its own
   config: test 3 must pass on the failing page, test 4 must still fail on
   [known-bad.html](../../../evidence/agent-quality/local-check/known-bad.html) (the button is
   disabled there). Record the outcome separately in the scorecard.
3. For a real Page Object: typecheck, lint, `npm run test:list` (count unchanged) and an approved dev
   run of the affected specs only.

## Status

- Case-03 repair: not performed, not verified (Task 03 Step 7 decision still open).
- Real `CartPage`: no change needed or made. `checkout-btn` is recorded as observed on dev;
  TC-SUI-030 (which calls `goToCheckout()`) passed in run `20261108T194122Z`; TC-SUI-031 and 032
  were skipped there (blocked), so their calls were not exercised (`evidence/week4-checks.md` (tag `week6-end`), Store UI).
