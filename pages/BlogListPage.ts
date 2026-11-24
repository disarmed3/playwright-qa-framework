import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class BlogListPage extends BasePage {
  readonly articleList: Locator;
  readonly articleItems: Locator;
  readonly firstArticleLink: Locator;
  readonly articleCategories: Locator;
  readonly categorySelect: Locator;
  readonly filterSubmit: Locator;
  readonly searchInput: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    super(page);
    this.searchInput = page.getByTestId('search-input');
    this.emptyState = page.getByTestId('empty-state');
    this.articleList = page.getByTestId('article-list');
    this.articleItems = this.articleList.getByTestId('article-item');
    this.firstArticleLink = this.articleList.getByTestId('article-link').first();
    this.articleCategories = this.articleList.getByTestId('article-category');
    this.categorySelect = page.getByTestId('category-select');
    this.filterSubmit = page.getByTestId('filter-submit');
  }

  async open(): Promise<void> {
    await this.page.goto('/');
  }

  /** The first article's title as shown on its card, trimmed; '' when the link has no text. */
  async firstArticleTitle(): Promise<string> {
    return (await this.firstArticleLink.textContent())?.trim() ?? '';
  }

  async openFirstArticle(): Promise<void> {
    await this.firstArticleLink.click();
  }

  /** Searches titles and bodies through the filter form (a GET form; reads only). */
  async search(term: string): Promise<void> {
    await this.searchInput.fill(term);
    await this.filterSubmit.click();
  }

  /** Picks a category by its visible name and submits the filter (a GET form; reads only). */
  async filterByCategory(name: string): Promise<void> {
    await this.categorySelect.selectOption({ label: name });
    await this.filterSubmit.click();
  }
}
