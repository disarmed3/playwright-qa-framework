import { expect } from '@playwright/test';
import { envGuard } from '../../../env/envGuard';
import { runIfEnv } from '../../../env/runIfEnv';
import { pickVariants, readError, requirePicked, TEE, test } from '../../support/store';

// Each test owns one fresh guest cart and clears its coupon in teardown (see cart.spec.ts). Coupon
// terms are fixed facts in the mentor's starting data; statuses from Jira SCRUM-35 subtasks, read
// 2026-11-07; error fields, messages, totals and the re-application rule from the mentor's answers of
// 2026-11-07 (items 4 to 6). Valid, expired, unknown and re-applied coupons are separate cases with
// their own setup; none is evidence for another.

test.describe('store API coupons (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test('TC-SAPI-030 SAVE10 on a 5000-cent subtotal gives a 500 discount and a 4500 total', async ({
    ownedCart,
  }) => {
    // Two tees at the fixed 2500 make the 5000 subtotal SCRUM-77 names.
    const picked = await pickVariants(ownedCart.client, 1, undefined, [TEE]);
    const info = test.info();
    requirePicked(info, picked, 1);
    const [tee] = picked;

    await test.step(`add 2 tees (variant ${tee.variantId}) to the own cart`, () =>
      envGuard(() => ownedCart.add(tee.variantId, 2)));

    expect(ownedCart.subtotal(await ownedCart.read())).toBe(5000);

    const applied = await test.step('apply SAVE10 to the own cart', () =>
      envGuard(() => ownedCart.applyCoupon('SAVE10')));

    expect(applied.status()).toBe(200);
    const view = await ownedCart.read();
    expect(view.cart.coupon_code).toBe('SAVE10');
    expect(ownedCart.subtotal(view)).toBe(5000);
    expect(ownedCart.discount(view)).toBe(500);
    expect(ownedCart.total(view)).toBe(4500);
  });

  test('TC-SAPI-032 EXPIRED10 is refused with 422 coupon_error "This coupon has expired." and no discount', async ({
    ownedCart,
  }) => {
    const picked = await pickVariants(ownedCart.client, 1);
    const info = test.info();
    requirePicked(info, picked, 1);
    const [variant] = picked;

    await test.step(`add 1 unit of variant ${variant.variantId}`, () =>
      envGuard(() => ownedCart.add(variant.variantId, 1)));

    const before = await ownedCart.read();

    const refused = await test.step('try to apply EXPIRED10 to the own cart', () =>
      envGuard(() => ownedCart.applyCoupon('EXPIRED10')));

    expect(refused.status()).toBe(422);
    expect(await readError(refused)).toMatchObject({
      error: 'coupon_error',
      message: 'This coupon has expired.',
    });
    // A refused coupon is not applied: no discount, total = subtotal, the coupon stays as it was.
    const after = await ownedCart.read();
    expect(ownedCart.discount(after)).toBe(0);
    expect(ownedCart.total(after)).toBe(ownedCart.subtotal(after));
    expect(after.cart.coupon_code).toBe(before.cart.coupon_code);
  });

  test('TC-SAPI-033 an unknown coupon code is refused with 422 coupon_error "Invalid coupon code." and no discount', async ({
    ownedCart,
    nameFor,
  }) => {
    const picked = await pickVariants(ownedCart.client, 1);
    const info = test.info();
    requirePicked(info, picked, 1);
    const [variant] = picked;

    await test.step(`add 1 unit of variant ${variant.variantId}`, () =>
      envGuard(() => ownedCart.add(variant.variantId, 1)));

    const before = await ownedCart.read();
    // An owned qa-auto name is unique per run and test, so it is no existing coupon code.
    const unknownCode = nameFor();

    const refused = await test.step(`try to apply unknown code "${unknownCode}"`, () =>
      envGuard(() => ownedCart.applyCoupon(unknownCode)));

    expect(refused.status()).toBe(422);
    expect(await readError(refused)).toMatchObject({
      error: 'coupon_error',
      message: 'Invalid coupon code.',
    });
    const after = await ownedCart.read();
    expect(ownedCart.discount(after)).toBe(0);
    expect(ownedCart.total(after)).toBe(ownedCart.subtotal(after));
    expect(after.cart.coupon_code).toBe(before.cart.coupon_code);
  });

  test('TC-SAPI-074 applying SAVE10 a second time returns 200 and leaves the coupon, discount and total unchanged', async ({
    ownedCart,
  }) => {
    // Rule: mentor 2026-11-07, item 5 (one coupon per cart; discounts do not stack).
    const picked = await pickVariants(ownedCart.client, 1, undefined, [TEE]);
    const info = test.info();
    requirePicked(info, picked, 1);
    const [tee] = picked;

    await test.step(`add 2 tees (variant ${tee.variantId}) to the own cart`, () =>
      envGuard(() => ownedCart.add(tee.variantId, 2)));

    const first = await test.step('apply SAVE10 to the own cart', () =>
      envGuard(() => ownedCart.applyCoupon('SAVE10')));

    expect(first.status()).toBe(200);
    const afterFirst = await ownedCart.read();
    expect(ownedCart.discount(afterFirst)).toBe(500);
    expect(ownedCart.total(afterFirst)).toBe(4500);

    const second = await test.step('apply SAVE10 to the same, unchanged cart again', () =>
      envGuard(() => ownedCart.applyCoupon('SAVE10')));

    expect(second.status()).toBe(200);
    const afterSecond = await ownedCart.read();
    expect(afterSecond.cart.coupon_code).toBe('SAVE10');
    expect(ownedCart.discount(afterSecond)).toBe(ownedCart.discount(afterFirst));
    expect(ownedCart.total(afterSecond)).toBe(ownedCart.total(afterFirst));
    expect(ownedCart.subtotal(afterSecond)).toBe(5000);
  });
});
