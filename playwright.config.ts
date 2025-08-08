import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    headless: false,     // show browser during test
    slowMo: 2000,         // slow down each step for clarity
  },
  reporter: [
    ['list'],
    ['allure-playwright']
  ],
});