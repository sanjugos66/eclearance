import { test, expect } from '@playwright/test';
import { login } from '../modules/login';
import { validateAndRouteOffboarding } from '../modules/offboardingRouting';

test.describe.serial('Offboarding Routing Flow', () => {
  test('Validate and route offboarding (tolerate expected blocks)', async ({ page, context }, testInfo) => {

    test.setTimeout(3 * 60 * 1000);

    const employee = process.env.EMPLOYEE_NAME?.trim() || 'Silbeth Pablo';
    console.log(`🕒 Start ${new Date().toLocaleTimeString()}`);
    console.log(`👤 Employee: ${employee}`);
    if (process.env.QA_ACTIONS) console.log(`⚙️ Actions: ${process.env.QA_ACTIONS}`);

    try {
      await login(page);
      const result = await validateAndRouteOffboarding(page, employee);

      expect(result).toBeDefined();
      expect(['success', 'blocked']).toContain(result);

      const shot = await page.screenshot({ fullPage: true });
      await testInfo.attach('final-state.png', { body: shot, contentType: 'image/png' });
    } catch (err) {
      const shot = await page.screenshot({ fullPage: true });
      await testInfo.attach('error-state.png', { body: shot, contentType: 'image/png' });
      throw err;
    } finally {
      console.log(`🏁 End ${new Date().toLocaleTimeString()}`);
    }
  });
});