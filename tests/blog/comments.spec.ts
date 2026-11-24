import { expect } from '@playwright/test';
import { envGuard } from '../../env/envGuard';
import { runIfEnv } from '../../env/runIfEnv';
import { ArticleDetailPage } from '../../pages/ArticleDetailPage';
import { BlogListPage } from '../../pages/BlogListPage';
import { test } from '../support/api';

// Web-first waits only. The test's own published article has no comments, so the comments area
// must resolve to its empty state; the part with comment items waits for an observed item ID (Q9).

test.describe('blog article comments (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test("TC-UI-031 an article's comments area resolves from loading to its empty state", async ({
    page,
    nameFor,
    ownedArticles,
  }) => {
    await test.step(`create own published article "${nameFor()}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({
          title: nameFor(),
          body: `${nameFor()} published body`,
          status: 'published',
        }),
      ));

    const blog = new BlogListPage(page);
    await blog.open();
    await blog.search(nameFor());
    await blog.openFirstArticle();
    const detail = new ArticleDetailPage(page);
    await expect(detail.title).toHaveText(nameFor());
    await expect(detail.commentsEmpty).toBeVisible();
    await expect(detail.commentsLoading).toBeHidden();
  });
});
