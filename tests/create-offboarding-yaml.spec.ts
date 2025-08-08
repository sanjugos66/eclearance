import { test } from '@playwright/test';
import fs from 'fs';
import yaml from 'js-yaml';
import { login } from '../modules/login';
import { createOffboardingTicket } from '../modules/offboarding';

// Load test cases (no more login block in YAML)
const testCases = yaml.load(fs.readFileSync('./configs/offboarding.yaml', 'utf8')).testCases;

test.describe('Batch Offboarding Ticket Creation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page); // login uses hardcoded username/password
  });

  for (const testCase of testCases) {
    test(testCase.name, async ({ page }) => {
      const result = await createOffboardingTicket(page, testCase.employee);

      if (result.result === 'duplicate') {
        console.log(`⚠️ Skipped: ${testCase.employee} already has an active offboarding ticket.`);
      } else if (result.result === 'no-selection') {
        console.log(`❌ Failed: ${testCase.employee} was not selected properly.`);
      } else if (result.result === 'error') {
        console.log(`❌ Unexpected error for ${testCase.employee}: ${result.message}`);
      } else {
        console.log(`✅ Ticket created for: ${testCase.employee}`);
      }
    });
  }
});