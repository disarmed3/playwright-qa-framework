import { expect, test } from '@playwright/test';
import { runIfEnv } from '../../env/runIfEnv';
import { CategoriesPage } from '../../pages/CategoriesPage';
import { LoginPage } from '../../pages/LoginPage';
import { AUTHOR } from '../support/users';

test.describe('categories smoke (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test('a signed-in author sees the category list with at least one item', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.open();
    await loginPage.login(AUTHOR.email, AUTHOR.password);
    const categories = new CategoriesPage(page);
    await categories.open();
    await expect(categories.categoryList).toBeVisible();
    await expect(categories.categoryItems.first()).toBeVisible();
  });
});
