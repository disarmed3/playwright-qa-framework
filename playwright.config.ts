import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';
import { getTarget } from './env/target';

const { baseURL } = getTarget();

// One run id per run (rule 20, Week 3 Task 05 D3): the runner sets it, workers inherit it.
process.env.QA_RUN_ID ??= `${new Date().toISOString().replace(/[-:]|\.\d+/g, '')}-${randomBytes(3).toString('hex')}`;

export default defineConfig({
  testDir: 'tests',
  forbidOnly: true,
  retries: 0,
  use: {
    baseURL,
    testIdAttribute: 'data-testid',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
