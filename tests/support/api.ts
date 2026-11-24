// Blog API helpers and fixtures (Week 3 Task 05). Routes, request fields and query parameters come
// from the dev OpenAPI read 2026-10-28 (SHA-256 in vault/sources/test-catalog/blog-api.md). Statuses
// and response shapes the contract does not document (Q4) are asserted by the specs, not assumed
// here: readEntity and listItems only locate a record or a list and fail with key names.
// Every write starts inside envGuard(() => …). No helper logs or returns a token or account value.
// Plain Node loads this file too (safety probes): local imports carry .ts, TypeScript is erasable only.
import {
  test as base,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from '@playwright/test';
import { envGuard } from '../../env/envGuard.ts';
import { baseURL } from './env.ts';
import { ADMIN, AUTHOR, OTHER_AUTHOR, type TestUser } from './users.ts';

/** The request methods the helpers call; a dummy object with these four fits it. */
export type ApiClient = Pick<APIRequestContext, 'get' | 'post' | 'patch' | 'delete'>;

/** Article fields from the contract's create and update bodies that the specs use. */
export interface ArticleFields {
  title?: string;
  body?: string;
  excerpt?: string;
  category_id?: number;
  status?: 'draft' | 'published';
}

/** Comment fields from the contract's comment body. */
export interface CommentFields {
  author_name?: string;
  author_email?: string;
  body?: string;
}

type Json = Record<string, unknown>;

export function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True for null or a string (the contract's `bio`). */
export function isNullOrString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

const keysOf = (value: unknown) => (isRecord(value) ? Object.keys(value).join(', ') : typeof value);

// ---------------------------------------------------------------------------------------------
// Run id and owned names (rule 20)

const RUN_ID = /^\d{8}T\d{6}Z-[0-9a-f]{6}$/;

/** The run id playwright.config.ts sets once per run; refuses a missing or malformed value. */
export function runIdFrom(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.QA_RUN_ID;
  if (value === undefined || !RUN_ID.test(value)) {
    throw new Error(
      'QA_RUN_ID is missing or malformed; playwright.config.ts sets it once per run.',
    );
  }
  return value;
}

/** `qa-auto-<runId>-<testId>`, with `-<suffix>` when one test owns several records. */
export function ownedName(runId: string, testId: string, suffix?: string): string {
  const name = `qa-auto-${runId}-${testId}`;
  return suffix === undefined ? name : `${name}-${suffix}`;
}

// ---------------------------------------------------------------------------------------------
// Requests. Writes are guarded here as well as in the specs' steps, so no caller can skip the guard.

export function login(client: ApiClient, user: TestUser): Promise<APIResponse> {
  return client.post('/api/auth/login', { data: { email: user.email, password: user.password } });
}

// ---------------------------------------------------------------------------------------------
// Signed-in sessions for browser contexts

/** The login cookie's name, from the live sample (TC-API-015; the OAS does not name it). */
export const SESSION_COOKIE = 'qa_session';

export type StorageState = Awaited<ReturnType<APIRequestContext['storageState']>>;

export interface AuthState {
  storageState: StorageState;
  userId: number;
}

/**
 * Logs `user` in through `request` and returns that context's storage state and the user id. The
 * session cookie is checked against the resolved target (host, https) and the login contract
 * (TC-API-015); a failure names only the cookie and the failed checks, never a value.
 */
export async function readSession(
  request: APIRequestContext,
  user: TestUser,
  role: 'author' | 'admin',
): Promise<AuthState> {
  const response = await login(request, user);
  const body: unknown = response.status() === 200 ? await response.json() : undefined;
  const loginUser = isRecord(body) && isRecord(body.user) ? body.user : undefined;
  const userId = loginUser?.id;
  if (typeof userId !== 'number' || !Number.isInteger(userId) || loginUser?.role !== role) {
    throw new Error(
      `${role} session: login failed or returned another role (status ${response.status()})`,
    );
  }

  const storageState = await request.storageState();
  const { hostname, protocol } = new URL(baseURL);
  const session = storageState.cookies.find((cookie) => cookie.name === SESSION_COOKIE);
  const checks: Record<string, boolean> = {
    present: session !== undefined,
    domain: session?.domain === hostname || session?.domain === `.${hostname}`,
    secure: session?.secure === (protocol === 'https:'),
    httpOnly: session?.httpOnly === true,
    sameSite: session?.sameSite === 'Lax',
  };
  const failed = Object.keys(checks).filter((name) => !checks[name]);
  if (failed.length > 0) {
    throw new Error(`${role} session: cookie ${SESSION_COOKIE} failed: ${failed.join(', ')}`);
  }
  return { storageState, userId };
}

export function createArticle(client: ApiClient, data: ArticleFields): Promise<APIResponse> {
  return envGuard(() => client.post('/api/articles', { data }));
}

export function updateArticle(
  client: ApiClient,
  id: number,
  data: ArticleFields,
): Promise<APIResponse> {
  return envGuard(() => client.patch(`/api/articles/${id}`, { data }));
}

export function deleteArticle(client: ApiClient, id: number): Promise<APIResponse> {
  return envGuard(() => client.delete(`/api/articles/${id}`));
}

export function postComment(
  client: ApiClient,
  articleId: number,
  data: CommentFields,
): Promise<APIResponse> {
  return envGuard(() => client.post(`/api/articles/${articleId}/comments`, { data }));
}

export function deleteComment(client: ApiClient, id: number): Promise<APIResponse> {
  return envGuard(() => client.delete(`/api/comments/${id}`));
}

// ---------------------------------------------------------------------------------------------
// Response reading

/** The body when it has an integer id, else its one nested record that has one (wrapper, Q4). */
export function readEntity(body: unknown): Json {
  if (isRecord(body)) {
    if (Number.isInteger(body.id)) return body;
    const nested = Object.values(body).filter(
      (value): value is Json => isRecord(value) && Number.isInteger(value.id),
    );
    if (nested.length === 1) return nested[0];
  }
  throw new Error(`no record with an integer id in the response (keys: ${keysOf(body)})`);
}

export function readCreatedId(body: unknown): number {
  return readEntity(body).id as number;
}

/** The seeded draft (article 7), named by the tickets and the mentor (2026-11-02); read only, never changed. */
export const SEEDED_DRAFT_ID = 7;

/** An article's author id from `author_id` or a nested `author` record; undefined if it has neither. */
export function authorIdOf(article: Json): unknown {
  if (Number.isInteger(article.author_id)) return article.author_id;
  return isRecord(article.author) ? article.author.id : undefined;
}

/** The body when it is an array, else the one array-valued key of its envelope (envelope, Q4). */
export function listItems(body: unknown): Json[] {
  if (Array.isArray(body)) return body;
  if (isRecord(body)) {
    const arrays = Object.values(body).filter((value) => Array.isArray(value));
    if (arrays.length === 1) return arrays[0] as Json[];
  }
  throw new Error(`no single list in the response (keys: ${keysOf(body)})`);
}

export const idsOf = (items: Json[]): unknown[] => items.map((item) => item.id);

/** One search word from an owned name: `prefix` plus its lower-case letters and digits only. */
export const searchWord = (name: string, prefix: string): string =>
  `${prefix}${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

/** Each Set-Cookie as its name and lower-case attributes; cookie values are never returned. */
export function setCookies(
  response: Pick<APIResponse, 'headersArray'>,
): { name: string; attributes: string[] }[] {
  return response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => {
      const [pair, ...attributes] = header.value.split(';');
      return {
        name: pair.split('=')[0].trim(),
        attributes: attributes
          .map((attribute) => attribute.trim().toLowerCase())
          .filter((attribute) => attribute !== '' && !/^(expires|max-age)=/.test(attribute)),
      };
    });
}

// The contract documents `delay` in milliseconds and "capped" without the cap (Q6). A server that
// honours it cannot answer sooner than the delay, so the lower bound needs no tolerance. No upper
// bound is asserted; the request timeout only turns a hang into a failure (live sample: 1148 ms).
export const DELAY_MS = 1000;
export const DELAYED_REQUEST_TIMEOUT_MS = 15_000;

/** Runs `action` and measures how long it took, in milliseconds. */
export async function timed<T>(action: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await action();
  return { result, ms: performance.now() - start };
}

// ---------------------------------------------------------------------------------------------
// Owned records and cleanup (rule 20)

/** Ids a test created, removed newest first by cleanup(). */
export class OwnedRecords {
  readonly #ids: number[] = [];

  register(id: number): void {
    this.#ids.push(id);
  }

  get registered(): readonly number[] {
    return [...this.#ids];
  }

  /** Tries every removal, then reports all failures together; the registry is empty afterwards. */
  async cleanup(remove: (id: number) => Promise<void>): Promise<void> {
    const failures: unknown[] = [];
    for (const id of this.#ids.splice(0).reverse()) {
      try {
        await remove(id);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, `cleanup failed for ${failures.length} owned record(s)`);
    }
  }
}

/**
 * Runs `use` with a fresh registry and always cleans up afterwards. Playwright resumes a fixture
 * after a failed test; a direct caller whose `use` throws gets the same cleanup. The test's own
 * error is thrown first, or first inside an AggregateError when the cleanup failed as well.
 */
export async function withOwnedRecords(
  remove: (id: number) => Promise<void>,
  use: (records: OwnedRecords) => Promise<void>,
): Promise<void> {
  const records = new OwnedRecords();
  let failure: { error: unknown } | undefined;
  try {
    await use(records);
  } catch (error) {
    failure = { error };
  }
  try {
    await records.cleanup(remove);
  } catch (cleanupError) {
    if (failure !== undefined) {
      throw new AggregateError(
        [failure.error, cleanupError],
        'the test failed and its cleanup failed too',
        { cause: cleanupError },
      );
    }
    throw cleanupError;
  }
  if (failure !== undefined) throw failure.error;
}

export interface Created {
  response: APIResponse;
  id: number | undefined;
}

/** Creates articles and registers every one that was created before the caller asserts anything. */
export class OwnedArticles {
  readonly #client: ApiClient;
  readonly #records: OwnedRecords;

  constructor(client: ApiClient, records: OwnedRecords) {
    this.#client = client;
    this.#records = records;
  }

  create(data: ArticleFields): Promise<Created> {
    return this.createAs(this.#client, data);
  }

  /** Setup create: the new id, or an error naming the status. The exact status is not checked here. */
  async createOwn(data: ArticleFields): Promise<number> {
    const { response, id } = await this.create(data);
    if (id === undefined)
      throw new Error(`setup: creating an own article returned ${response.status()}`);
    return id;
  }

  /** A create through another client (a guest attempt). An unexpected success is registered too. */
  async createAs(client: ApiClient, data: ArticleFields): Promise<Created> {
    const response = await createArticle(client, data);
    if (!response.ok()) return { response, id: undefined };
    const id = readCreatedId(await response.json());
    this.#records.register(id);
    return { response, id };
  }
}

/** Deletes one own article and confirms it is gone; a 404 means the test already deleted it. */
async function removeOwnArticle(client: ApiClient, id: number): Promise<void> {
  await base.step(`delete own article ${id}`, async () => {
    const response = await deleteArticle(client, id);
    if (!response.ok() && response.status() !== 404) {
      throw new Error(`cleanup: deleting own article ${id} returned ${response.status()}`);
    }
    const after = await client.get(`/api/articles/${id}`);
    if (after.status() !== 404) {
      throw new Error(`cleanup: own article ${id} is still readable (status ${after.status()})`);
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Fixtures. Each request context starts with no cookies and no headers; only `newApi({ bearer })`
// adds a token. Every context a test opens is disposed when the test ends.

export interface AuthorSession {
  client: APIRequestContext;
  userId: number;
}

export type NewApi = (options?: { bearer?: string }) => Promise<APIRequestContext>;

/**
 * Logs `user` in through its own context and returns a context that sends only the bearer token,
 * never the cookie. Fails unless the login returns a non-empty token, an integer id and `role`;
 * the message names the role and status only, never a value.
 */
async function bearerSession(
  newApi: NewApi,
  user: TestUser,
  role: 'author' | 'admin',
): Promise<AuthorSession> {
  const response = await login(await newApi(), user);
  const body: unknown = response.status() === 200 ? await response.json() : undefined;
  const token = isRecord(body) ? body.token : undefined;
  const loginUser = isRecord(body) && isRecord(body.user) ? body.user : undefined;
  if (
    typeof token !== 'string' ||
    token === '' ||
    !Number.isInteger(loginUser?.id) ||
    loginUser?.role !== role
  ) {
    throw new Error(
      `${role} context: login failed or returned another role (status ${response.status()})`,
    );
  }
  return { client: await newApi({ bearer: token }), userId: loginUser.id as number };
}

interface BlogApiFixtures {
  newApi: NewApi;
  guestApi: APIRequestContext;
  freshApi: APIRequestContext;
  authorApi: AuthorSession;
  adminApi: AuthorSession;
  otherAuthorApi: AuthorSession;
  nameFor: (suffix?: string) => string;
  ownedArticles: OwnedArticles;
  authedPage: Page;
  adminPage: Page;
}

interface BlogWorkerFixtures {
  authState: AuthState;
  adminState: AuthState;
}

const NO_STATE = { cookies: [], origins: [] };

export const test = base.extend<BlogApiFixtures, BlogWorkerFixtures>({
  newApi: async ({ playwright }, use) => {
    const contexts: APIRequestContext[] = [];
    await use(async (options = {}) => {
      const context = await playwright.request.newContext({
        baseURL,
        storageState: { cookies: [], origins: [] },
        extraHTTPHeaders:
          options.bearer === undefined ? {} : { Authorization: `Bearer ${options.bearer}` },
      });
      contexts.push(context);
      return context;
    });
    await Promise.all(contexts.map((context) => context.dispose()));
  },

  // A guest never logs in; tests that log in themselves use freshApi.
  guestApi: async ({ newApi }, use) => use(await newApi()),
  freshApi: async ({ newApi }, use) => use(await newApi()),

  // Each logs in through its own context and then sends only the bearer token, never the cookie.
  authorApi: async ({ newApi }, use) => use(await bearerSession(newApi, AUTHOR, 'author')),
  adminApi: async ({ newApi }, use) => use(await bearerSession(newApi, ADMIN, 'admin')),
  otherAuthorApi: async ({ newApi }, use) =>
    use(await bearerSession(newApi, OTHER_AUTHOR, 'author')),

  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures must destructure their first argument
  nameFor: async ({}, use, testInfo) => {
    const runId = runIdFrom();
    await use((suffix) => ownedName(runId, testInfo.testId, suffix));
  },

  ownedArticles: async ({ authorApi }, use) => {
    await withOwnedRecords(
      (id) => removeOwnArticle(authorApi.client, id),
      (records) => use(new OwnedArticles(authorApi.client, records)),
    );
  },

  // One AUTHOR login per worker. The token in the login body is not kept; the session cookie lives
  // only in this worker's memory (never written to disk, so no .auth/ file) and is never printed.
  authState: [
    async ({ playwright }, use) => {
      const request = await playwright.request.newContext({ baseURL, storageState: NO_STATE });
      const state = await readSession(request, AUTHOR, 'author').finally(() => request.dispose());
      await use(state);
    },
    { scope: 'worker' },
  ],

  // One ADMIN login per worker that asks for it, held in memory exactly like authState.
  adminState: [
    async ({ playwright }, use) => {
      const request = await playwright.request.newContext({ baseURL, storageState: NO_STATE });
      const state = await readSession(request, ADMIN, 'admin').finally(() => request.dispose());
      await use(state);
    },
    { scope: 'worker' },
  ],

  // A fresh browser context per test, started from the worker's AUTHOR session; closed afterwards.
  authedPage: async ({ browser, authState }, use) => {
    const context = await browser.newContext({ baseURL, storageState: authState.storageState });
    await use(await context.newPage());
    await context.close();
  },

  // The same for the worker's ADMIN session, in its own browser context.
  adminPage: async ({ browser, adminState }, use) => {
    const context = await browser.newContext({ baseURL, storageState: adminState.storageState });
    await use(await context.newPage());
    await context.close();
  },
});
