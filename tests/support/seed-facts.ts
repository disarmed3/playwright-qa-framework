// The seed-facts block of vault/sources/database/starting-data.md (Week 3 Task 09): the mentor's
// starting data dated 2026-10-15 and answers of 2026-10-30. Read at runtime, so no expected value is
// copied into code; scripts/seed-integrity.sh reads the same block. Same reading rules as that script:
// CR stripped, '#' and blank lines skipped, five '|' fields per row. A missing block or a malformed
// row throws. Rows keep their status; callers use only approved rows (status other than approved =
// unverified, never compared).
import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface SeedFact {
  readonly check: string;
  readonly key: string;
  readonly expected: string;
  readonly class: 'drift' | 'fixed';
  readonly status: string;
}

const BLOCK = /^```seed-facts\r?\n([\s\S]*?)^```\s*$/m;

/** Pure: the rows of the first seed-facts block in `markdown`. */
export function parseSeedFacts(markdown: string): readonly SeedFact[] {
  const block = BLOCK.exec(markdown);
  if (block === null) throw new Error('starting data: no seed-facts block');
  const facts: SeedFact[] = [];
  for (const raw of block[1].split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line === '' || line.startsWith('#')) continue;
    const fields = line.split('|');
    const [check, key, expected, cls, status] = fields;
    if (fields.length !== 5 || fields.some((field) => field === '')) {
      throw new Error(`starting data: malformed seed-facts row (${fields.length} fields)`);
    }
    if (cls !== 'drift' && cls !== 'fixed') {
      throw new Error(
        `starting data: seed-facts row ${check}|${key} has class ${JSON.stringify(cls)}`,
      );
    }
    facts.push(Object.freeze({ check, key, expected, class: cls, status }));
  }
  return Object.freeze(facts);
}

export const SEED_FACTS = parseSeedFacts(
  readFileSync(
    path.resolve(__dirname, '..', '..', 'vault', 'sources', 'database', 'starting-data.md'),
    'utf8',
  ),
);

/** The one approved row for `check` and `key`; throws when it is missing, repeated or not approved. */
export function seedFact(check: string, key: string, facts = SEED_FACTS): SeedFact {
  const rows = facts.filter((fact) => fact.check === check && fact.key === key);
  if (rows.length !== 1) {
    throw new Error(
      `starting data: expected one seed-facts row ${check}|${key}, found ${rows.length}`,
    );
  }
  if (rows[0].status !== 'approved') {
    throw new Error(
      `starting data: seed-facts row ${check}|${key} is ${rows[0].status}, not approved`,
    );
  }
  return rows[0];
}

/** The approved table names (the `tables|public` row). */
export function approvedTables(facts = SEED_FACTS): readonly string[] {
  return seedFact('tables', 'public', facts).expected.split(',');
}
