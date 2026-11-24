import { expect } from '@playwright/test';
import { envGuard } from '../../env/envGuard';
import { runIfEnv } from '../../env/runIfEnv';
import { BlogListPage } from '../../pages/BlogListPage';
import { test } from '../support/api';

// The test owns one draft and one published article whose titles share its unique name, so the
// search shows only its own records and an exact count is safe (rule 10).

test.describe('blog public list drafts (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test('TC-UI-021 a draft article never appears on the public list', async ({
    page,
    nameFor,
    ownedArticles,
  }) => {
    await test.step(`create own draft "${nameFor('d')}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({ title: nameFor('d'), body: `${nameFor()} draft body` }),
      ));

    await test.step(`create own published article "${nameFor('p')}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({
          title: nameFor('p'),
          body: `${nameFor()} published body`,
          status: 'published',
        }),
      ));

    const blog = new BlogListPage(page);
    await blog.open();
    await blog.search(nameFor());
    await expect(blog.articleItems).toHaveCount(1);
    await expect(blog.firstArticleLink).toHaveText(nameFor('p'));
    await expect(blog.articleList).not.toContainText(nameFor('d'));
  });
});
