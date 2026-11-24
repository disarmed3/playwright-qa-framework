import { expect, type Locator, type Page } from '@playwright/test';
import { envGuard } from '../env/envGuard';
import { BasePage } from './BasePage';

/**
 * The guest cart, `/cart`. Test IDs observed on dev 2026-11-07 (evidence/week4-checks.md in tag week6-end, "Store UI
 * observations"). Totals, the coupon form and the checkout link exist only while the cart holds items;
 * `discount` only while a coupon applies; `coupon-error` only after a refused code. No update or remove
 * method: no reviewed case needs one, and tests clean their carts through the API (mentor 2026-11-07).
 */
export class CartPage extends BasePage {
  readonly rows: Locator;
  readonly summary: Locator;
  readonly subtotal: Locator;
  readonly discount: Locator;
  readonly total: Locator;
  readonly couponInput: Locator;
  readonly couponApply: Locator;
  readonly couponError: Locator;
  readonly checkoutButton: Locator;

  constructor(page: Page) {
    super(page);
    this.rows = page.getByTestId('cart-row');
    this.summary = page.getByTestId('cart-summary');
    this.subtotal = page.getByTestId('subtotal');
    this.discount = page.getByTestId('discount');
    this.total = page.getByTestId('cart-total');
    this.couponInput = page.getByTestId('coupon-input');
    this.couponApply = page.getByTestId('coupon-apply');
    this.couponError = page.getByTestId('coupon-error');
    this.checkoutButton = page.getByTestId('checkout-btn');
  }

  /** Opening the cart may create a guest cart row on the server, so it runs inside envGuard. */
  async open(): Promise<void> {
    await envGuard(() => this.page.goto('/cart'));
  }

  /** The cart line for a product, by its visible name. */
  row(productName: string): Locator {
    return this.rows.filter({ hasText: productName });
  }

  rowQty(productName: string): Locator {
    return this.row(productName).getByTestId('qty-input');
  }

  rowLineTotal(productName: string): Locator {
    return this.row(productName).getByTestId('line-total');
  }

  /** Fallback: the line's image has no test ID; by role and accessible name (alt = product name). */
  rowImage(productName: string): Locator {
    return this.row(productName).getByRole('img', { name: productName });
  }

  /** Fallback: the line's variant label has no test ID; its exact text inside the line. */
  rowVariantLabel(productName: string, label: string): Locator {
    return this.row(productName).getByText(label, { exact: true });
  }

  /** Fallback: the "Discount (<CODE>)" label has no test ID; its text inside the summary. */
  discountLabel(code: string): Locator {
    return this.summary.getByText(`Discount (${code})`);
  }

  /**
   * Submits a coupon code for the own cart: a write, inside envGuard. Waits for its own reload of
   * `/cart` (a refusal adds `?coupon_error=…`); not a scenario assertion.
   */
  async applyCoupon(code: string): Promise<void> {
    await this.couponInput.fill(code);
    await envGuard(() => this.couponApply.click());
    await expect(this.page).toHaveURL((url) => url.pathname === '/cart');
  }

  /** Follows the checkout link (a page view, no submit); waits for `/checkout`. */
  async goToCheckout(): Promise<void> {
    await this.checkoutButton.click();
    await expect(this.page).toHaveURL((url) => url.pathname === '/checkout');
  }
}
