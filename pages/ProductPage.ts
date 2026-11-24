import { expect, type Locator, type Page } from '@playwright/test';
import { envGuard } from '../env/envGuard';
import { BasePage } from './BasePage';

/**
 * A store product page, `/shop/{slug}`. Test IDs observed on dev 2026-11-07 (evidence/week4-checks.md in tag week6-end,
 * "Store UI observations"). The variant select's option values are variant ids. Only the members the
 * Store UI cases use; the page's other observed IDs are added when a case needs them.
 */
export class ProductPage extends BasePage {
  // TC-SUI-014 (tests/store/ui/product.spec.ts). `product-price` observed on /shop/{slug} 2026-11-07
  // ("Store UI observations"); removed 2026-11-08 as unused, re-added for this case.
  readonly price: Locator;
  readonly variantSelect: Locator;
  readonly qtyInput: Locator;
  readonly addButton: Locator;

  constructor(page: Page) {
    super(page);
    this.price = page.getByTestId('product-price');
    this.variantSelect = page.getByTestId('variant-select');
    this.qtyInput = page.getByTestId('qty-input');
    this.addButton = page.getByTestId('add-to-cart');
  }

  async open(slug: string): Promise<void> {
    await this.page.goto(`/shop/${slug}`);
  }

  /**
   * Adds a variant (by id) in the given quantity to the guest cart: a write, so it runs inside
   * envGuard. Waits for its own form submit to land on `/cart` (observed redirect); not a scenario
   * assertion.
   */
  async addToCart(variantId: number, qty: number): Promise<void> {
    await this.variantSelect.selectOption(String(variantId));
    await this.qtyInput.fill(String(qty));
    await envGuard(() => this.addButton.click());
    await expect(this.page).toHaveURL((url) => url.pathname === '/cart');
  }
}
