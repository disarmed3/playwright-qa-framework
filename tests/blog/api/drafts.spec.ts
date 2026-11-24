import { expect } from '@playwright/test';
import { envGuard } from '../../../env/envGuard';
import { runIfEnv } from '../../../env/runIfEnv';
import { authorIdOf, idsOf, listItems, readEntity, SEEDED_DRAFT_ID, test } from '../../support/api';

// Each test owns one draft and one published article whose titles share the test's unique name, so
// a search for that name returns only this test's records and exact lists are safe (rule 10).
// TC-API-070 and 071 only read the seeded draft and pin today's behaviour; neither is a requirement
// or accepted as correct (mentor 2026-11-02). Seeded articles are never changed.

test.describe('blog API draft visibility (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test("TC-API-020 the guest article list shows the owner's published article and hides their draft", async ({
    guestApi,
    nameFor,
    ownedArticles,
  }) => {
    const draftId = await test.step(`create own draft "${nameFor('d')}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({ title: nameFor('d'), body: `${nameFor()} draft body` }),
      ));

    const publishedId = await test.step(`create own published article "${nameFor('p')}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({
          title: nameFor('p'),
          body: `${nameFor()} published body`,
          status: 'published',
        }),
      ));

    const response = await guestApi.get('/api/articles', { params: { search: nameFor() } });
    expect(response.status()).toBe(200);
    const items = listItems(await response.json());
    expect(idsOf(items)).toEqual([publishedId]);
    expect(idsOf(items)).not.toContain(draftId);
    expect(items.map((item) => item.status)).toEqual(['published']);
  });

  test('TC-API-021 a guest asking for status=draft still gets published articles only', async ({
    guestApi,
    nameFor,
    ownedArticles,
  }) => {
    const draftId = await test.step(`create own draft "${nameFor('d')}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({ title: nameFor('d'), body: `${nameFor()} draft body` }),
      ));

    const publishedId = await test.step(`create own published article "${nameFor('p')}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({
          title: nameFor('p'),
          body: `${nameFor()} published body`,
          status: 'published',
        }),
      ));

    const response = await guestApi.get('/api/articles', {
      params: { status: 'draft', search: nameFor() },
    });
    expect(response.status()).toBe(200);
    const items = listItems(await response.json());
    expect(idsOf(items)).toEqual([publishedId]);
    expect(idsOf(items)).not.toContain(draftId);
    expect(items.map((item) => item.status)).toEqual(['published']);
  });

  test("TC-API-022 the author's draft listing includes their own draft", async ({
    authorApi,
    nameFor,
    ownedArticles,
  }) => {
    const draftId = await test.step(`create own draft "${nameFor('d')}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({ title: nameFor('d'), body: `${nameFor()} draft body` }),
      ));

    const response = await authorApi.client.get('/api/articles', {
      params: { status: 'draft', search: nameFor() },
    });
    expect(response.status()).toBe(200);
    expect(idsOf(listItems(await response.json()))).toContain(draftId);
  });

  test('TC-API-070 a guest gets the seeded draft by id while the public list hides it (pins current behaviour)', async ({
    guestApi,
  }) => {
    // Suspected defect (SCRUM-141): recorded as a finding, not as correct behaviour.
    const byId = await guestApi.get(`/api/articles/${SEEDED_DRAFT_ID}`);
    expect(byId.status()).toBe(200);
    const draft = readEntity(await byId.json());
    expect(draft.id).toBe(SEEDED_DRAFT_ID);
    expect(draft.status).toBe('draft');

    const listed = await guestApi.get('/api/articles', {
      params: { search: draft.title as string },
    });
    expect(listed.status()).toBe(200);
    expect(idsOf(listItems(await listed.json()))).not.toContain(SEEDED_DRAFT_ID);
  });

  test("TC-API-071 a signed-in author's draft listing includes another author's seeded draft (pins current behaviour)", async ({
    authorApi,
    otherAuthorApi,
  }) => {
    // Open question (SCRUM-142): the API shows every author's drafts, the dashboard only one's own.
    const byId = await authorApi.client.get(`/api/articles/${SEEDED_DRAFT_ID}`);
    expect(byId.status()).toBe(200);
    const draft = readEntity(await byId.json());
    expect(draft.status).toBe('draft');
    const ownerId = authorIdOf(draft);
    expect(Number.isInteger(ownerId), 'the seeded draft names its author').toBe(true);

    // Whichever signed-in author does not own it is "another author".
    const viewer = [authorApi, otherAuthorApi].find((session) => session.userId !== ownerId);
    expect(viewer, 'one of the two authors does not own the seeded draft').toBeDefined();
    const listed = await viewer!.client.get('/api/articles', {
      params: { status: 'draft', search: draft.title as string },
    });
    expect(listed.status()).toBe(200);
    expect(idsOf(listItems(await listed.json()))).toContain(SEEDED_DRAFT_ID);
  });
});
