import type { Locator, Page } from '@playwright/test';

/** Shared parts of every course-app page. Navigation is relative, so the configured baseURL decides the target. */
export abstract class BasePage {
  readonly envBanner: Locator;
  // Main navigation, on every page (evidence/task04-note.md in tag week6-end, Week 3 Task 05 observations).
  readonly navLogin: Locator;
  readonly navDashboard: Locator;
  readonly navLogout: Locator;
  // Store navigation cart count, on every page (evidence/week4-checks.md in tag week6-end, "Store UI observations",
  // 2026-11-07): it exists only while the cart holds items and counts units, not lines.
  readonly cartCount: Locator;

  constructor(protected readonly page: Page) {
    this.envBanner = page.getByTestId('env-banner');
    this.navLogin = page.getByTestId('nav-login');
    this.navDashboard = page.getByTestId('nav-dashboard');
    this.navLogout = page.getByTestId('nav-logout');
    this.cartCount = page.getByTestId('cart-count');
  }

  /** Signs out with the navigation's logout button; waits for its own action until the login link shows. */
  async logout(): Promise<void> {
    await this.navLogout.click();
    await this.navLogin.waitFor();
  }
}
