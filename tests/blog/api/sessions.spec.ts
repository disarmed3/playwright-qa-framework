import { expect } from '@playwright/test';
import { envGuard } from '../../../env/envGuard';
import { runIfEnv } from '../../../env/runIfEnv';
import { readEntity, test } from '../../support/api';

// Guest, author and admin use separate request contexts: the guest never logs in and starts with no
// cookies or headers; author and admin each send only their own bearer token.

test.describe('blog API sessions (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test('TC-API-085 guest and author API sessions stay independent', async ({
    adminApi,
    authorApi,
    guestApi,
    nameFor,
    ownedArticles,
  }) => {
    const authorMe = await authorApi.client.get('/api/auth/me');
    expect(authorMe.status()).toBe(200);
    expect(readEntity(await authorMe.json()).id).toBe(authorApi.userId);

    // Admin part: its own identity, a different user from AUTHOR.
    const adminMe = await adminApi.client.get('/api/auth/me');
    expect(adminMe.status()).toBe(200);
    const admin = readEntity(await adminMe.json());
    expect(admin.id).toBe(adminApi.userId);
    expect(admin.role).toBe('admin');
    expect(admin.id).not.toBe(authorApi.userId);

    const guestMe = await guestApi.get('/api/auth/me');
    expect(guestMe.status()).toBe(401);

    const guestCreate = await test.step(`guest tries to create article "${nameFor()}"`, () =>
      envGuard(() =>
        ownedArticles.createAs(guestApi, { title: nameFor(), body: `${nameFor()} guest body` }),
      ));

    expect(guestCreate.response.status()).toBe(401);

    const authorMeAgain = await authorApi.client.get('/api/auth/me');
    expect(authorMeAgain.status()).toBe(200);
    expect(readEntity(await authorMeAgain.json()).id).toBe(authorApi.userId);
    const adminMeAgain = await adminApi.client.get('/api/auth/me');
    expect(adminMeAgain.status()).toBe(200);
    expect(readEntity(await adminMeAgain.json()).id).toBe(adminApi.userId);
  });
});
