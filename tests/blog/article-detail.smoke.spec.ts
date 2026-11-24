import { expect, test } from '@playwright/test';
import { runIfEnv } from '../../env/runIfEnv';
import { ArticleDetailPage } from '../../pages/ArticleDetailPage';
import { BlogListPage } from '../../pages/BlogListPage';

test.describe('article detail smoke (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test(
    'opening the first article card shows its detail page with the same title',
    { tag: '@smoke' },
    async ({ page }) => {
      const blog = new BlogListPage(page);
      await blog.open();
      const clickedTitle = await blog.firstArticleTitle();
      expect(clickedTitle).not.toBe('');

      await blog.openFirstArticle();

      const detail = new ArticleDetailPage(page);
      await expect(page).toHaveURL(/\/articles\/[^/]+$/);
      await expect(detail.article).toBeVisible();
      await expect(detail.title).toHaveText(clickedTitle);
    },
  );
});
