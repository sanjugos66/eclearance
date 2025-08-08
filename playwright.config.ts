import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,   // safer while we orchestrate runs
  workers: 1,             // one run at a time
  retries: process.env.CI ? 1 : 0,

  // Put everything where the server expects it
  outputDir: process.env.ARTIFACTS_RUN_DIR || 'test-results',

  use: {
    headless: false,
    slowMo: 2000,
    trace: 'retain-on-failure',      // or 'on' if you want every run
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,           // avoid “hangs” on flaky clicks
    navigationTimeout: 45_000,
    baseURL: process.env.BASE_URL,   // optional: let server/env provide it
  },

  reporter: [
    ['list'],
    ['allure-playwright'],
    // You can also add the HTML reporter if you like:
    // ['html', { open: 'never' }],
  ],
});