---
id: product-blog-api
type: source
---

# Blog API: accounts, drafts, statuses and limits

Product facts about the blog API on dev, as confirmed by the site's maintainers on 2026-11-02 (dev checks
of 2026-10-31 with reads and refused requests only; success cases on a local copy of the app with the same
code). Account values are never written here; they live only in the environment
([tests/support/users.ts](../../../tests/support/users.ts)). Open questions they answer are in the
[Blog API catalog](../test-catalog/blog-api.md).

## Accounts and roles

- Three teaching accounts exist: the author (`AUTHOR`), an admin (`ADMIN`) and a second author
  (`OTHER_AUTHOR`). They are training fixtures for dev only, not personal accounts.
- Seeded articles (ids 1 to 7) are never changed or deleted. A test deletes only rows it created.
- On a test-owned article: the author creates and updates it; the other author's update and delete get 403
  and leave it unchanged; the admin may update it; the author deletes it, and a later GET is 404. The admin
  delete uses a second article of the author's own.
- A guest gets 401 on all of these, not 403.
- 403 messages (app text, assertable): "You can only edit your own articles." / "You can only delete your
  own articles." / "You cannot delete this comment."
- Comments: the admin or the article's owner may delete; another author gets 403; a guest gets 401.

## Drafts: two observed behaviours, not accepted as correct

- A guest gets 200 for a draft by id, while the anonymous list hides it.
- With `?status=draft`, an author also sees other authors' drafts in the API; the dashboard shows only
  their own.
- Tests pin this current behaviour read-only on the seeded draft (article 7), with "pins current behaviour"
  in the title (TC-API-070 checks both halves). TC-API-070 is filed as a suspected defect (SCRUM-163),
  TC-API-071 as an open question (SCRUM-164).

## Statuses and shapes

- List envelope: `items, page, pageSize, total, totalPages`. `totalPages` is never 0 (empty: total 0,
  totalPages 1). A page past the last is 200 with empty `items`.
- Create 201 with `{article}` or `{comment}`; PATCH 200 `{article}`; DELETE 200 `{status: "deleted", id}`.
- Refusals: 401 `unauthorized`, 401 `invalid_credentials` (login), 403 `forbidden`, 404 `not_found`.
- Error shapes: schema 400 `{statusCode, code: "FST_ERR_VALIDATION", error, message}`; app rules 422
  `{error: "validation_error", messages: [...]}`; other app refusals `{error, message}`. The framework's
  404 for a wrong URL has no `not_found`. Assert the status plus `error` or `code`; never deep-equal a body;
  never assert a 400 message text. A sure 400: a missing field, `pageSize=51`, `status=archived`,
  `delay=abc`.
- The schema runs before the login check: no token plus an incomplete body is 400, so the no-token case
  (TC-API-028) sends a valid body.

## `/me` and login

- An empty Bearer counts as missing: 401 `unauthorized` ("Bearer ", "Bearer" and an empty value behave the
  same).
- The `qa_session` cookie is a fallback after a missing, empty or bad Bearer; run such tests in a request
  context that has not logged in.
- An unknown email and a wrong password return the same body: `invalid_credentials`, "Email or password is
  incorrect."
- The login cookie's https flags are testable; the http half is not, on these targets.

## Limits

- `delay` on `GET /api/articles`, `GET /api/articles/:id/comments`, `GET /api/products` and
  `POST /api/checkout/:orderId/pay`: capped at 8000 ms (above the cap, the normal response after about
  8 s); negative or 0 means no delay; a non-integer (1.5, abc) is 400. Other endpoints ignore it.
- Article, after trimming: title 4 to 140 ("Title must be at least 4 characters." / "Title must be 140
  characters or fewer."); body at least 20, no maximum ("Body must be at least 20 characters.").
- Comment: name and body trimmed, email not. Name at least 2 ("Name must be at least 2 characters.");
  body 3 to 1000 ("Comment must be at least 3 characters." / "Comment must be 1000 characters or fewer.");
  email optional, must look like a@b.c, and surrounding spaces fail ("Email address is not valid.").
- All of these are 422, with several failures together in the array. A missing required field is 400; an
  empty string counts as present (422).

## Logout

- Logout only clears the cookie; there is no revocation. The old token still works on `/me`; tokens last
  8 hours. Logout does not touch other sessions, so the session test uses a real logout, checked in the
  same browser context, and never asserts that the old token is refused.

## Other behaviour

- No lockout or rate limit on the shared account (6 wrong passwords in a row, then a correct login worked).
- After a failed login, the email appears in the redirect URL (filed as a low-priority bug, SCRUM-165).
- Pagination is exact on test-owned data: published own articles with a marker in the title and
  `search=<marker>` give total 3 and totalPages 2.
- Category filter: a wrong slug is 200 with total 0; assert at least one item before checking each item's
  category.
- Database: no read-only role and no disposable database exist, so refused writes stay privilege
  inspection, labelled "not verified" (rule 40).

## Catalog numbering

- TC-API-040 to 043 are the comment cases; categories get new IDs. TC-API-050 to 054 describe the same
  comment behaviours under another numbering; they are covered by 040 to 043 and 072 and not built twice.
- Article cases: 026 create (201); 027 validation; 028 no token (401); 029 PATCH your own; 030 other author
  PATCH and DELETE (403); 031 admin PATCH and DELETE; 032 DELETE your own, then 404.
