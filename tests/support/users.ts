// Teaching logins for the dev site. The values are never committed: each field reads its environment
// variable when a test uses it (not when this module loads, so `test:list` and `typecheck` need none).
// Locally an unset variable is taken from `.env` (only the six names below, parsed with node:util
// parseEnv); in CI the repository secrets provide them. A missing or empty value fails with the
// variable's name only, never a value. `.env.example` lists the names.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

export interface TestUser {
  readonly email: string;
  readonly password: string;
}

const NAMES = [
  'AUTHOR_EMAIL',
  'AUTHOR_PASSWORD',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'OTHER_AUTHOR_EMAIL',
  'OTHER_AUTHOR_PASSWORD',
] as const;
type Name = (typeof NAMES)[number];

let dotEnv: Partial<Record<Name, string>> | undefined;

/** The six names from `.env` once per process; an absent file gives none. Other lines are ignored. */
function fromDotEnv(): Partial<Record<Name, string>> {
  if (dotEnv !== undefined) return dotEnv;
  // Playwright loads this file as CommonJS (__dirname); a plain Node ESM import falls back to the cwd.
  const root = typeof __dirname === 'string' ? path.resolve(__dirname, '..', '..') : process.cwd();
  let text = '';
  let unreadable = false;
  try {
    text = readFileSync(path.join(root, '.env'), 'utf8');
  } catch (error) {
    // An absent .env means "no values from it"; any other failure stops with its details hidden.
    unreadable = (error as NodeJS.ErrnoException).code !== 'ENOENT';
  }
  if (unreadable) throw new Error('.env could not be read (details hidden)');
  const lines = text
    .split(/\r?\n/)
    .filter((line) => NAMES.some((name) => line.startsWith(`${name}=`)));
  const parsed = parseEnv(lines.join('\n'));
  dotEnv = Object.fromEntries(
    NAMES.flatMap((name) => (parsed[name] === undefined ? [] : [[name, parsed[name]]])),
  );
  return dotEnv;
}

function required(name: Name): string {
  const value = process.env[name] ?? fromDotEnv()[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is not set: add it to .env (local) or the repository secrets (CI)`);
  }
  return value;
}

function fromEnv(prefix: 'AUTHOR' | 'ADMIN' | 'OTHER_AUTHOR'): TestUser {
  return {
    get email() {
      return required(`${prefix}_EMAIL`);
    },
    get password() {
      return required(`${prefix}_PASSWORD`);
    },
  };
}

export const AUTHOR: TestUser = fromEnv('AUTHOR');

// Public teaching fixture from the course page "Course links & resources" (read 2026-11-02).
// Writes as ADMIN go only to the test's own qa-auto- records, on dev only.
export const ADMIN: TestUser = fromEnv('ADMIN');

// A second author ("Maya"), a training fixture (vault/sources/product/blog-api.md, "Accounts and
// roles"). Used only to make refused requests against the test's own records, on dev only.
export const OTHER_AUTHOR: TestUser = fromEnv('OTHER_AUTHOR');
