// Isolated checks for the optional database layer in tests/support/db.ts and the seed-facts reader
// (Week 3 Task 09). The access decision gets fake settings and fake .env text; the helpers get a fake
// pool that records every call. No database, page, browser or network is used, and no real .env is
// read. These checks prove the helpers' lifecycle and error hiding, not that a database refuses a
// write (read-only enforcement stays unverified until an approved disposable database exists).
import { expect, test } from '@playwright/test';
import type { PoolConfig, QueryConfig } from 'pg';
import {
  createDb,
  DbError,
  resolveDbAccess,
  type DbClient,
  type DbPool,
} from '../tests/support/db';
import { parseSeedFacts, seedFact } from '../tests/support/seed-facts';

const KEY = 'STUDENT_DATABASE_URL';
const DUMMY_URL = 'postgres://dummy-user:dummy-pass@dummy-host.invalid:5432/dummy-db';
const OTHER_SECRET = 'dummy-other-token-value';
const neverRead = () => {
  throw new Error('.env must not be read in this case');
};

test.describe('database access decision', { tag: '@safety' }, () => {
  test('without QA_DB=1 access is unavailable and .env is not read', () => {
    for (const QA_DB of [undefined, '', '0', 'true', ' 1']) {
      expect(resolveDbAccess({ QA_DB, [KEY]: DUMMY_URL }, 'dev', neverRead)).toEqual({
        ok: false,
        reason: 'opt-in only; set QA_DB=1',
      });
    }
  });

  test('on prod access is unavailable and .env is not read', () => {
    const access = resolveDbAccess({ QA_DB: '1', [KEY]: DUMMY_URL }, 'prod', neverRead);
    expect(access).toEqual({
      ok: false,
      reason: 'the database is the dev database; selected "prod"',
    });
  });

  test('a set environment value is used and .env is not read', () => {
    expect(resolveDbAccess({ QA_DB: '1', [KEY]: DUMMY_URL }, 'dev', neverRead)).toEqual({
      ok: true,
      url: DUMMY_URL,
    });
  });

  test('an explicit empty environment value is unavailable, not a fallback to .env', () => {
    expect(resolveDbAccess({ QA_DB: '1', [KEY]: '' }, 'dev', neverRead)).toEqual({
      ok: false,
      reason: `${KEY} is set but empty`,
    });
  });

  test('an unset value falls back to only that key from .env (CRLF, quotes, other keys)', () => {
    const text = `JIRA_API_TOKEN=${OTHER_SECRET}\r\n# comment\r\n${KEY}="${DUMMY_URL}"\r\nOTHER=x\r\n`;
    const access = resolveDbAccess({ QA_DB: '1' }, 'dev', () => text);
    expect(access).toEqual({ ok: true, url: DUMMY_URL });
    expect(JSON.stringify(access)).not.toContain(OTHER_SECRET);
  });

  test('a missing file, a missing key, an empty key and a read error are unavailable', () => {
    const decide = (read: () => string | undefined) => resolveDbAccess({ QA_DB: '1' }, 'dev', read);
    expect(decide(() => undefined)).toEqual({
      ok: false,
      reason: `${KEY} is not set and there is no .env`,
    });
    expect(decide(() => `OTHER=${OTHER_SECRET}\n`)).toEqual({
      ok: false,
      reason: `${KEY} is not set and not in .env`,
    });
    expect(decide(() => `${KEY}=\n`)).toEqual({ ok: false, reason: `${KEY} is empty in .env` });
    const failed = decide(() => {
      throw new Error(`EACCES ${DUMMY_URL}`);
    });
    expect(failed).toEqual({ ok: false, reason: '.env could not be read (details hidden)' });
  });
});

// ---------------------------------------------------------------------------------------------
// A fake pool. `fail` names the step that throws (its error carries the dummy URL and SQL text, to
// prove neither is passed on); `readOnly` is what SHOW transaction_read_only returns.

type Step = 'connect' | 'begin' | 'timeout' | 'check' | 'query' | 'rollback';

function fakePool(
  options: { fail?: Step; readOnly?: string; rows?: Record<string, unknown>[] } = {},
) {
  const sent: QueryConfig[] = [];
  const releases: (boolean | undefined)[] = [];
  const configs: PoolConfig[] = [];
  let ended = 0;
  const boom = () =>
    Object.assign(new Error(`failed at ${DUMMY_URL}: select secret_column`), { code: '42P01' });
  const stepOf = (text: string): Step =>
    text.startsWith('BEGIN')
      ? 'begin'
      : text.startsWith('SET LOCAL')
        ? 'timeout'
        : text.startsWith('SHOW')
          ? 'check'
          : text === 'ROLLBACK'
            ? 'rollback'
            : 'query';
  const client: DbClient = {
    async query(config) {
      sent.push(config);
      const step = stepOf(config.text);
      if (options.fail === step) throw boom();
      if (step === 'check') return { rows: [{ transaction_read_only: options.readOnly ?? 'on' }] };
      if (step === 'query') return { rows: options.rows ?? [{ n: 4 }] };
      return { rows: [] };
    },
    release(destroy) {
      releases.push(destroy);
    },
  };
  const pool: DbPool = {
    async connect() {
      if (options.fail === 'connect')
        throw Object.assign(new Error(DUMMY_URL), { code: 'ECONNREFUSED' });
      return client;
    },
    async end() {
      ended += 1;
    },
  };
  const db = createDb(
    () => ({ ok: true, url: DUMMY_URL }),
    (config) => {
      configs.push(config);
      return pool;
    },
  );
  return { db, sent, releases, configs, ended: () => ended, texts: () => sent.map((q) => q.text) };
}

const PREFIX = [
  'BEGIN TRANSACTION READ ONLY',
  "SET LOCAL statement_timeout = '30s'",
  'SHOW transaction_read_only',
];

async function hiddenFailure(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(DbError);
  expect((error as DbError).code).toBe(code);
  const message = (error as Error).message;
  for (const hidden of [DUMMY_URL, 'dummy-host', 'dummy-pass', 'secret_column']) {
    expect(message).not.toContain(hidden);
  }
  expect((error as Error).cause).toBeUndefined();
}

test.describe('database helper lifecycle with a fake pool', { tag: '@safety' }, () => {
  test('a read runs begin, timeout, read-only check, the statement and rollback on one client', async () => {
    const fake = fakePool({ rows: [{ n: 4 }] });
    expect(await fake.db.dbQuery('select $1::int as n', [4])).toEqual([{ n: 4 }]);
    expect(fake.texts()).toEqual([...PREFIX, 'select $1::int as n', 'ROLLBACK']);
    expect(fake.sent[3]).toEqual({
      text: 'select $1::int as n',
      values: [4],
      queryMode: 'extended',
    });
    expect(fake.releases).toEqual([false]);
  });

  test('the pool is created once with at most 3 connections and a read-only session default', async () => {
    const fake = fakePool();
    await fake.db.dbQuery('select 1');
    await fake.db.dbQuery('select 2');
    expect(fake.configs).toHaveLength(1);
    expect(fake.configs[0]).toMatchObject({ connectionString: DUMMY_URL, max: 3 });
    expect(fake.configs[0].options).toContain('default_transaction_read_only=on');
    expect(fake.configs[0].options).toContain('statement_timeout=30000');
  });

  for (const step of ['begin', 'timeout', 'check'] as const) {
    test(`a failed ${step} step sends no statement, rolls back and destroys the client`, async () => {
      const fake = fakePool({ fail: step });
      await hiddenFailure(fake.db.dbQuery('select 1'), '42P01');
      expect(fake.texts()).not.toContain('select 1');
      expect(fake.texts().at(-1)).toBe('ROLLBACK');
      expect(fake.releases).toEqual([true]);
    });
  }

  test('a session that is not read-only sends no statement and destroys the client', async () => {
    const fake = fakePool({ readOnly: 'off' });
    await hiddenFailure(fake.db.dbQuery('select 1'), 'NOT_READ_ONLY');
    expect(fake.texts()).toEqual([...PREFIX, 'ROLLBACK']);
    expect(fake.releases).toEqual([true]);
  });

  test('a failed statement rolls back, destroys the client and hides SQL, values and host', async () => {
    const fake = fakePool({ fail: 'query' });
    await hiddenFailure(fake.db.dbQuery('select secret_column', ['dummy-pass']), '42P01');
    expect(fake.texts().at(-1)).toBe('ROLLBACK');
    expect(fake.releases).toEqual([true]);
  });

  test('a failed rollback after a read fails the read and destroys the client', async () => {
    const fake = fakePool({ fail: 'rollback' });
    await hiddenFailure(fake.db.dbQuery('select 1'), '42P01');
    expect(fake.releases).toEqual([true]);
  });

  test('a failed connect is hidden and releases nothing', async () => {
    const fake = fakePool({ fail: 'connect' });
    await hiddenFailure(fake.db.dbQuery('select 1'), 'ECONNREFUSED');
    expect(fake.sent).toEqual([]);
    expect(fake.releases).toEqual([]);
  });

  test('dbQueryOne refuses zero or several rows', async () => {
    await expect(fakePool({ rows: [] }).db.dbQueryOne('select 1')).rejects.toThrow(
      'expected one row, got 0',
    );
    await expect(
      fakePool({ rows: [{ n: 1 }, { n: 2 }] }).db.dbQueryOne('select 1'),
    ).rejects.toThrow('expected one row, got 2');
  });

  test('dbCount quotes an approved table and refuses any other name unsent', async () => {
    const fake = fakePool({ rows: [{ n: 4 }] });
    expect(await fake.db.dbCount('users')).toBe(4);
    expect(fake.texts()[3]).toBe('select count(*)::int as n from public."users"');
    const refused = fakePool();
    await expect(refused.db.dbCount('users; drop table users')).rejects.toBeInstanceOf(DbError);
    expect(refused.sent).toEqual([]);
    await expect(fakePool({ rows: [{ n: '4' }] }).db.dbCount('users')).rejects.toThrow('malformed');
  });

  test('dbOrphans quotes every name of an approved link and refuses any other link unsent', async () => {
    const fake = fakePool({ rows: [{ n: 0 }] });
    expect(await fake.db.dbOrphans('articles.category_id>categories.id')).toBe(0);
    expect(fake.texts()[3]).toBe(
      'select count(*)::int as n from public."articles" c where c."category_id" is not null ' +
        'and not exists (select 1 from public."categories" p where p."id" = c."category_id")',
    );
    expect(fake.sent[3].values).toEqual([]);
    for (const link of [
      'articles.author_id>secrets.id',
      'articles.author_id>users.id; drop table users',
      'articles.author_id',
    ]) {
      const refused = fakePool();
      await expect(refused.db.dbOrphans(link)).rejects.toBeInstanceOf(DbError);
      expect(refused.sent).toEqual([]);
    }
    await expect(
      fakePool({ rows: [{ n: '0' }] }).db.dbOrphans('comments.article_id>articles.id'),
    ).rejects.toThrow('malformed');
  });

  test('dbClose ends a created pool once and is safe to call again', async () => {
    const fake = fakePool();
    await fake.db.dbClose();
    expect(fake.ended()).toBe(0);
    await fake.db.dbQuery('select 1');
    await fake.db.dbClose();
    await fake.db.dbClose();
    expect(fake.ended()).toBe(1);
  });

  test('unavailable access refuses reads without a pool and requireDb skips with the reason', async () => {
    let pools = 0;
    const db = createDb(
      () => ({ ok: false, reason: 'opt-in only; set QA_DB=1' }),
      () => {
        pools += 1;
        throw new Error('no pool may be created');
      },
    );
    await expect(db.dbQuery('select 1')).rejects.toThrow('unavailable: opt-in only; set QA_DB=1');
    expect(pools).toBe(0);
    expect(db.dbAvailable()).toBe(false);
    const skips: [boolean, string][] = [];
    db.requireDb({ skip: (condition, description) => skips.push([condition, description]) });
    expect(skips).toEqual([[true, 'database access unavailable: opt-in only; set QA_DB=1']]);
  });
});

test.describe('seed-facts reader', { tag: '@safety' }, () => {
  const block = (rows: string) =>
    `# Note\n\n\`\`\`seed-facts\r\n# check|key|expected|class|status\r\n${rows}\`\`\`\n`;

  test('rows keep their fields and status; CR and comments are skipped', () => {
    const facts = parseSeedFacts(
      block('count|users|4|drift|approved\r\n\r\nprice|tee|1|fixed|pending\r\n'),
    );
    expect(facts).toEqual([
      { check: 'count', key: 'users', expected: '4', class: 'drift', status: 'approved' },
      { check: 'price', key: 'tee', expected: '1', class: 'fixed', status: 'pending' },
    ]);
    expect(seedFact('count', 'users', facts).expected).toBe('4');
    expect(() => seedFact('price', 'tee', facts)).toThrow('pending, not approved');
    expect(() => seedFact('count', 'orders', facts)).toThrow('found 0');
  });

  test('a missing block, a malformed row or an unknown class throws', () => {
    expect(() => parseSeedFacts('no block here')).toThrow('no seed-facts block');
    expect(() => parseSeedFacts(block('count|users|4|drift\n'))).toThrow('malformed');
    expect(() => parseSeedFacts(block('count|users|4|other|approved\n'))).toThrow('class');
  });
});
