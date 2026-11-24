import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'safety',
  retries: 0,
  projects: [{ name: 'safety' }],
});
