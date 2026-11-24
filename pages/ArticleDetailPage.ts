import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/** Read-only view of /articles/<slug>; the page's comment form is deliberately not exposed. */
export class ArticleDetailPage extends BasePage {
  readonly article: Locator;
  readonly title: Locator;
  readonly commentsLoading: Locator;
  readonly commentsEmpty: Locator;

  constructor(page: Page) {
    super(page);
    this.article = page.getByTestId('article-detail');
    this.title = page.getByTestId('article-title');
    this.commentsLoading = page.getByTestId('comments-loading');
    this.commentsEmpty = page.getByTestId('comments-empty');
  }
}
