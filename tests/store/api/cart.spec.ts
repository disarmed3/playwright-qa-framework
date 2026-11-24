import { expect } from '@playwright/test';
import { envGuard } from '../../../env/envGuard';
import { runIfEnv } from '../../../env/runIfEnv';
import { pickVariants, readError, requirePicked, stockOf, test } from '../../support/store';

// Each test owns one fresh guest cart (its own cookie, no account), so other learners and runs never
// share it. Teardown deletes the registered lines and clears any coupon, also after a failure; the
// empty cart row stays (mentor 2026-11-07, item 2). Requirements: Jira SCRUM-34 subtasks, read
// 2026-11-07. Fields and arithmetic: mentor 2026-11-07, items 3 and 4 (integer cents; line total =
// qty x unit price; a new line copies the product price; subtotal = sum of line totals; total =
// max(0, subtotal - discount); shipping and tax 0). Stock is only a precondition; carts do not consume it.

test.describe('store API cart (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test('TC-SAPI-021 adding a variant creates one line at the product price, and line total, subtotal and total equal quantity times price', async ({
    ownedCart,
  }) => {
    const picked = await pickVariants(ownedCart.client, 1);
    const info = test.info();
    requirePicked(info, picked, 1);
    const [variant] = picked;

    const added =
      await test.step(`add 2 units of variant ${variant.variantId} to the own cart`, () =>
        envGuard(() => ownedCart.add(variant.variantId, 2)));

    expect(added.status()).toBe(200);
    const view = await ownedCart.read();
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]).toMatchObject({
      variant_id: variant.variantId,
      qty: 2,
      unit_price_cents: variant.price,
      line_total_cents: 2 * variant.price,
    });
    expect(ownedCart.subtotal(view)).toBe(2 * variant.price);
    expect(ownedCart.discount(view)).toBe(0);
    expect(ownedCart.total(view)).toBe(2 * variant.price);
  });

  test('TC-SAPI-022 adding the same variant twice raises the quantity of one line instead of adding a second', async ({
    ownedCart,
  }) => {
    const picked = await pickVariants(ownedCart.client, 1);
    const info = test.info();
    requirePicked(info, picked, 1);
    const [variant] = picked;

    const first = await test.step(`add 1 unit of variant ${variant.variantId}`, () =>
      envGuard(() => ownedCart.add(variant.variantId, 1)));

    const second = await test.step(`add 1 more unit of variant ${variant.variantId}`, () =>
      envGuard(() => ownedCart.add(variant.variantId, 1)));

    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
    const view = await ownedCart.read();
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]).toMatchObject({
      variant_id: variant.variantId,
      qty: 2,
      line_total_cents: 2 * variant.price,
    });
    expect(ownedCart.subtotal(view)).toBe(2 * variant.price);
    expect(ownedCart.total(view)).toBe(2 * variant.price);
  });

  test('TC-SAPI-023 adding more than the stock returns 422 cart_error and leaves the owned cart unchanged', async ({
    ownedCart,
  }) => {
    const picked = await pickVariants(ownedCart.client, 1);
    const info = test.info();
    requirePicked(info, picked, 1);
    const [variant] = picked;

    await test.step(`add 1 unit of variant ${variant.variantId}`, () =>
      envGuard(() => ownedCart.add(variant.variantId, 1)));

    const before = ownedCart.snapshot(await ownedCart.read());
    // Other learners can only lower stock (only a paid checkout changes it), so stock + 1 stays above it.
    const stock = await stockOf(ownedCart.client, variant.slug, variant.variantId);

    const refused =
      await test.step(`try to add ${stock + 1} units of variant ${variant.variantId}`, () =>
        envGuard(() => ownedCart.add(variant.variantId, stock + 1)));

    expect(refused.status()).toBe(422);
    // SCRUM-70 names the code; the mentor names the field (body.error, item 6).
    expect((await readError(refused)).error).toBe('cart_error');
    // Week 4 baseline: an invalid quantity leaves the owned lines, money and coupon unchanged.
    expect(ownedCart.snapshot(await ownedCart.read())).toEqual(before);
  });

  test('TC-SAPI-025 changing a line quantity recalculates line total, subtotal and total, and quantity 0 removes the line', async ({
    ownedCart,
  }) => {
    const picked = await pickVariants(ownedCart.client, 1);
    const info = test.info();
    requirePicked(info, picked, 1);
    const [variant] = picked;

    await test.step(`add 1 unit of variant ${variant.variantId}`, () =>
      envGuard(() => ownedCart.add(variant.variantId, 1)));

    const lineId = ownedCart.lineId((await ownedCart.read()).lines[0]);

    const raised = await test.step(`set own line ${lineId} to quantity 2`, () =>
      envGuard(() => ownedCart.setQty(lineId, 2)));

    expect(raised.status()).toBe(200);
    const afterRaise = await ownedCart.read();
    expect(afterRaise.lines).toHaveLength(1);
    expect(afterRaise.lines[0]).toMatchObject({ qty: 2, line_total_cents: 2 * variant.price });
    expect(ownedCart.subtotal(afterRaise)).toBe(2 * variant.price);
    expect(ownedCart.total(afterRaise)).toBe(2 * variant.price);

    const zeroed = await test.step(`set own line ${lineId} to quantity 0`, () =>
      envGuard(() => ownedCart.setQty(lineId, 0)));

    expect(zeroed.status()).toBe(200);
    const afterZero = await ownedCart.read();
    expect(afterZero.lines).toHaveLength(0);
    expect(ownedCart.subtotal(afterZero)).toBe(0);
    expect(ownedCart.total(afterZero)).toBe(0);
  });

  test('TC-SAPI-027 deleting one of two lines removes it and recomputes subtotal and total from the remaining line', async ({
    ownedCart,
  }) => {
    const picked = await pickVariants(ownedCart.client, 2);
    const info = test.info();
    requirePicked(info, picked, 2);
    const [removed, kept] = picked;

    await test.step(`add 1 unit each of variants ${removed.variantId} and ${kept.variantId}`, () =>
      envGuard(async () => {
        await ownedCart.add(removed.variantId, 1);
        await ownedCart.add(kept.variantId, 1);
      }));

    const before = await ownedCart.read();
    expect(ownedCart.subtotal(before)).toBe(removed.price + kept.price);
    const removedLine = before.lines.find((line) => line.variant_id === removed.variantId);
    expect(removedLine, 'line of the variant to remove').toBeDefined();
    const lineId = ownedCart.lineId(removedLine as Record<string, unknown>);

    const deleted = await test.step(`delete own line ${lineId}`, () =>
      envGuard(() => ownedCart.removeLine(lineId)));

    expect(deleted.status()).toBe(200);
    const after = await ownedCart.read();
    expect(after.lines).toHaveLength(1);
    expect(after.lines[0]).toMatchObject({ variant_id: kept.variantId, qty: 1 });
    expect(ownedCart.subtotal(after)).toBe(kept.price);
    expect(ownedCart.total(after)).toBe(kept.price);
  });
});
