import { expect } from '@playwright/test';
import { envGuard } from '../../../env/envGuard';
import { runIfEnv } from '../../../env/runIfEnv';
import { CartPage } from '../../../pages/CartPage';
import { ProductPage } from '../../../pages/ProductPage';
import { pickVariants, requirePicked, TEE, test, usd, variantFacts } from '../../support/store';

// Guest only: each test's browser context has its own guest cart cookie, and `pageCart` (the store
// helper on page.request) shares it, registers every line and cleans up through the API afterwards,
// also after a failure; the empty cart row stays (mentor 2026-11-07, item 2). Shared stock, products
// and coupons are only read. Requirements: Jira SCRUM-29 (read 2026-10-31) and SCRUM-30/51 (read
// 2026-11-08); amounts from the mentor's starting data and arithmetic (item 4); the `$25.00` format and
// the nav count in units were observed on dev 2026-11-07 (evidence/week4-checks.md in tag week6-end, Store UI).

test.describe('store UI cart (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test('TC-SUI-012 adding a variant to the cart lists the product with its variant label on the cart page and raises the nav cart count to 1', async ({
    page,
    pageCart,
  }) => {
    const picked = await pickVariants(pageCart.client, 1, undefined, [TEE]);
    const info = test.info();
    requirePicked(info, picked, 1);
    const [tee] = picked;
    const { name, label } = await variantFacts(pageCart.client, TEE, tee.variantId);
    const product = new ProductPage(page);
    await product.open(TEE);

    await test.step(`add 1 unit of variant ${tee.variantId} through the product page`, () =>
      envGuard(() => product.addToCart(tee.variantId, 1)));

    // Register the new line for cleanup before any assertion.
    await pageCart.read();

    const cart = new CartPage(page);
    await expect(page).toHaveURL((url) => url.pathname === '/cart');
    await expect(cart.row(name)).toBeVisible();
    await expect(cart.rowVariantLabel(name, label)).toBeVisible();
    await expect(cart.cartCount).toHaveText('1');
  });

  test("TC-SUI-020 the cart shows the line's name, variant, quantity 2, line total, subtotal and total for the tee", async ({
    page,
    pageCart,
  }) => {
    const picked = await pickVariants(pageCart.client, 1, undefined, [TEE]);
    const info = test.info();
    requirePicked(info, picked, 1);
    const [tee] = picked;
    const { name, label } = await variantFacts(pageCart.client, TEE, tee.variantId);

    await test.step(`add 2 units of variant ${tee.variantId} to the own cart`, () =>
      envGuard(() => pageCart.add(tee.variantId, 2)));

    const cart = new CartPage(page);
    await cart.open();

    // SCRUM-51: image, name, variant, quantity and line total on the line; subtotal correct.
    await expect(cart.row(name)).toBeVisible();
    await expect(cart.rowVariantLabel(name, label)).toBeVisible();
    await expect(cart.rowQty(name)).toHaveValue('2');
    await expect(cart.rowLineTotal(name)).toHaveText(usd(2 * tee.price));
    await expect(cart.subtotal).toHaveText(usd(2 * tee.price));
    // No coupon, shipping and tax 0: total = subtotal (mentor 2026-11-07, item 4).
    await expect(cart.total).toHaveText(usd(2 * tee.price));
    expect(pageCart.total(await pageCart.read())).toBe(2 * tee.price);
    // Checked last so the amounts above get a result: the cart shows no line image today, product bug
    // SCRUM-166 (owner decision 2026-11-08). The expectation stays as SCRUM-51 states it.
    await expect(cart.rowImage(name)).toBeVisible();
  });
});
