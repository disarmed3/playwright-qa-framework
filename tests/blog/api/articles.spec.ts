import { expect } from '@playwright/test';
import { envGuard } from '../../../env/envGuard';
import { runIfEnv } from '../../../env/runIfEnv';
import {
  deleteArticle,
  idsOf,
  listItems,
  readEntity,
  test,
  updateArticle,
} from '../../support/api';

// Every article here is the test's own, named after the test and deleted in fixture teardown. ADMIN
// and OTHER_AUTHOR act only on those own articles; seeded articles are never changed. Statuses, error
// shapes, limits and messages: vault/sources/product/blog-api.md.

test.describe('blog API articles (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test('TC-API-026 an author creates an article and reads back the same title, body and draft status', async ({
    authorApi,
    nameFor,
    ownedArticles,
  }) => {
    const title = nameFor();
    const body = `${nameFor()} body`;

    const created = await test.step(`create own article "${title}"`, () =>
      envGuard(() => ownedArticles.create({ title, body })));

    // 201 with an {article} wrapper (mentor 2026-11-02; the contract's 200 is a generic default).
    expect(created.response.status()).toBe(201);
    expect(await created.response.json()).toHaveProperty('article');
    const response = await authorApi.client.get(`/api/articles/${created.id}`);
    expect(response.status()).toBe(200);
    const article = readEntity(await response.json());
    expect(article.id).toBe(created.id);
    expect(article.title).toBe(title);
    expect(article.body).toBe(body);
    expect(article.status).toBe('draft');
  });

  test('TC-API-027 article validation rejects missing fields with 400 and out-of-range lengths with 422, and accepts the exact limits', async ({
    authorApi,
    nameFor,
    ownedArticles,
  }) => {
    // Limits after trimming: title 4 to 140, body at least 20. The 4-character title cannot hold the
    // owned name, so that record carries it in its body; teardown deletes both by id.
    const withoutTitle = await test.step('try to create an own article without a title', () =>
      envGuard(() => ownedArticles.create({ body: `${nameFor()} body` })));

    const withoutBody =
      await test.step(`try to create own article "${nameFor()}" without a body`, () =>
        envGuard(() => ownedArticles.create({ title: nameFor() })));

    const tooShort =
      await test.step('try to create an own article with a 3-character title and a 19-character body', () =>
        envGuard(() => ownedArticles.create({ title: 'qa3', body: 'b'.repeat(19) })));

    const tooLong =
      await test.step(`try to create own article "${nameFor('t141')}…" with a 141-character title`, () =>
        envGuard(() =>
          ownedArticles.create({
            title: nameFor('t141').padEnd(141, 'x'),
            body: `${nameFor()} long title body`,
          }),
        ));

    const atMaxTitle =
      await test.step(`create own article "${nameFor('t140')}…" with a 140-character title and a 20-character body`, () =>
        envGuard(() =>
          ownedArticles.create({ title: nameFor('t140').padEnd(140, 'x'), body: 'b'.repeat(20) }),
        ));

    const atMinTitle =
      await test.step(`create own article with a 4-character title and body "${nameFor('t4')}…"`, () =>
        envGuard(() =>
          ownedArticles.create({ title: 'qa4t', body: `${nameFor('t4')} minimum title body` }),
        ));

    for (const attempt of [withoutTitle, withoutBody]) {
      expect(attempt.response.status()).toBe(400);
      expect((await attempt.response.json()).code).toBe('FST_ERR_VALIDATION');
    }
    expect(tooShort.response.status()).toBe(422);
    const shortBody = await tooShort.response.json();
    expect(shortBody.error).toBe('validation_error');
    expect(shortBody.messages).toEqual(
      expect.arrayContaining([
        'Title must be at least 4 characters.',
        'Body must be at least 20 characters.',
      ]),
    );
    expect(tooLong.response.status()).toBe(422);
    expect((await tooLong.response.json()).messages).toContain(
      'Title must be 140 characters or fewer.',
    );
    expect(atMaxTitle.response.status()).toBe(201);
    expect(atMinTitle.response.status()).toBe(201);

    // Only the two records at the limits exist under the test's name; the rejected ones were not stored.
    const stored = await authorApi.client.get('/api/articles', {
      params: { status: 'draft', search: nameFor() },
    });
    expect(stored.status()).toBe(200);
    const byNumber = (a: number, b: number) => a - b;
    expect((idsOf(listItems(await stored.json())) as number[]).sort(byNumber)).toEqual(
      ([atMaxTitle.id, atMinTitle.id] as number[]).sort(byNumber),
    );
  });

  test('TC-API-028 a guest cannot create an article', async ({
    authorApi,
    guestApi,
    nameFor,
    ownedArticles,
  }) => {
    // A valid body: the schema runs before the login check, so an incomplete body would get 400.
    const attempt = await test.step(`guest tries to create article "${nameFor()}"`, () =>
      envGuard(() =>
        ownedArticles.createAs(guestApi, { title: nameFor(), body: `${nameFor()} guest body` }),
      ));

    expect(attempt.response.status()).toBe(401);
    expect((await attempt.response.json()).error).toBe('unauthorized');
    const stored = await authorApi.client.get('/api/articles', {
      params: { status: 'draft', search: nameFor() },
    });
    expect(stored.status()).toBe(200);
    expect(listItems(await stored.json())).toHaveLength(0);
  });

  test("TC-API-029 the owner's title update persists and leaves the body and status unchanged", async ({
    authorApi,
    nameFor,
    ownedArticles,
  }) => {
    const id = await test.step(`create own article "${nameFor('before')}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({ title: nameFor('before'), body: `${nameFor()} unchanged body` }),
      ));

    const updated = await test.step(`update the title of own article ${id}`, () =>
      envGuard(() => updateArticle(authorApi.client, id, { title: nameFor('after') })));

    expect(updated.status()).toBe(200);
    expect(await updated.json()).toHaveProperty('article');
    const response = await authorApi.client.get(`/api/articles/${id}`);
    expect(response.status()).toBe(200);
    const article = readEntity(await response.json());
    expect(article.title).toBe(nameFor('after'));
    expect(article.body).toBe(`${nameFor()} unchanged body`);
    expect(article.status).toBe('draft');
  });

  test("TC-API-030 another author can neither update nor delete the owner's article", async ({
    authorApi,
    nameFor,
    otherAuthorApi,
    ownedArticles,
  }) => {
    expect(otherAuthorApi.userId, 'the other author is a different user').not.toBe(
      authorApi.userId,
    );

    const id = await test.step(`create own article "${nameFor()}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({ title: nameFor(), body: `${nameFor()} owner body` }),
      ));

    const otherUpdate = await test.step(`other author tries to update own article ${id}`, () =>
      envGuard(() => updateArticle(otherAuthorApi.client, id, { title: nameFor('other') })));

    const otherDelete = await test.step(`other author tries to delete own article ${id}`, () =>
      envGuard(() => deleteArticle(otherAuthorApi.client, id)));

    expect(otherUpdate.status()).toBe(403);
    const updateBody = await otherUpdate.json();
    expect(updateBody.error).toBe('forbidden');
    expect(updateBody.message).toBe('You can only edit your own articles.');
    expect(otherDelete.status()).toBe(403);
    const deleteBody = await otherDelete.json();
    expect(deleteBody.error).toBe('forbidden');
    expect(deleteBody.message).toBe('You can only delete your own articles.');
    const response = await authorApi.client.get(`/api/articles/${id}`);
    expect(response.status()).toBe(200);
    const article = readEntity(await response.json());
    expect(article.title).toBe(nameFor());
    expect(article.body).toBe(`${nameFor()} owner body`);
  });

  test('TC-API-032 after the owner deletes an article, reading it returns 404', async ({
    authorApi,
    nameFor,
    ownedArticles,
  }) => {
    const id = await test.step(`create own article "${nameFor()}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({ title: nameFor(), body: `${nameFor()} to be deleted` }),
      ));

    const deleted = await test.step(`delete own article ${id}`, () =>
      envGuard(() => deleteArticle(authorApi.client, id)));

    expect(deleted.status()).toBe(200);
    expect(await deleted.json()).toEqual({ status: 'deleted', id });
    const response = await authorApi.client.get(`/api/articles/${id}`);
    expect(response.status()).toBe(404);
    expect((await response.json()).error).toBe('not_found');
  });

  test('TC-API-084 a guest can neither update nor delete an article', async ({
    authorApi,
    guestApi,
    nameFor,
    ownedArticles,
  }) => {
    const id = await test.step(`create own article "${nameFor()}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({ title: nameFor(), body: `${nameFor()} owner body` }),
      ));

    const guestUpdate = await test.step(`guest tries to update own article ${id}`, () =>
      envGuard(() => updateArticle(guestApi, id, { title: nameFor('guest') })));

    const guestDelete = await test.step(`guest tries to delete own article ${id}`, () =>
      envGuard(() => deleteArticle(guestApi, id)));

    expect(guestUpdate.status()).toBe(401);
    expect((await guestUpdate.json()).error).toBe('unauthorized');
    expect(guestDelete.status()).toBe(401);
    expect((await guestDelete.json()).error).toBe('unauthorized');
    const response = await authorApi.client.get(`/api/articles/${id}`);
    expect(response.status()).toBe(200);
    const article = readEntity(await response.json());
    expect(article.title).toBe(nameFor());
    expect(article.body).toBe(`${nameFor()} owner body`);
  });

  test("TC-API-031 an admin updates and then deletes another author's article", async ({
    adminApi,
    authorApi,
    nameFor,
    ownedArticles,
  }) => {
    // AUTHOR owns the article; teardown still runs as AUTHOR and accepts the 404 after the admin delete.
    expect(adminApi.userId, 'admin and author are different users').not.toBe(authorApi.userId);

    const id = await test.step(`create own article "${nameFor('before')}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({ title: nameFor('before'), body: `${nameFor()} admin body` }),
      ));

    const updated = await test.step(`admin updates the title of own article ${id}`, () =>
      envGuard(() => updateArticle(adminApi.client, id, { title: nameFor('admin') })));

    expect(updated.status()).toBe(200);
    const afterUpdate = await authorApi.client.get(`/api/articles/${id}`);
    expect(afterUpdate.status()).toBe(200);
    const article = readEntity(await afterUpdate.json());
    expect(article.title).toBe(nameFor('admin'));
    expect(article.body).toBe(`${nameFor()} admin body`);

    const deleted = await test.step(`admin deletes own article ${id}`, () =>
      envGuard(() => deleteArticle(adminApi.client, id)));

    expect(deleted.status()).toBe(200);
    const afterDelete = await authorApi.client.get(`/api/articles/${id}`);
    expect(afterDelete.status()).toBe(404);
  });
});
