import { expect } from '@playwright/test';
import { runIfEnv } from '../../../env/runIfEnv';
import { isNullOrString, login, readEntity, setCookies, test } from '../../support/api';
import { AUTHOR } from '../../support/users';

test.describe('blog API auth (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test('TC-API-010 login returns a token and the full user record', async ({ freshApi }) => {
    const response = await login(freshApi, AUTHOR);
    expect(response.status()).toBe(200);
    const { token, user } = await response.json();
    // Type and length only: a failed matcher must never print the token.
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    expect(Number.isInteger(user.id)).toBe(true);
    // A boolean comparison, so a failure does not print the account address.
    expect(user.email === AUTHOR.email, 'the login user is AUTHOR').toBe(true);
    expect(user.role).toBe('author');
    expect(typeof user.display_name).toBe('string');
    expect(user.display_name.length).toBeGreaterThan(0);
    expect(isNullOrString(user.bio), 'bio is null or a string').toBe(true);
    expect(typeof user.created_at).toBe('string');
    expect(user).not.toHaveProperty('password_hash');
  });

  test('TC-API-011 a wrong password is rejected with an error and no token', async ({
    freshApi,
  }) => {
    const response = await login(freshApi, { ...AUTHOR, password: `${AUTHOR.password}-wrong` });
    expect(response.status()).toBe(401);
    const body = await response.json();
    // App text, confirmed by the mentor 2026-11-02.
    expect(body.error).toBe('invalid_credentials');
    expect(body.message).toBe('Email or password is incorrect.');
    expect(body).not.toHaveProperty('token');
  });

  test('TC-API-012 an unknown email is rejected with the same error as a wrong password', async ({
    freshApi,
    nameFor,
  }) => {
    const wrongPassword = await login(freshApi, {
      ...AUTHOR,
      password: `${AUTHOR.password}-wrong`,
    });
    const unknownEmail = await login(freshApi, {
      email: `${nameFor()}@example.invalid`,
      password: `${AUTHOR.password}-wrong`,
    });
    expect(wrongPassword.status()).toBe(401);
    expect(unknownEmail.status()).toBe(401);
    const known = await wrongPassword.json();
    const unknown = await unknownEmail.json();
    expect(typeof unknown.error).toBe('string');
    expect(unknown.error).toBe(known.error);
    expect(unknown.message).toBe(known.message);
    expect(unknown).not.toHaveProperty('token');
  });

  test('TC-API-013 /me returns the user the login token belongs to', async ({
    freshApi,
    newApi,
  }) => {
    const response = await login(freshApi, AUTHOR);
    expect(response.status()).toBe(200);
    const { token, user } = await response.json();
    // A separate context with the bearer token only, so the login cookie cannot answer for it.
    const bearerOnly = await newApi({ bearer: token });
    const me = await bearerOnly.get('/api/auth/me');
    expect(me.status()).toBe(200);
    const meUser = readEntity(await me.json());
    expect(meUser.id).toBe(user.id);
    expect(meUser.email === user.email, '/me email equals the login user email').toBe(true);
  });

  test('TC-API-014 /me without a token or cookie is rejected with 401', async ({ guestApi }) => {
    const response = await guestApi.get('/api/auth/me');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('unauthorized');
    expect(body).not.toHaveProperty('user');
  });

  test('TC-API-015 the login cookie is HttpOnly, Secure and SameSite=Lax', async ({ freshApi }) => {
    const response = await login(freshApi, AUTHOR);
    expect(response.status()).toBe(200);
    const cookies = setCookies(response);
    expect(cookies.length).toBeGreaterThan(0);
    for (const cookie of cookies) {
      expect(cookie.attributes, `attributes of cookie ${cookie.name}`).toEqual(
        expect.arrayContaining(['httponly', 'secure', 'samesite=lax']),
      );
    }
  });

  test('TC-API-086 /me with an empty Bearer value and no cookie is rejected with 401', async ({
    newApi,
  }) => {
    // An empty Bearer counts as missing (mentor 2026-11-02). The context has never logged in, so no
    // qa_session cookie can answer as the fallback.
    const emptyBearer = await newApi({ bearer: '' });
    const response = await emptyBearer.get('/api/auth/me');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('unauthorized');
    expect(body).not.toHaveProperty('user');
  });
});
