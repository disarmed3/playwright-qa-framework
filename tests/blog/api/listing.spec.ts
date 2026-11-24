import { expect } from '@playwright/test';
import { envGuard } from '../../../env/envGuard';
import { runIfEnv } from '../../../env/runIfEnv';
import {
  DELAY_MS,
  DELAYED_REQUEST_TIMEOUT_MS,
  deleteArticle,
  idsOf,
  listItems,
  searchWord,
  test,
  timed,
} from '../../support/api';

test.describe('blog API article listing (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test('TC-API-023 out-of-range page and pageSize values are rejected and pageSize=50 is accepted', async ({
    guestApi,
  }) => {
    // Bounds from the contract: page minimum 1, pageSize 1 to 50. A schema failure is 400
    // FST_ERR_VALIDATION with a message (mentor 2026-11-02); the message text is not asserted.
    const outOfRange: Record<string, number>[] = [{ page: 0 }, { pageSize: 0 }, { pageSize: 51 }];
    for (const params of outOfRange) {
      const response = await guestApi.get('/api/articles', { params });
      const label = JSON.stringify(params);
      expect(response.status(), label).toBe(400);
      const body = await response.json();
      expect(body.code, label).toBe('FST_ERR_VALIDATION');
      expect(typeof body.message, label).toBe('string');
    }
    const largest = await guestApi.get('/api/articles', { params: { pageSize: 50 } });
    expect(largest.status()).toBe(200);
    expect(listItems(await largest.json()).length).toBeLessThanOrEqual(50);
  });

  test('TC-API-080 reading an article id that no longer exists returns 404', async ({
    authorApi,
    guestApi,
    nameFor,
    ownedArticles,
  }) => {
    // The missing id comes from an own article deleted here, never from a guessed number.
    const id = await test.step(`create own article "${nameFor()}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({ title: nameFor(), body: `${nameFor()} to be deleted` }),
      ));

    const deleted = await test.step(`delete own article ${id}`, () =>
      envGuard(() => deleteArticle(authorApi.client, id)));

    expect(deleted.ok()).toBe(true);
    const response = await guestApi.get(`/api/articles/${id}`);
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('not_found');
    expect(body).not.toHaveProperty('id');
  });

  test('TC-API-024 search finds an article by a title word or a body word in any letter case', async ({
    guestApi,
    nameFor,
    ownedArticles,
  }) => {
    // The dashed owned name appears only in the title; the body word (letters and digits only)
    // appears only in the body. The title stays at the owned name's length (Q7, Batch 4 note).
    const bodyWord = searchWord(nameFor(), 'b');

    const id = await test.step(`create own published article "${nameFor()}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({
          title: nameFor(),
          body: `searchable body ${bodyWord}`,
          status: 'published',
        }),
      ));

    for (const [field, word] of [
      ['title', nameFor()],
      ['body', bodyWord],
    ]) {
      const response = await guestApi.get('/api/articles', {
        params: { search: word.toUpperCase() },
      });
      expect(response.status()).toBe(200);
      expect(idsOf(listItems(await response.json())), field).toEqual([id]);
    }
  });

  test('TC-API-033 the delay parameter holds the article list for at least the delay and keeps its shape', async ({
    guestApi,
  }) => {
    const plain = await guestApi.get('/api/articles', { params: { pageSize: 1 } });
    expect(plain.status()).toBe(200);
    const { result: delayed, ms } = await timed(() =>
      guestApi.get('/api/articles', {
        params: { pageSize: 1, delay: DELAY_MS },
        timeout: DELAYED_REQUEST_TIMEOUT_MS,
      }),
    );
    expect(delayed.status()).toBe(200);
    expect(ms).toBeGreaterThanOrEqual(DELAY_MS);
    expect(Object.keys(await delayed.json()).sort()).toEqual(
      Object.keys(await plain.json()).sort(),
    );

    // Cap 8000 ms (mentor 2026-11-02): a longer request answers after about 8 s, well before the
    // 20 s asked for; the request timeout turns a missing cap into a failure.
    const { result: capped, ms: cappedMs } = await timed(() =>
      guestApi.get('/api/articles', {
        params: { pageSize: 1, delay: 20_000 },
        timeout: DELAYED_REQUEST_TIMEOUT_MS,
      }),
    );
    expect(capped.status()).toBe(200);
    expect(cappedMs).toBeGreaterThanOrEqual(8_000);
    expect(cappedMs).toBeLessThan(DELAYED_REQUEST_TIMEOUT_MS);

    const invalid = await guestApi.get('/api/articles', { params: { delay: 'abc' } });
    expect(invalid.status()).toBe(400);
    expect((await invalid.json()).code).toBe('FST_ERR_VALIDATION');
  });

  test('TC-API-082 the delay parameter changes timing only, not which articles are returned', async ({
    guestApi,
    nameFor,
    ownedArticles,
  }) => {
    for (const suffix of ['a', 'b']) {
      await test.step(`create own published article "${nameFor(suffix)}"`, () =>
        envGuard(() =>
          ownedArticles.createOwn({
            title: nameFor(suffix),
            body: `${nameFor()} body`,
            status: 'published',
          }),
        ));
    }
    const plain = await guestApi.get('/api/articles', { params: { search: nameFor() } });
    const delayed = await guestApi.get('/api/articles', {
      params: { search: nameFor(), delay: DELAY_MS },
      timeout: DELAYED_REQUEST_TIMEOUT_MS,
    });
    expect(plain.status()).toBe(200);
    expect(delayed.status()).toBe(200);
    const plainIds = idsOf(listItems(await plain.json()));
    expect(plainIds).toHaveLength(2);
    expect(idsOf(listItems(await delayed.json()))).toEqual(plainIds);
  });

  test("TC-API-025 the category filter returns an article under its own category's slug and not under another's", async ({
    guestApi,
    nameFor,
    ownedArticles,
  }) => {
    // Two existing categories are read at run time, so no seed slug is needed (Q9). The category
    // list's shape is not in the contract (Q4): each usable entry needs an integer id and a slug.
    const listed = await guestApi.get('/api/categories');
    expect(listed.status()).toBe(200);
    const categories = listItems(await listed.json()).filter(
      (category) =>
        Number.isInteger(category.id) && typeof category.slug === 'string' && category.slug !== '',
    );
    expect(categories.length, 'categories with an integer id and a slug').toBeGreaterThanOrEqual(2);
    const [chosen, other] = categories;

    const id =
      await test.step(`create own published article "${nameFor()}" in category ${chosen.id}`, () =>
        envGuard(() =>
          ownedArticles.createOwn({
            title: nameFor(),
            body: `${nameFor()} categorised body`,
            status: 'published',
            category_id: chosen.id as number,
          }),
        ));

    const inCategory = await guestApi.get('/api/articles', {
      params: { category: chosen.slug as string, search: nameFor() },
    });
    expect(inCategory.status()).toBe(200);
    expect(idsOf(listItems(await inCategory.json()))).toEqual([id]);
    const inOther = await guestApi.get('/api/articles', {
      params: { category: other.slug as string, search: nameFor() },
    });
    expect(inOther.status()).toBe(200);
    expect(listItems(await inOther.json())).toHaveLength(0);

    // A slug that does not exist is not an error: 200 with total 0 (mentor 2026-11-02).
    const unknown = await guestApi.get('/api/articles', {
      params: { category: nameFor(), search: nameFor() },
    });
    expect(unknown.status()).toBe(200);
    expect((await unknown.json()).total).toBe(0);
  });

  test('TC-API-081 page and pageSize split the matching articles into pages without repeats or gaps', async ({
    guestApi,
    nameFor,
    ownedArticles,
  }) => {
    // Three own published articles share the test's name, so the search returns only them and the
    // envelope's total and totalPages are exact (mentor 2026-11-02). A page past the last is 200, empty.
    const created: number[] = [];
    for (const suffix of ['a', 'b', 'c']) {
      created.push(
        await test.step(`create own published article "${nameFor(suffix)}"`, () =>
          envGuard(() =>
            ownedArticles.createOwn({
              title: nameFor(suffix),
              body: `${nameFor()} paged body`,
              status: 'published',
            }),
          )),
      );
    }

    const pages: unknown[][] = [];
    for (const page of [1, 2, 3]) {
      const response = await guestApi.get('/api/articles', {
        params: { search: nameFor(), pageSize: 2, page },
      });
      expect(response.status(), `page ${page}`).toBe(200);
      const body = await response.json();
      expect(body.total, `page ${page} total`).toBe(3);
      expect(body.totalPages, `page ${page} totalPages`).toBe(2);
      pages.push(idsOf(listItems(body)));
    }
    expect(pages[0], 'page 1').toHaveLength(2);
    expect(pages[1], 'page 2').toHaveLength(1);
    expect(pages[2], 'page 3, past the last').toHaveLength(0);
    const byNumber = (a: number, b: number) => a - b;
    expect(([...pages[0], ...pages[1]] as number[]).sort(byNumber)).toEqual(
      [...created].sort(byNumber),
    );
  });
});
