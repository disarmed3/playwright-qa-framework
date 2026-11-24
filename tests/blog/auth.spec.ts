import { expect } from '@playwright/test';
import { runIfEnv } from '../../env/runIfEnv';
import { DashboardPage } from '../../pages/DashboardPage';
import { LoginPage } from '../../pages/LoginPage';
import { test } from '../support/api';
import { AUTHOR } from '../support/users';

test.describe('blog login (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test('TC-UI-010 login with valid author credentials reaches the dashboard with signed-in navigation', async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    await loginPage.open();
    await loginPage.login(AUTHOR.email, AUTHOR.password);
    await expect(page).toHaveURL((url) => url.pathname === '/dashboard');
    const dashboard = new DashboardPage(page);
    await expect(dashboard.heading).toBeVisible();
    await expect(dashboard.navLogout).toBeVisible();
    await expect(dashboard.navLogin).toBeHidden();
  });

  test('TC-UI-011 login with a wrong password shows the login error and stays on /login', async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    await loginPage.open();
    await loginPage.attemptLogin(AUTHOR.email, `${AUTHOR.password}-wrong`);
    await expect(loginPage.loginError).toBeVisible();
    // Path only: the redirect's query string carries the submitted address, so a failing URL
    // matcher would print it (evidence/task04-note.md in tag week6-end, signed-in observation).
    expect(new URL(page.url()).pathname).toBe('/login');
    await expect(loginPage.navLogin).toBeVisible();
  });

  test(
    'TC-UI-014 an anonymous visitor opening the dashboard is redirected to /login',
    { tag: '@smoke' },
    async ({ page }) => {
      const dashboard = new DashboardPage(page);
      await dashboard.open();
      await expect(page).toHaveURL((url) => url.pathname === '/login');
      await expect(new LoginPage(page).submitButton).toBeVisible();
    },
  );
});
