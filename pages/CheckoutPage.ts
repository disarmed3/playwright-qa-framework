import type { Locator, Page, Response } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * The checkout page, `/checkout`. Test IDs observed on dev 2026-11-07 (page view, no submit;
 * evidence/week4-checks.md in tag week6-end, "Store UI observations"). Added 2026-11-12 for TC-SUI-031 and 032 (mentor
 * 2026-11-12, Q47/Q49): filling the form and placing the order. `form-errors` is documented by the
 * mentor, not yet observed; the allocated run is its first observation (owner decision 2026-11-12).
 * The confirmation is on `/orders/{id}` (`OrderPage`).
 */
export class CheckoutPage extends BasePage {
  readonly form: Locator;
  readonly shipEmail: Locator;
  readonly shipName: Locator;
  readonly shipAddress1: Locator;
  readonly shipCity: Locator;
  readonly shipCountry: Locator;
  readonly shipPostal: Locator;
  readonly cardNumber: Locator;
  readonly cardName: Locator;
  readonly cardExp: Locator;
  readonly cardCvv: Locator;
  readonly testCards: Locator;
  readonly realCardWarning: Locator;
  readonly placeOrderButton: Locator;
  readonly summarySubtotal: Locator;
  readonly summaryDiscount: Locator;
  readonly summaryTotal: Locator;
  // Observed 2026-11-07 (page view); TC-SUI-032 checks the cap is still listed after a decline.
  readonly orderSummary: Locator;
  // The declined card's error list (mentor 2026-11-12, Q49): documented, not yet observed.
  readonly formErrors: Locator;

  constructor(page: Page) {
    super(page);
    this.form = page.getByTestId('checkout-form');
    this.shipEmail = page.getByTestId('ship-email');
    this.shipName = page.getByTestId('ship-name');
    this.shipAddress1 = page.getByTestId('ship-address1');
    this.shipCity = page.getByTestId('ship-city');
    this.shipCountry = page.getByTestId('ship-country');
    this.shipPostal = page.getByTestId('ship-postal');
    this.cardNumber = page.getByTestId('card-number');
    this.cardName = page.getByTestId('card-name');
    this.cardExp = page.getByTestId('card-exp');
    this.cardCvv = page.getByTestId('card-cvv');
    this.testCards = page.getByTestId('test-cards');
    this.realCardWarning = page.getByTestId('real-card-warning');
    this.placeOrderButton = page.getByTestId('place-order');
    this.summarySubtotal = page.getByTestId('summary-subtotal');
    this.summaryDiscount = page.getByTestId('summary-discount');
    this.summaryTotal = page.getByTestId('summary-total');
    this.orderSummary = page.getByTestId('order-summary');
    this.formErrors = page.getByTestId('form-errors');
  }

  /** Fills the shipping fields with the test's own synthetic values (no request is sent). */
  async fillShipping(input: {
    email: string;
    ship_name: string;
    ship_address1: string;
    ship_city: string;
    ship_country: string;
    ship_postal: string;
  }): Promise<void> {
    await this.shipEmail.fill(input.email);
    await this.shipName.fill(input.ship_name);
    await this.shipAddress1.fill(input.ship_address1);
    await this.shipCity.fill(input.ship_city);
    await this.shipCountry.fill(input.ship_country);
    await this.shipPostal.fill(input.ship_postal);
  }

  /** Fills the payment fields with a documented mock card (no request is sent). */
  async fillCard(card: { number: string; name: string; exp: string; cvv: string }): Promise<void> {
    await this.cardNumber.fill(card.number);
    await this.cardName.fill(card.name);
    await this.cardExp.fill(card.exp);
    await this.cardCvv.fill(card.cvv);
  }

  /**
   * Places the order: presses Place order and waits for its own form post (`POST /checkout`, a
   * navigation). Approved: a redirect to `/orders/{id}`; declined: 422 and the checkout page rendered
   * again (mentor 2026-11-12). It creates an order, so callers claim the press first and wrap this in
   * envGuard.
   */
  async placeOrder(): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (candidate) =>
          candidate.request().method() === 'POST' &&
          new URL(candidate.url()).pathname === '/checkout' &&
          candidate.request().isNavigationRequest(),
      ),
      this.placeOrderButton.click(),
    ]);
    return response;
  }

  /** The shipping and payment fields, in form order. */
  fields(): Locator[] {
    return [
      this.shipEmail,
      this.shipName,
      this.shipAddress1,
      this.shipCity,
      this.shipCountry,
      this.shipPostal,
      this.cardNumber,
      this.cardName,
      this.cardExp,
      this.cardCvv,
    ];
  }
}
