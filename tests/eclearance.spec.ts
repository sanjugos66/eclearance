import { test, expect } from '@playwright/test';
import fs from 'fs';
import yaml from 'js-yaml';
import { login } from '../modules/login';
import { handleAction } from '../modules/form';

const testCases = yaml.load(fs.readFileSync('./configs/testCases.yaml', 'utf-8')).testCases;

for (const testCase of testCases) {
  test(testCase.name, async ({ page }) => {
    await login(page, testCase.login.username, testCase.login.password);
    await page.goto(`https://yourapp.com${testCase.path}`);
    for (const action of testCase.actions) {
      await handleAction(page, action);
    }
    const successMessage = await page.textContent('div.alert-success');
    expect(successMessage).toContain(testCase.expected);
  });
}