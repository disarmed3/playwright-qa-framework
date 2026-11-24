import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * An order's page, `/orders/{id}`. Test IDs observed read-only on dev 2026-11-08 on own orders 3274
 * (paid) and 3275 (failed) (evidence/week4-checks.md in tag week6-end, "Store UI observations"). An approved browser
 * checkout redirects here (mentor 2026-11-12). The discount row has no test ID (mentor), so it is not
 * exposed. No navigation method: tests arrive through the checkout redirect.
 */
export class OrderPage extends BasePage {
  readonly confirmation: Locator;
  readonly orderNumber: Locator;
  readonly orderStatus: Locator;
  readonly paymentStatus: Locator;
  readonly orderTotal: Locator;

  constructor(page: Page) {
    super(page);
    this.confirmation = page.getByTestId('order-confirmation');
    this.orderNumber = page.getByTestId('order-number');
    this.orderStatus = page.getByTestId('order-status');
    this.paymentStatus = page.getByTestId('payment-status');
    this.orderTotal = page.getByTestId('order-total');
  }
}
