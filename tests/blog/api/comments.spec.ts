import { expect } from '@playwright/test';
import { envGuard } from '../../../env/envGuard';
import { runIfEnv } from '../../../env/runIfEnv';
import {
  DELAY_MS,
  DELAYED_REQUEST_TIMEOUT_MS,
  deleteArticle,
  deleteComment,
  idsOf,
  listItems,
  postComment,
  readCreatedId,
  test,
  timed,
} from '../../support/api';

// Comments go only on the test's own published article. Deleting that article in fixture teardown
// removes its comments (DB: comments.article_id ON DELETE CASCADE). OTHER_AUTHOR only makes
// refused requests (TC-API-072); limits and messages: mentor 2026-11-02.

test.describe('blog API comments (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test("TC-API-040 an article's comment list returns 200 and a missing article returns 404", async ({
    authorApi,
    guestApi,
    nameFor,
    ownedArticles,
  }) => {
    const articleId = await test.step(`create own published article "${nameFor('a')}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({
          title: nameFor('a'),
          body: `${nameFor()} body`,
          status: 'published',
        }),
      ));

    const missingId = await test.step(`create own article "${nameFor('gone')}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({ title: nameFor('gone'), body: `${nameFor()} to be deleted` }),
      ));

    await test.step(`delete own article ${missingId}`, () =>
      envGuard(() => deleteArticle(authorApi.client, missingId)));

    const list = await guestApi.get(`/api/articles/${articleId}/comments`);
    expect(list.status()).toBe(200);
    expect(listItems(await list.json())).toHaveLength(0);
    const missing = await guestApi.get(`/api/articles/${missingId}/comments`);
    expect(missing.status()).toBe(404);
  });

  test('TC-API-041 a guest posts a comment without auth, gets 201 and sees it listed', async ({
    guestApi,
    nameFor,
    ownedArticles,
  }) => {
    const articleId = await test.step(`create own published article "${nameFor()}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({
          title: nameFor(),
          body: `${nameFor()} body`,
          status: 'published',
        }),
      ));

    const posted =
      await test.step(`guest posts comment "${nameFor('c')}" on own article ${articleId}`, () =>
        envGuard(() =>
          postComment(guestApi, articleId, {
            author_name: nameFor('c'),
            body: `${nameFor('c')} comment body`,
          }),
        ));

    // 201 with a {comment} wrapper (mentor 2026-11-02; the contract's 200 is a generic default).
    expect(posted.status()).toBe(201);
    const postedBody = await posted.json();
    expect(postedBody).toHaveProperty('comment');
    const commentId = readCreatedId(postedBody);
    const list = await guestApi.get(`/api/articles/${articleId}/comments`);
    expect(list.status()).toBe(200);
    expect(idsOf(listItems(await list.json()))).toContain(commentId);
  });

  test('TC-API-042 the comments delay parameter holds the response for at least the delay', async ({
    guestApi,
    nameFor,
    ownedArticles,
  }) => {
    const articleId = await test.step(`create own published article "${nameFor()}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({
          title: nameFor(),
          body: `${nameFor()} body`,
          status: 'published',
        }),
      ));

    const { result: delayed, ms } = await timed(() =>
      guestApi.get(`/api/articles/${articleId}/comments`, {
        params: { delay: DELAY_MS },
        timeout: DELAYED_REQUEST_TIMEOUT_MS,
      }),
    );
    expect(delayed.status()).toBe(200);
    expect(ms).toBeGreaterThanOrEqual(DELAY_MS);
    expect(listItems(await delayed.json())).toHaveLength(0);
  });

  test('TC-API-043 comment validation rejects missing fields with 400 and a short name, short or over-long body or malformed email with 422, storing nothing', async ({
    guestApi,
    nameFor,
    ownedArticles,
  }) => {
    const articleId = await test.step(`create own published article "${nameFor()}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({
          title: nameFor(),
          body: `${nameFor()} body`,
          status: 'published',
        }),
      ));

    const withoutName =
      await test.step(`guest tries a comment without author_name on own article ${articleId}`, () =>
        envGuard(() => postComment(guestApi, articleId, { body: `${nameFor('c')} comment body` })));

    const withoutBody =
      await test.step(`guest tries a comment without body on own article ${articleId}`, () =>
        envGuard(() => postComment(guestApi, articleId, { author_name: nameFor('c') })));

    // Limits after trimming name and body (email is not trimmed): name at least 2, body 3 to 1000,
    // email like a@b.c. Mentor 2026-11-02.
    const shortName =
      await test.step(`guest tries a comment with a 1-character name and a 2-character body on own article ${articleId}`, () =>
        envGuard(() => postComment(guestApi, articleId, { author_name: 'q', body: 'ab' })));

    const longBody =
      await test.step(`guest tries a comment with a 1001-character body on own article ${articleId}`, () =>
        envGuard(() =>
          postComment(guestApi, articleId, {
            author_name: nameFor('c'),
            body: 'b'.repeat(1001),
          }),
        ));

    const badEmail =
      await test.step(`guest tries a comment with a malformed email on own article ${articleId}`, () =>
        envGuard(() =>
          postComment(guestApi, articleId, {
            author_name: nameFor('c'),
            body: `${nameFor('c')} comment body`,
            author_email: 'not-an-email',
          }),
        ));

    for (const attempt of [withoutName, withoutBody]) {
      expect(attempt.status()).toBe(400);
      expect((await attempt.json()).code).toBe('FST_ERR_VALIDATION');
    }
    const expected422: [typeof shortName, string[]][] = [
      [
        shortName,
        ['Name must be at least 2 characters.', 'Comment must be at least 3 characters.'],
      ],
      [longBody, ['Comment must be 1000 characters or fewer.']],
      [badEmail, ['Email address is not valid.']],
    ];
    for (const [attempt, messages] of expected422) {
      expect(attempt.status()).toBe(422);
      const body = await attempt.json();
      expect(body.error).toBe('validation_error');
      expect(body.messages).toEqual(expect.arrayContaining(messages));
    }
    const list = await guestApi.get(`/api/articles/${articleId}/comments`);
    expect(list.status()).toBe(200);
    expect(listItems(await list.json())).toHaveLength(0);
  });

  test("TC-API-072 deleting a comment is authorized by the article's author", async ({
    authorApi,
    guestApi,
    nameFor,
    otherAuthorApi,
    ownedArticles,
  }) => {
    const articleId = await test.step(`create own published article "${nameFor()}"`, () =>
      envGuard(() =>
        ownedArticles.createOwn({
          title: nameFor(),
          body: `${nameFor()} body`,
          status: 'published',
        }),
      ));

    const posted =
      await test.step(`guest posts comment "${nameFor('c')}" on own article ${articleId}`, () =>
        envGuard(() =>
          postComment(guestApi, articleId, {
            author_name: nameFor('c'),
            body: `${nameFor('c')} comment body`,
          }),
        ));

    expect(posted.ok()).toBe(true);
    const commentId = readCreatedId(await posted.json());

    const guestDelete = await test.step(`guest tries to delete comment ${commentId}`, () =>
      envGuard(() => deleteComment(guestApi, commentId)));

    expect(guestDelete.status()).toBe(401);
    expect((await guestDelete.json()).error).toBe('unauthorized');
    const afterGuest = await guestApi.get(`/api/articles/${articleId}/comments`);
    expect(idsOf(listItems(await afterGuest.json()))).toContain(commentId);

    const otherDelete = await test.step(`other author tries to delete comment ${commentId}`, () =>
      envGuard(() => deleteComment(otherAuthorApi.client, commentId)));

    expect(otherDelete.status()).toBe(403);
    const otherBody = await otherDelete.json();
    expect(otherBody.error).toBe('forbidden');
    expect(otherBody.message).toBe('You cannot delete this comment.');
    const afterOther = await guestApi.get(`/api/articles/${articleId}/comments`);
    expect(idsOf(listItems(await afterOther.json()))).toContain(commentId);

    const authorDelete =
      await test.step(`delete comment ${commentId} as the article's author`, () =>
        envGuard(() => deleteComment(authorApi.client, commentId)));

    expect(authorDelete.status()).toBe(200);
    const afterAuthor = await guestApi.get(`/api/articles/${articleId}/comments`);
    expect(idsOf(listItems(await afterAuthor.json()))).not.toContain(commentId);
  });
});
