import { expect, test } from '@playwright/test';
import { runIfEnv } from '../../env/runIfEnv';
import { BlogListPage } from '../../pages/BlogListPage';

test.describe('blog category filter smoke (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test('filtering by the Playwright category shows only Playwright articles', async ({ page }) => {
    const blog = new BlogListPage(page);
    await blog.open();
    await expect(blog.articleCategories).not.toHaveCount(0);
    const unfiltered = (await blog.articleCategories.allTextContents()).map((category) =>
      category.trim(),
    );
    expect(
      unfiltered.filter((category) => category !== 'Playwright'),
      'the unfiltered list needs a non-Playwright article, or the filter has nothing to remove',
    ).not.toHaveLength(0);

    await blog.filterByCategory('Playwright');

    await expect(page).toHaveURL(/[?&]category=playwright(&|$)/);
    await expect(blog.articleCategories).not.toHaveCount(0);
    for (const category of await blog.articleCategories.allTextContents()) {
      expect(category.trim()).toBe('Playwright');
    }
  });
});
