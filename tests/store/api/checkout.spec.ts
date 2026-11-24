import { expect } from '@playwright/test';
import { envGuard } from '../../../env/envGuard';
import { runIfEnv } from '../../../env/runIfEnv';
import {
  checkoutAllocation,
  checkoutInput,
  MOCK_CARDS,
  missingFieldStatus,
  readError,
  readOrderById,
  recordStockEffect,
  requireCaseGates,
  seedPrice,
  stockOf,
  test,
  undocumentedLuhnCard,
} from '../../support/store';

// Checkout validation: Jira SCRUM-36 subtasks and SCRUM-161, read 2026-11-07; schema 400 versus app
// 422 and the error fields from the mentor's answers of 2026-11-07 (items 6 and 7). Validation
// requests come from a fresh context with no cart, so no order can be created.
// Payment outcomes: the OAS pay description (documented test cards), Jira SCRUM-37 subtasks (read
// 2026-10-31) and the mentor's answers of 2026-11-07 (items 8 to 10, 12, and the follow-up outcome
// list). Each case uses a fresh pending order with quantity 1 on the allocated variant (Deterministic
// Cap, One Size, variant 11), within a one-run budget of 4 checkouts. Orders and payments cannot be
// deleted; an approved payment lowers shared stock, which is never reset. Exclusivity is not confirmed,
// so each stock effect is recorded before and after, not asserted.

test.describe('store API checkout and mock payment (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test('TC-SAPI-042 checkout from a context with no cart is refused with 422 empty_cart and "Your cart is empty."', async ({
    guestApi,
    nameFor,
  }) => {
    // No GET /api/cart first: that would create a cart row (SCRUM-67) and turn this into TC-SAPI-071.
    const response = await test.step('submit checkout from a fresh context with no cart', () =>
      envGuard(() => guestApi.post('/api/checkout', { data: checkoutInput(nameFor()) })));

    expect(response.status()).toBe(422);
    expect(await readError(response)).toMatchObject({
      error: 'empty_cart',
      message: 'Your cart is empty.',
    });
  });

  test('TC-SAPI-041 checkout validation refuses missing fields with schema 400 and blank or invalid values with 422 validation_error messages', async ({
    guestApi,
    nameFor,
  }) => {
    const info = test.info();
    requireCaseGates(info);

    // Input 1: required properties missing ({}), refused at schema validation (item 7).
    const missing =
      await test.step('submit checkout with no fields from a fresh context with no cart', () =>
        envGuard(() => guestApi.post('/api/checkout', { data: {} })));

    expect(missing.status()).toBe(missingFieldStatus());
    expect((await readError(missing)).code).toBe('FST_ERR_VALIDATION');

    // Input 2: every property present as a string, but an invalid email and blank shipping values.
    const blankShipping = {
      ...checkoutInput(nameFor()),
      email: 'not-an-email',
      ship_name: '',
      ship_address1: '',
      ship_city: '',
      ship_country: '',
      ship_postal: '',
    };

    const invalid =
      await test.step('submit checkout with an invalid email and blank shipping values', () =>
        envGuard(() => guestApi.post('/api/checkout', { data: blankShipping })));

    expect(invalid.status()).toBe(422);
    const refusal = await readError(invalid);
    expect(refusal.error).toBe('validation_error');
    expect(Array.isArray(refusal.messages)).toBe(true);
    expect(refusal.messages as string[]).toContainEqual(expect.stringMatching(/email/i));
  });

  test('TC-SAPI-050 paying a fresh pending order with the approved mock card returns 200, pays the order and records an approved payment', async ({
    ownedCart,
    nameFor,
  }) => {
    const info = test.info();
    const allocation = checkoutAllocation();
    const price = seedPrice(allocation.productSlug);
    const stockBefore = await stockOf(
      ownedCart.client,
      allocation.productSlug,
      allocation.variantId,
    );

    await test.step(`add 1 unit of allocated variant ${allocation.variantId}`, () =>
      envGuard(() => ownedCart.add(allocation.variantId, 1)));

    const created = await test.step('check out the own cart (retained order)', () =>
      envGuard(() => ownedCart.checkout(checkoutInput(nameFor()))));

    // Order creation and its totals are checked here, not in a separate TC-SAPI-040 test (item 12).
    expect(created.response.status()).toBe(201);
    expect(created.order).toMatchObject({
      status: 'pending',
      subtotal_cents: price,
      discount_cents: 0,
      total_cents: price,
    });
    const orderId = (created.order as Record<string, unknown>).id as number;

    const paid = await test.step(`pay own order ${orderId} with the approved mock card`, () =>
      envGuard(() => ownedCart.pay(orderId, MOCK_CARDS.approved)));

    expect(paid.status()).toBe(200);
    const after = await readOrderById(ownedCart.client, orderId);
    expect(after.order.status).toBe('paid');
    expect(after.items).toHaveLength(1);
    expect(after.items[0]).toMatchObject({ qty: 1, unit_price_cents: price });
    expect(after.payment).toMatchObject({ order_id: orderId, status: 'approved' });
    recordStockEffect(
      info,
      allocation,
      stockBefore,
      await stockOf(ownedCart.client, allocation.productSlug, allocation.variantId),
      'decrease by 1',
    );
    // Cart `ordered`, indirect evidence (item 10): the order references the original cart and the
    // next cart request returns a different, empty cart (which is retained too).
    expect(after.order.cart_id).toBe(ownedCart.cartId);
    const next = await ownedCart.read();
    expect(next.cart.id).not.toBe(ownedCart.cartId);
    expect(next.lines).toHaveLength(0);
    info.annotations.push({
      type: 'indirect-evidence',
      description: `cart ${String(ownedCart.cartId)} ordered: order ${orderId} references it; next cart ${String(next.cart.id)} is new and empty`,
    });
  });

  test('TC-SAPI-051 paying with the declined mock card returns 402 payment_declined, fails the order and records a declined payment', async ({
    ownedCart,
    nameFor,
  }) => {
    const info = test.info();
    const allocation = checkoutAllocation();
    const stockBefore = await stockOf(
      ownedCart.client,
      allocation.productSlug,
      allocation.variantId,
    );

    await test.step(`add 1 unit of allocated variant ${allocation.variantId}`, () =>
      envGuard(() => ownedCart.add(allocation.variantId, 1)));

    const created = await test.step('check out the own cart (retained order)', () =>
      envGuard(() => ownedCart.checkout(checkoutInput(nameFor()))));

    expect(created.response.status()).toBe(201);
    expect(created.order).toMatchObject({ status: 'pending' });
    const orderId = (created.order as Record<string, unknown>).id as number;

    const declined = await test.step(`pay own order ${orderId} with the declined mock card`, () =>
      envGuard(() => ownedCart.pay(orderId, MOCK_CARDS.declined)));

    expect(declined.status()).toBe(402);
    expect((await readError(declined)).error).toBe('payment_declined');
    const after = await readOrderById(ownedCart.client, orderId);
    expect(after.order.status).toBe('failed');
    expect(after.payment).toMatchObject({ order_id: orderId, status: 'declined' });
    recordStockEffect(
      info,
      allocation,
      stockBefore,
      await stockOf(ownedCart.client, allocation.productSlug, allocation.variantId),
      'no change caused by the payment',
    );
  });

  test('TC-SAPI-052 paying with the gateway-error mock card returns 502 gateway_error, leaves the order pending and records an error payment', async ({
    ownedCart,
    nameFor,
  }) => {
    const info = test.info();
    const allocation = checkoutAllocation();
    const stockBefore = await stockOf(
      ownedCart.client,
      allocation.productSlug,
      allocation.variantId,
    );

    await test.step(`add 1 unit of allocated variant ${allocation.variantId}`, () =>
      envGuard(() => ownedCart.add(allocation.variantId, 1)));

    const created = await test.step('check out the own cart (retained order)', () =>
      envGuard(() => ownedCart.checkout(checkoutInput(nameFor()))));

    expect(created.response.status()).toBe(201);
    expect(created.order).toMatchObject({ status: 'pending' });
    const orderId = (created.order as Record<string, unknown>).id as number;

    const failed =
      await test.step(`pay own order ${orderId} with the gateway-error mock card`, () =>
        envGuard(() => ownedCart.pay(orderId, MOCK_CARDS.gatewayError)));

    expect(failed.status()).toBe(502);
    expect((await readError(failed)).error).toBe('gateway_error');
    const after = await readOrderById(ownedCart.client, orderId);
    expect(after.order.status).toBe('pending');
    expect(after.payment).toMatchObject({ order_id: orderId, status: 'error' });
    recordStockEffect(
      info,
      allocation,
      stockBefore,
      await stockOf(ownedCart.client, allocation.productSlug, allocation.variantId),
      'no change caused by the payment',
    );
  });

  test('TC-SAPI-053 paying with an undocumented Luhn-valid card returns 422 card_invalid, leaves the order pending and saves no payment', async ({
    ownedCart,
    nameFor,
  }) => {
    const info = test.info();
    const allocation = checkoutAllocation();
    const stockBefore = await stockOf(
      ownedCart.client,
      allocation.productSlug,
      allocation.variantId,
    );

    await test.step(`add 1 unit of allocated variant ${allocation.variantId}`, () =>
      envGuard(() => ownedCart.add(allocation.variantId, 1)));

    const created = await test.step('check out the own cart (retained order)', () =>
      envGuard(() => ownedCart.checkout(checkoutInput(nameFor()))));

    expect(created.response.status()).toBe(201);
    expect(created.order).toMatchObject({ status: 'pending' });
    const orderId = (created.order as Record<string, unknown>).id as number;

    const refused =
      await test.step(`pay own order ${orderId} with a synthetic undocumented card`, () =>
        envGuard(() => ownedCart.pay(orderId, undocumentedLuhnCard())));

    expect(refused.status()).toBe(422);
    const refusal = await readError(refused);
    expect(refusal.error).toBe('card_invalid');
    expect(Array.isArray(refusal.messages)).toBe(true);
    // The setup order remains; the rejected attempt creates no payment row (item 10, follow-up).
    const after = await readOrderById(ownedCart.client, orderId);
    expect(after.order.status).toBe('pending');
    expect(after.payment).toBeNull();
    recordStockEffect(
      info,
      allocation,
      stockBefore,
      await stockOf(ownedCart.client, allocation.productSlug, allocation.variantId),
      'no change',
    );
  });
});
