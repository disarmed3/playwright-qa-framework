import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/** Read-only view of /dashboard; its create, edit and delete controls are deliberately not exposed. */
export class DashboardPage extends BasePage {
  readonly heading: Locator;
  readonly table: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByTestId('dashboard-head');
    this.table = page.getByTestId('dashboard-table');
  }

  async open(): Promise<void> {
    await this.page.goto('/dashboard');
  }
}
