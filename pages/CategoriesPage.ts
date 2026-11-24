import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/** Read-only view of /categories; the page's create and delete controls are deliberately not exposed. */
export class CategoriesPage extends BasePage {
  readonly categoryList: Locator;
  readonly categoryItems: Locator;

  constructor(page: Page) {
    super(page);
    this.categoryList = page.getByTestId('category-list');
    this.categoryItems = this.categoryList.getByTestId('category-item');
  }

  async open(): Promise<void> {
    await this.page.goto('/categories');
  }
}
