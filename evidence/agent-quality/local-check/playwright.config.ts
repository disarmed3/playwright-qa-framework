// Own config for the agent-quality local check (Week 4 Task 03, rule 60). Run only with
//   npx playwright test --config evidence/agent-quality/local-check/playwright.config.ts
// Local pages only: no baseURL, webServer, globalSetup, storage state, credentials, project
// reporter or env/target.ts. The normal suite (testDir 'tests') and the safety config never see
// this folder.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.check.ts',
  outputDir: '../../../test-results/agent-quality',
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 10_000,
  expect: { timeout: 1_000 },
  reporter: 'list',
  use: { testIdAttribute: 'data-testid', trace: 'off', screenshot: 'off', video: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
