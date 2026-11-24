import { expect, test } from '@playwright/test';
import { runIfEnv } from '../../env/runIfEnv';
import { BlogListPage } from '../../pages/BlogListPage';
// Task 05 recording check 2026-10-20T20:02:45Z (commit field) (comment only).

test.describe('blog home smoke (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test('the banner is visible and identifies DEVELOPMENT', { tag: '@smoke' }, async ({ page }) => {
    const blog = new BlogListPage(page);
    await blog.open();
    await expect(blog.envBanner).toBeVisible();
    await expect(blog.envBanner).toHaveText('DEVELOPMENT');
  });

  test(
    'the first article card is visible and at least one card exists',
    { tag: '@smoke' },
    async ({ page }) => {
      const blog = new BlogListPage(page);
      await blog.open();
      await expect(blog.articleItems.first()).toBeVisible();
      await expect(blog.articleItems).not.toHaveCount(0);
    },
  );
});
