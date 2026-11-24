import { expect } from '@playwright/test';
import { envGuard } from '../../../env/envGuard';
import { runIfEnv } from '../../../env/runIfEnv';
import { CartPage } from '../../../pages/CartPage';
import { CheckoutPage } from '../../../pages/CheckoutPage';
import { OrderPage } from '../../../pages/OrderPage';
import { ProductPage } from '../../../pages/ProductPage';
import {
  claimUiCheckout,
  MOCK_CARDS,
  MOCK_CVV,
  MOCK_EXP,
  pickVariants,
  readOrderById,
  requirePicked,
  seedPrice,
  shippingFor,
  TEE,
  test,
  uiCheckoutAllocation,
  usd,
  usdDiscount,
  variantFacts,
} from '../../support/store';

// Guest only; each test owns its cart through `pageCart` (page.request) with API cleanup. Requirements:
// Jira SCRUM-31 subtasks (read 2026-11-08); the test cards: the OAS pay description. The checkout page
// view writes nothing (observed 2026-11-07). TC-SUI-031 and 032 place orders under the one-run Store UI
// allocation (mentor 2026-11-12, Q47; outcomes Q49). Each claims its press first and never presses
// again: a named skip when the allocation is closed, expired, used, or the journey's claim exists.

test.describe('store UI checkout (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test('TC-SUI-030 the checkout page renders the shipping and payment forms and shows the test-card panel', async ({
    page,
    pageCart,
  }) => {
    const picked = await pickVariants(pageCart.client, 1, undefined, [TEE]);
    const info = test.info();
    requirePicked(info, picked, 1);
    const [tee] = picked;

    await test.step(`add 1 tee (variant ${tee.variantId}) to the own cart`, () =>
      envGuard(() => pageCart.add(tee.variantId, 1)));

    const cart = new CartPage(page);
    await cart.open();
    await cart.goToCheckout();

    const checkout = new CheckoutPage(page);
    await expect(checkout.form).toBeVisible();
    for (const field of checkout.fields()) {
      await expect(field).toBeVisible();
    }
    await expect(checkout.testCards).toBeVisible();
    // The documented approved test card (OAS pay description) is listed on the panel.
    await expect(checkout.testCards).toContainText(MOCK_CARDS.approved);
    await expect(checkout.realCardWarning).toBeVisible();
    await expect(checkout.placeOrderButton).toBeVisible();
  });

  test(
    'TC-SUI-031 a SAVE10 cart carried through checkout with the approved mock card shows a paid confirmation with the order number and discounted total',
    { tag: '@e2e' },
    async ({ nameFor, page, pageCart }) => {
      // One allocated unit, quantity 1 (mentor 2026-11-12): $20.00, −$2.00, $18.00 for the cap.
      const allocation = uiCheckoutAllocation();
      const price = seedPrice(allocation.productSlug);
      const discount = price / 10; // SAVE10 = 10 % (starting data); mentor item 4 arithmetic
      const { name } = await variantFacts(
        pageCart.client,
        allocation.productSlug,
        allocation.variantId,
      );
      const product = new ProductPage(page);
      await product.open(allocation.productSlug);

      await test.step(`add 1 unit of allocated variant ${allocation.variantId} through the product page`, () =>
        envGuard(() => product.addToCart(allocation.variantId, 1)));

      await pageCart.read();
      const cart = new CartPage(page);
      await expect(cart.row(name)).toBeVisible();

      await test.step('apply SAVE10 through the cart page', () =>
        envGuard(() => cart.applyCoupon('SAVE10')));

      await expect(cart.subtotal).toHaveText(usd(price));
      await expect(cart.discount).toHaveText(usdDiscount(discount));
      await expect(cart.total).toHaveText(usd(price - discount));
      await cart.goToCheckout();
      const checkout = new CheckoutPage(page);
      await expect(checkout.summarySubtotal).toHaveText(usd(price));
      await expect(checkout.summaryDiscount).toHaveText(usdDiscount(discount));
      await expect(checkout.summaryTotal).toHaveText(usd(price - discount));
      await expect(checkout.placeOrderButton).toContainText(usd(price - discount));

      const shipping = shippingFor(nameFor());
      await checkout.fillShipping(shipping);
      await checkout.fillCard({
        number: MOCK_CARDS.approved,
        name: shipping.ship_name,
        exp: MOCK_EXP,
        cvv: MOCK_CVV,
      });

      await test.step(`claim the one approved press for ${shipping.email}`, () => {
        claimUiCheckout(test.info(), 'TC-SUI-031', shipping.email);
      });

      const placed = await test.step(`place the approved order for ${shipping.email}`, () =>
        envGuard(() => checkout.placeOrder()));

      // Before any assertion: an approved order closes the cart, so teardown must leave it (item 2).
      const orderId = pageCart.markOrderedFromRedirect(placed);

      // Approved: redirected to that order's page (mentor 2026-11-12).
      await expect(page).toHaveURL((url) => url.pathname === `/orders/${String(orderId)}`);
      const order = new OrderPage(page);
      await expect(order.confirmation).toBeVisible();
      await expect(order.orderNumber).toHaveText(/^CM-\d{4}-\d{6}$/);
      // "paid" (mentor 2026-11-12) and "Paid" (observed 2026-11-08): the exact word, any case.
      await expect(order.orderStatus).toHaveText(/^paid$/i);
      await expect(order.paymentStatus).toHaveText(
        `Payment: approved · card ••••${MOCK_CARDS.approved.slice(-4)}`,
      );
      await expect(order.orderTotal).toHaveText(usd(price - discount));

      // The order read through the API is paid with SAVE10 (catalog TC-SUI-031; own order, mentor
      // 2026-11-07 item 10; read only). Last and soft, so every browser result above and every field
      // here is reported: the order record's API shape was seen only in the checkout response
      // (2026-11-07); `coupon_code` is an `orders` column (db-map), not yet seen through the API.
      const read = await readOrderById(pageCart.client, Number(orderId));
      expect.soft(read.order).toMatchObject({
        status: 'paid',
        coupon_code: 'SAVE10',
        subtotal_cents: price,
        discount_cents: discount,
        total_cents: price - discount,
      });
      expect.soft(read.items).toHaveLength(1);
      expect.soft(read.items[0]).toMatchObject({ qty: 1, unit_price_cents: price });
      expect.soft(read.payment).toMatchObject({ order_id: orderId, status: 'approved' });
    },
  );

  test(
    'TC-SUI-032 the declined mock card shows the payment error and no order confirmation',
    { tag: '@e2e' },
    async ({ nameFor, page, pageCart }) => {
      // One allocated unit, quantity 1; the expected outcome is the mentor's of 2026-11-12 (Q49).
      const allocation = uiCheckoutAllocation();
      const { name } = await variantFacts(
        pageCart.client,
        allocation.productSlug,
        allocation.variantId,
      );
      const product = new ProductPage(page);
      await product.open(allocation.productSlug);

      await test.step(`add 1 unit of allocated variant ${allocation.variantId} through the product page`, () =>
        envGuard(() => product.addToCart(allocation.variantId, 1)));

      await pageCart.read();
      const cart = new CartPage(page);
      await expect(cart.row(name)).toBeVisible();
      await cart.goToCheckout();
      const checkout = new CheckoutPage(page);
      await expect(checkout.placeOrderButton).toBeVisible();

      const shipping = shippingFor(nameFor());
      await checkout.fillShipping(shipping);
      await checkout.fillCard({
        number: MOCK_CARDS.declined,
        name: shipping.ship_name,
        exp: MOCK_EXP,
        cvv: MOCK_CVV,
      });

      await test.step(`claim the one declined press for ${shipping.email}`, () => {
        claimUiCheckout(test.info(), 'TC-SUI-032', shipping.email);
      });

      const response = await test.step(`place the declined order for ${shipping.email}`, () =>
        envGuard(() => checkout.placeOrder()));

      // Declined (mentor 2026-11-12, Q49): 422, the checkout page rendered again, no redirect.
      expect(response.status()).toBe(422);
      await expect(page).toHaveURL((url) => url.pathname === '/checkout');
      await expect(checkout.formErrors).toContainText('Your card was declined.');
      await expect(new OrderPage(page).confirmation).toHaveCount(0);
      await expect(checkout.orderSummary).toContainText(name);

      // The cart still holds the line, in the browser and through the API; teardown removes it.
      await cart.open();
      await expect(cart.row(name)).toBeVisible();
      const after = await pageCart.read();
      expect(after.lines.map((line) => line.variant_id)).toEqual([allocation.variantId]);
    },
  );
});
