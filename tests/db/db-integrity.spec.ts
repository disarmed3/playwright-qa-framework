// Database integrity on the shared dev database (Week 3 Task 09). Opt-in: QA_DB=1; without access
// every test is skipped with a named reason by the `test` fixture of tests/support/db.ts.
// Read only: SELECT on catalog metadata, aggregate counts and id-only joins; no personal row value.
// Expected values come only from SEED_FACTS (the seed-facts block of the starting data). Counts are
// drift: recorded with today's value and date, never compared exactly (rule 10, rule 40).
// Draft ownership is not asserted: it is not an approved fact (mentor, 2026-10-30).
import { expect } from '@playwright/test';
import { runIfEnv } from '../../env/runIfEnv';
import { dbCount, dbOrphans, dbQuery, dbQueryOne, test } from '../support/db';
import { approvedTables, seedFact } from '../support/seed-facts';

test.describe('blog database integrity (dev only)', () => {
  runIfEnv(test, ['dev']);

  test("TC-DB-001 the database holds the 12 approved tables and today's blog counts are recorded", async () => {
    const rows = await dbQuery<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = $1 and table_type = 'BASE TABLE' order by table_name",
      ['public'],
    );
    expect(rows.map((row) => row.table_name)).toEqual([...approvedTables()].sort());

    const info = test.info();
    const today = new Date().toISOString().slice(0, 10);
    const record = (key: string, value: number) => {
      const starting = seedFact('count', key).expected;
      info.annotations.push({
        type: 'drift',
        description: `count ${key}: starting ${starting}, today ${value} (${today})`,
      });
    };
    for (const table of ['users', 'categories', 'articles', 'comments']) {
      const count = await dbCount(table);
      expect(count, `count ${table}`).toBeGreaterThanOrEqual(0);
      record(table, count);
    }
    for (const status of ['draft', 'published']) {
      const row = await dbQueryOne<{ n: number }>(
        'select count(*)::int as n from public.articles where status = $1',
        [status],
      );
      expect(row.n, `count articles.${status}`).toBeGreaterThanOrEqual(0);
      record(`articles.${status}`, row.n);
    }
  });

  test('TC-DB-002 blog articles and comments point only to existing authors, categories and articles', async () => {
    for (const link of [
      'articles.author_id>users.id',
      'articles.category_id>categories.id',
      'comments.article_id>articles.id',
    ]) {
      const expected = Number(seedFact('orphans', link).expected);
      expect(await dbOrphans(link), `orphans ${link}`).toBe(expected);
    }
  });

  // Guided practice: who owns "an article's status is draft or published"? The database, through a
  // CHECK constraint on articles.status (vault/wiki/01-framework/db-map.md, schema metadata
  // 2026-10-28). The application owns who may publish and when; no constraint covers that. No catalog
  // ID yet (NEW-1 until an approved catalog save), so the title carries none (rule 30).
  test('article status is limited to draft or published by a database check constraint', async () => {
    const rows = await dbQuery<{ definition: string }>(
      'select pg_get_constraintdef(c.oid) as definition from pg_constraint c ' +
        'join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace ' +
        "where n.nspname = $1 and t.relname = $2 and c.contype = 'c'",
      ['public', 'articles'],
    );
    const onStatus = rows.map((row) => row.definition).filter((def) => /\bstatus\b/.test(def));
    expect(onStatus, 'one CHECK constraint on articles.status').toHaveLength(1);
    const allowed = [...onStatus[0].matchAll(/'([^']*)'/g)].map((match) => match[1]).sort();
    expect(allowed).toEqual(['draft', 'published']);
  });
});
