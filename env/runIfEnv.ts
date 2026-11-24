import { getTarget, type AppEnv } from './target.ts';

/** The part of Playwright's `test` that runIfEnv calls; Playwright's own `test` satisfies it. */
export interface SkipTest {
  skip(condition: boolean, description: string): void;
}

/**
 * Skips the current test (or every test in the current describe block) unless the
 * process's pinned environment is one of `allowed`. The reason names both.
 */
export function runIfEnv(test: SkipTest, allowed: readonly [AppEnv, ...AppEnv[]]): void {
  if (allowed.length === 0) {
    throw new Error('runIfEnv needs at least one allowed environment.');
  }
  const selected = getTarget().env;
  const names = allowed.map((env) => JSON.stringify(env)).join(', ');
  test.skip(
    !allowed.includes(selected),
    `Runs only when APP_ENV is one of: ${names}. Selected: ${JSON.stringify(selected)}.`,
  );
}
