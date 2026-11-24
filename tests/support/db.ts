// Optional database layer for tests (Week 3 Task 09). Opt-in: used only when QA_DB=1 (owner's
// decision 2026-10-31). The database is the dev database (rule 40), so any other target is
// unavailable, and unavailable access is a named skip through requireDb.
//
// Connection: STUDENT_DATABASE_URL from the environment; only when it is unset, the first
// STUDENT_DATABASE_URL= line of .env, parsed with node:util parseEnv (no other line is parsed). An
// explicit empty value means unavailable, not fallback. Nothing here prints or returns the value.
//
// Reads: every helper read checks out one client and runs BEGIN TRANSACTION READ ONLY, SET LOCAL
// statement_timeout, a SHOW transaction_read_only check, then the caller's statement, then ROLLBACK,
// all on that client. Any failure, including a failed ROLLBACK, releases the client destroyed, never
// back into the pool. The caller's statement is sent with the extended protocol (one statement,
// values as $1…). The session default (default_transaction_read_only in `options`) is a second fence
// only: parameters in the connection string override `options` (pg 8.23.1 connection-parameters.js).
// The issued account can write; no read-only role is issued yet. Read-only enforcement is not
// verified against a database (evidence/week3-task09-note.md in tag week6-end). Errors carry the step and SQLSTATE
// only, never SQL text, values, host or the connection string.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { test as base } from '@playwright/test';
import { escapeIdentifier, Pool, type PoolConfig, type QueryConfig } from 'pg';
import type { AppEnv } from '../../env/target.ts';
import type { SkipTest } from '../../env/runIfEnv.ts';
import { currentEnv } from './env.ts';
import { approvedTables } from './seed-facts.ts';

const KEY = 'STUDENT_DATABASE_URL';

export type DbAccess =
  { readonly ok: true; readonly url: string } | { readonly ok: false; readonly reason: string };

export interface DbSettings {
  QA_DB?: string;
  STUDENT_DATABASE_URL?: string;
}

/** A database failure: the step and SQLSTATE (or Node error code) only. */
export class DbError extends Error {
  readonly code: string;

  constructor(step: string, code = 'unknown') {
    super(`database ${step} failed (code ${code}; details hidden)`);
    this.name = 'DbError';
    this.code = code;
  }
}

const unavailable = (reason: string): DbAccess => ({ ok: false, reason });

/**
 * Pure: decides access from `settings`, the pinned environment and `readDotEnv` (the .env text, or
 * undefined when there is no file). .env is read only when the opt-in and the target allow it and
 * the variable is unset.
 */
export function resolveDbAccess(
  settings: DbSettings,
  env: AppEnv,
  readDotEnv: () => string | undefined,
): DbAccess {
  if (settings.QA_DB !== '1') return unavailable('opt-in only; set QA_DB=1');
  if (env !== 'dev') {
    return unavailable(`the database is the dev database; selected ${JSON.stringify(env)}`);
  }
  const fromEnv = settings.STUDENT_DATABASE_URL;
  if (fromEnv !== undefined) {
    return fromEnv === '' ? unavailable(`${KEY} is set but empty`) : { ok: true, url: fromEnv };
  }
  let text: string | undefined;
  try {
    text = readDotEnv();
  } catch {
    return unavailable('.env could not be read (details hidden)');
  }
  if (text === undefined) return unavailable(`${KEY} is not set and there is no .env`);
  const line = text.split(/\r?\n/).find((entry) => entry.startsWith(`${KEY}=`));
  const value = line === undefined ? undefined : parseEnv(line)[KEY];
  if (value === undefined) return unavailable(`${KEY} is not set and not in .env`);
  if (value === '') return unavailable(`${KEY} is empty in .env`);
  return { ok: true, url: value };
}

/** Pool settings for `url`: at most 3 connections, read-only session default, 30 s statements. */
export function poolConfig(url: string): PoolConfig {
  return {
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'qa-framework-tests',
    options: '-c default_transaction_read_only=on -c statement_timeout=30000',
  };
}

/** The client calls the helpers make; pg's PoolClient fits it. */
export interface DbClient {
  query(config: QueryConfig): Promise<{ rows: Record<string, unknown>[] }>;
  release(destroy?: boolean): void;
}

/** The pool calls the helpers make; pg's Pool fits it. */
export interface DbPool {
  connect(): Promise<DbClient>;
  end(): Promise<void>;
}

const codeOf = (error: unknown): string => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[0-9A-Z_]{3,32}$/.test(code) ? code : 'unknown';
};

/** Builds the helpers on an access decision and a pool factory (the safety checks pass fakes). */
export function createDb(access: () => DbAccess, makePool: (config: PoolConfig) => DbPool) {
  let decided: DbAccess | undefined;
  let pool: DbPool | undefined;
  const decide = () => (decided ??= access());

  function getPool(): DbPool {
    const current = decide();
    if (!current.ok) throw new DbError(`access (unavailable: ${current.reason})`);
    return (pool ??= makePool(poolConfig(current.url)));
  }

  async function step(client: DbClient, name: string, config: QueryConfig) {
    try {
      return await client.query(config);
    } catch (error) {
      throw new DbError(name, codeOf(error));
    }
  }

  /** Runs one statement in a read-only transaction on one client; `values` are sent as $1, $2, … */
  async function dbQuery<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<Row[]> {
    const ownPool = getPool();
    let client: DbClient;
    try {
      client = await ownPool.connect();
    } catch (error) {
      throw new DbError('connect', codeOf(error));
    }
    let rows: Row[] | undefined;
    let failure: unknown;
    try {
      await step(client, 'begin', { text: 'BEGIN TRANSACTION READ ONLY' });
      await step(client, 'timeout', { text: "SET LOCAL statement_timeout = '30s'" });
      const check = await step(client, 'read-only check', { text: 'SHOW transaction_read_only' });
      if (check.rows.length !== 1 || check.rows[0].transaction_read_only !== 'on') {
        throw new DbError('read-only check', 'NOT_READ_ONLY');
      }
      // queryMode is in pg 8.23.1 (lib/query.js) but not in @types/pg 8.23.1.
      const statement: QueryConfig & { queryMode: 'extended' } = {
        text,
        values: [...values],
        queryMode: 'extended',
      };
      rows = (await step(client, 'query', statement)).rows as Row[];
    } catch (error) {
      failure = error;
    }
    // Every path reaches here: roll back, then release (destroyed after any failure).
    try {
      await client.query({ text: 'ROLLBACK' });
    } catch (error) {
      // A failed ROLLBACK after a successful read still fails the read; an earlier error wins.
      failure ??= new DbError('rollback', codeOf(error));
    }
    client.release(failure !== undefined);
    if (failure !== undefined || rows === undefined) throw failure;
    return rows;
  }

  /** Like dbQuery, for a statement that must return exactly one row. */
  async function dbQueryOne<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<Row> {
    const rows = await dbQuery<Row>(text, values);
    if (rows.length !== 1) throw new DbError(`query (expected one row, got ${rows.length})`);
    return rows[0];
  }

  /** count(*) of one approved table (the seed-facts table list); any other name is refused unsent. */
  async function dbCount(table: string): Promise<number> {
    if (!approvedTables().includes(table))
      throw new DbError(`count (table not approved: ${table})`);
    const row = await dbQueryOne<{ n: unknown }>(
      `select count(*)::int as n from public.${escapeIdentifier(table)}`,
    );
    if (typeof row.n !== 'number' || !Number.isInteger(row.n)) {
      throw new DbError('count (malformed response)');
    }
    return row.n;
  }

  /**
   * Rows of `child.fk>parent.pk` (a seed-facts orphans key) whose non-NULL link points to no parent
   * row. Both tables must be approved; every name is quoted. A NULL link is not an orphan
   * (articles.category_id is nullable; mentor, 2026-10-30). Any other link is refused unsent.
   */
  async function dbOrphans(link: string): Promise<number> {
    const match = /^([a-z_]+)\.([a-z_]+)>([a-z_]+)\.([a-z_]+)$/.exec(link);
    const tables = approvedTables();
    if (match === null || !tables.includes(match[1]) || !tables.includes(match[3])) {
      throw new DbError(`orphans (link not approved: ${link})`);
    }
    const [child, fk, parent, pk] = match.slice(1).map((name) => escapeIdentifier(name));
    const row = await dbQueryOne<{ n: unknown }>(
      `select count(*)::int as n from public.${child} c where c.${fk} is not null ` +
        `and not exists (select 1 from public.${parent} p where p.${pk} = c.${fk})`,
    );
    if (typeof row.n !== 'number' || !Number.isInteger(row.n)) {
      throw new DbError('orphans (malformed response)');
    }
    return row.n;
  }

  /** Ends the pool if one was created; safe to call again. Never decides access. */
  async function dbClose(): Promise<void> {
    const open = pool;
    pool = undefined;
    await open?.end();
  }

  const dbAvailable = (): boolean => decide().ok;

  /** Skips the current test (or describe block) with a named reason when access is unavailable. */
  function requireDb(test: SkipTest): void {
    const current = decide();
    test.skip(
      !current.ok,
      current.ok ? 'database access available' : `database access unavailable: ${current.reason}`,
    );
  }

  return { dbQuery, dbQueryOne, dbCount, dbOrphans, dbClose, dbAvailable, requireDb };
}

function readDotEnv(): string | undefined {
  const file = path.resolve(__dirname, '..', '..', '.env');
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if (codeOf(error) === 'ENOENT') return undefined;
    throw error;
  }
}

export const { dbQuery, dbQueryOne, dbCount, dbOrphans, dbClose, dbAvailable, requireDb } =
  createDb(
    () =>
      resolveDbAccess(
        { QA_DB: process.env.QA_DB, STUDENT_DATABASE_URL: process.env.STUDENT_DATABASE_URL },
        currentEnv(),
        readDotEnv,
      ),
    (config) => new Pool(config),
  );

/**
 * `test` for database specs: every test is skipped with a named reason unless access is available,
 * and each worker closes the pool when it ends.
 */
export const test = base.extend<{ dbAccess: void }, { dbPool: void }>({
  dbAccess: [
    // eslint-disable-next-line no-empty-pattern -- Playwright fixtures must destructure their first argument
    async ({}, use, testInfo) => {
      requireDb(testInfo);
      await use();
    },
    { auto: true },
  ],
  dbPool: [
    // eslint-disable-next-line no-empty-pattern -- Playwright fixtures must destructure their first argument
    async ({}, use) => {
      await use();
      await dbClose();
    },
    { scope: 'worker', auto: true },
  ],
});
