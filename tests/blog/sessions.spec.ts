import { expect } from '@playwright/test';
import { runIfEnv } from '../../env/runIfEnv';
import { DashboardPage } from '../../pages/DashboardPage';
import { readEntity, test } from '../support/api';

// Three browser contexts with no shared state: the author's starts from the worker's AUTHOR session
// (authedPage), the admin's from the worker's ADMIN session (adminPage), the guest's is the plain
// page and never signs in. Identities are read through each context's own request, so the cookies
// that context holds decide the answer.

test.describe('blog browser sessions (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test('TC-UI-015 guest and author browser sessions stay independent', async ({
    adminPage,
    adminState,
    authedPage,
    authState,
    page,
  }) => {
    const authorMe = await authedPage.request.get('/api/auth/me');
    expect(authorMe.status()).toBe(200);
    const author = readEntity(await authorMe.json());
    expect(author.id).toBe(authState.userId);
    expect(author.role).toBe('author');

    const guestMe = await page.request.get('/api/auth/me');
    expect(guestMe.status()).toBe(401);

    const authorDashboard = new DashboardPage(authedPage);
    await authorDashboard.open();
    await expect(authedPage).toHaveURL((url) => url.pathname === '/dashboard');
    await expect(authorDashboard.heading).toBeVisible();

    const guestDashboard = new DashboardPage(page);
    await guestDashboard.open();
    await expect(page).toHaveURL((url) => url.pathname === '/login');
    await expect(guestDashboard.navLogin).toBeVisible();

    await authorDashboard.open();
    await expect(authedPage).toHaveURL((url) => url.pathname === '/dashboard');
    await expect(authorDashboard.navLogout).toBeVisible();

    // Admin part: its own identity; clearing the admin context's cookies changes only that context.
    const adminMe = await adminPage.request.get('/api/auth/me');
    expect(adminMe.status()).toBe(200);
    const admin = readEntity(await adminMe.json());
    expect(admin.id).toBe(adminState.userId);
    expect(admin.role).toBe('admin');
    expect(admin.id).not.toBe(authState.userId);
    await adminPage.context().clearCookies();
    const adminMeAfter = await adminPage.request.get('/api/auth/me');
    expect(adminMeAfter.status()).toBe(401);
    const authorMeAfterAdmin = await authedPage.request.get('/api/auth/me');
    expect(authorMeAfterAdmin.status()).toBe(200);
    expect(readEntity(await authorMeAfterAdmin.json()).id).toBe(authState.userId);
    const guestMeAfterAdmin = await page.request.get('/api/auth/me');
    expect(guestMeAfterAdmin.status()).toBe(401);

    // Real logout in the author's own context (mentor 2026-11-02): it only clears that context's
    // cookie and revokes nothing on the server, so the worker's shared session and the other contexts
    // are untouched. The admin part above clears cookies because the admin's navigation has not been
    // observed (rule 10).
    await authorDashboard.logout();
    const authorMeAfter = await authedPage.request.get('/api/auth/me');
    expect(authorMeAfter.status()).toBe(401);
    await authorDashboard.open();
    await expect(authedPage).toHaveURL((url) => url.pathname === '/login');

    const guestMeAfter = await page.request.get('/api/auth/me');
    expect(guestMeAfter.status()).toBe(401);
  });
});
