// SYNTHETIC fixture suite for scripts/flaky-triage.ts (Week 4 Task 04). Run only through
//   node scripts/flaky-fixtures.ts
// which sets FLAKY_FIXTURE_CASE (and FLAKY_FIXTURE_VARIANT where a case has two runs).
// No browser use (no test asks for `page`), baseURL, webServer, globalSetup, storage state,
// credentials, network or env/target.ts. The normal suite (testDir 'tests') and the safety config
// never see this folder. Retries are set here for the retry-flaky case only; the project's own
// playwright.config.ts keeps retries: 0.
import { defineConfig } from '@playwright/test';

type FixtureCase = { testMatch: string[]; retries: number; projects: string[]; repeatEach?: number };

const CASES: Record<string, FixtureCase> = {
  'retry-flaky': { testMatch: ['retry.fixture.ts'], retries: 1, projects: ['alpha'] },
  'cross-run': { testMatch: ['cross.fixture.ts'], retries: 0, projects: ['alpha'] },
  'skip-partial': { testMatch: ['skip.fixture.ts'], retries: 0, projects: ['alpha'] },
  'same-title': { testMatch: ['same-a.fixture.ts', 'same-b.fixture.ts'], retries: 0, projects: ['alpha', 'beta'] },
  stable: { testMatch: ['stable.fixture.ts'], retries: 0, projects: ['alpha'] },
  'repeat-each': { testMatch: ['stable.fixture.ts'], retries: 0, projects: ['alpha'], repeatEach: 2 },
};

const name = process.env.FLAKY_FIXTURE_CASE ?? '';
const selected = CASES[name];
if (!selected) {
  throw new Error(`FLAKY_FIXTURE_CASE must be one of: ${Object.keys(CASES).join(', ')}`);
}

export default defineConfig({
  testDir: '.',
  testMatch: selected.testMatch,
  outputDir: '../../../../test-results/flaky-fixtures',
  workers: 1,
  retries: selected.retries,
  repeatEach: selected.repeatEach ?? 1,
  forbidOnly: true,
  timeout: 5_000,
  use: { trace: 'off', screenshot: 'off', video: 'off' },
  projects: selected.projects.map((projectName) => ({ name: projectName })),
});
