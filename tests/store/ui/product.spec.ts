import { expect, test } from '@playwright/test';
import { runIfEnv } from '../../../env/runIfEnv';
import { ProductPage } from '../../../pages/ProductPage';
import { seedPrice, TEE, usd } from '../../support/store';

// Read only: a guest opens one product page; no form, cart or login, so no envGuard and no owned
// records; whether a guest page view creates server state is not observed.
// Requirement: TC-SUI-014 (vault/sources/test-catalog/store-ui.md), the price shown is the fixed seed
// price, 2500 cents for the tee (starting data). The `$25.00` display format was observed on dev
// 2026-11-07, not documented (Q8; evidence/week4-checks.md in tag week6-end, "Store UI observations"). Adopted from the
// recording of 2026-11-11 (evidence/week4-checks.md in tag week6-end, "Adoption").
// Catches a price taken from the wrong source or shown in the wrong format (the catalog's risk).

test.describe('store UI product page (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test(
    'TC-SUI-014 a guest opening the tee product page sees its fixed seed price of 2500 cents as $25.00',
    { tag: '@smoke' },
    async ({ page }) => {
      const product = new ProductPage(page);
      await product.open(TEE);

      await expect(product.price).toBeVisible();
      await expect(product.price).toHaveText(usd(seedPrice(TEE)));
    },
  );
});
