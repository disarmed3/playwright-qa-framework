// Local check for one synthetic practice bundle (Week 4 Task 03, rule 60). Not part of the normal
// suite: runs only through ./playwright.config.ts. Imports only @playwright/test and Node built-ins.
//
// Pages come from the saved fixture files and are loaded with setContent; every request is aborted.
// The fixture files are read, never written.
//
//   1. the original locator and assertion pass on the earlier saved page
//   2. the original locator and assertion fail on the saved failing page (the fixture reproduces it)
//   3. a candidate repair passes on the saved failing page
//   4. the same candidate repair fails on the known-bad page (the repair still catches a broken page)
//
// 3 and 4 stay skipped until the owner has decided on a repair (Step 7); the candidate is entered
// then and recorded as an action outcome. The assertion itself (visible + enabled) never changes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';

const CASE_DIR = join(__dirname, '..', 'fixtures', 'case-03');
const pageFile = (path: string) => readFileSync(path, 'utf8');

/**
 * Entered only after the owner's decision (Step 7). null = no repair decided.
 * Owner decision 2026-11-10 (scorecard, case-03): `getByTestId('cart-checkout')` only; entered
 * 2026-11-11. The rename itself stays unconfirmed (synthetic input).
 */
const candidate = ((page: Page) => page.getByTestId('cart-checkout')) as
  ((page: Page) => Locator) | null;

const original = (page: Page) => page.getByTestId('checkout-button');

async function load(page: Page, path: string) {
  await page.route('**/*', (route) => route.abort());
  await page.setContent(pageFile(path));
}

/** The requirement's assertion, unchanged from the original check (test-excerpt.txt lines 13-14). */
async function assertCheckout(target: Locator) {
  await expect(target).toBeVisible();
  await expect(target).toBeEnabled();
}

test('1 original locator passes on the earlier saved page', async ({ page }) => {
  await load(page, join(CASE_DIR, 'page-a.html'));
  await assertCheckout(original(page));
});

test('2 original locator fails on the saved failing page', async ({ page }) => {
  await load(page, join(CASE_DIR, 'page-b.html'));
  await expect(assertCheckout(original(page))).rejects.toThrow();
});

test('3 candidate repair passes on the saved failing page', async ({ page }) => {
  test.skip(candidate === null, 'no repair decided yet (owner decision, Step 7)');
  if (candidate === null) return;
  await load(page, join(CASE_DIR, 'page-b.html'));
  await assertCheckout(candidate(page));
});

test('4 candidate repair still fails on the known-bad page', async ({ page }) => {
  test.skip(candidate === null, 'no repair decided yet (owner decision, Step 7)');
  if (candidate === null) return;
  await load(page, join(__dirname, 'known-bad.html'));
  await expect(assertCheckout(candidate(page))).rejects.toThrow();
});
