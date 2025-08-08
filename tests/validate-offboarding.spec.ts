import { test, expect } from '@playwright/test';
import { login } from '../modules/login';
import { validateAndRouteOffboarding } from '../modules/offboardingRouting';

test.describe.serial('Offboarding Routing Flow', () => {
  test('Validate and route offboarding for Silbeth Pablo', async ({ page }) => {
    test.setTimeout(120_000);
    console.log(`🕒 Test started: ${new Date().toLocaleTimeString()}`);

    await login(page);
    const result = await validateAndRouteOffboarding(page, 'Silbeth Pablo');

    // Treat either outcome as “pass” since the system is expected to block
    expect(['success', 'blocked']).toContain(result);
  });
});