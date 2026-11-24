import { expect } from '@playwright/test';
import { envGuard } from '../../../env/envGuard';
import { runIfEnv } from '../../../env/runIfEnv';
import { CartPage } from '../../../pages/CartPage';
import {
  pickVariants,
  requirePicked,
  TEE,
  test,
  usd,
  usdDiscount,
  variantFacts,
} from '../../support/store';

// Guest only; each test seeds its own cart through `pageCart` (page.request), then applies codes
// through the cart page. Teardown clears the coupon and the lines through the API (the UI's empty code
// does not clear a coupon, observed 2026-11-07). Coupon terms: the mentor's starting data; codes and
// messages: Jira SCRUM-52 (read 2026-11-08), SCRUM-79 (read 2026-11-07) and the mentor's answers of
// 2026-11-07 (item 6). Where the message shows on screen was observed on dev 2026-11-07.

test.describe('store UI coupons (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test('TC-SUI-022 an invalid code shows coupon-error, then SAVE10 shows the discount row and the reduced total', async ({
    page,
    pageCart,
    nameFor,
  }) => {
    const picked = await pickVariants(pageCart.client, 1, undefined, [TEE]);
    const info = test.info();
    requirePicked(info, picked, 1);
    const [tee] = picked;
    const { name } = await variantFacts(pageCart.client, TEE, tee.variantId);

    await test.step(`add 2 tees (variant ${tee.variantId}) to the own cart`, () =>
      envGuard(() => pageCart.add(tee.variantId, 2)));

    const cart = new CartPage(page);
    await cart.open();
    await expect(cart.row(name)).toBeVisible();
    // An owned qa-auto name is unique per run and test, so it is no existing coupon code.
    const unknownCode = nameFor();

    await test.step(`apply unknown code "${unknownCode}" through the cart page`, () =>
      envGuard(() => cart.applyCoupon(unknownCode)));

    await expect(cart.couponError).toHaveText('Invalid coupon code.');
    await expect(cart.discount).toHaveCount(0);

    await test.step('apply SAVE10 through the cart page', () =>
      envGuard(() => cart.applyCoupon('SAVE10')));

    // SAVE10 = 10 % (starting data): 5000 → discount 500, total 4500 (SCRUM-77, mentor item 4).
    await expect(cart.couponError).toHaveCount(0);
    await expect(cart.discountLabel('SAVE10')).toBeVisible();
    await expect(cart.discount).toHaveText(usdDiscount(500));
    await expect(cart.subtotal).toHaveText(usd(5000));
    await expect(cart.total).toHaveText(usd(4500));
    const view = await pageCart.read();
    expect(view.cart.coupon_code).toBe('SAVE10');
    expect(pageCart.discount(view)).toBe(500);
  });

  test('TC-SAPI-032 EXPIRED10 applied through the cart page shows "This coupon has expired." with no discount and an unchanged total', async ({
    page,
    pageCart,
  }) => {
    // Same case as the API check (rule and example: SCRUM-79, mentor item 6, starting data EXPIRED10).
    const picked = await pickVariants(pageCart.client, 1);
    const info = test.info();
    requirePicked(info, picked, 1);
    const [variant] = picked;
    const { name } = await variantFacts(pageCart.client, variant.slug, variant.variantId);

    await test.step(`add 1 unit of variant ${variant.variantId} to the own cart`, () =>
      envGuard(() => pageCart.add(variant.variantId, 1)));

    const cart = new CartPage(page);
    await cart.open();
    await expect(cart.row(name)).toBeVisible();
    await expect(cart.total).toHaveText(usd(variant.price));

    await test.step('apply EXPIRED10 through the cart page', () =>
      envGuard(() => cart.applyCoupon('EXPIRED10')));

    await expect(cart.couponError).toHaveText('This coupon has expired.');
    await expect(cart.discount).toHaveCount(0);
    await expect(cart.subtotal).toHaveText(usd(variant.price));
    await expect(cart.total).toHaveText(usd(variant.price));
    const view = await pageCart.read();
    expect(pageCart.discount(view)).toBe(0);
    expect(view.cart.coupon_code).toBeNull();
  });
});
