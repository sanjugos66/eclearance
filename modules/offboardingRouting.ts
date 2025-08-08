// modules/offboardingRouting.ts
import { Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { createRunLog, saveDebugLog } from './debugLogger';
import { handleAnyModals, resolveErrorThenCancelUnderlyingConfirm, probeScreens } from './modalUtils';

type Outcome = 'success' | 'blocked';

type Options = {
  /** If true, close the context at the very end (after we’re done). Default: false */
  autoClose?: boolean;
};

export async function validateAndRouteOffboarding(
  page: Page,
  employeeName: string,
  options: Options = {}
): Promise<Outcome> {
  const { autoClose = false } = options;

  const { dir, logfile } = createRunLog(employeeName);
  const log = (m: string) => saveDebugLog(employeeName, logfile, m);
  const snap = async (tag: string) => {
    try { await page.screenshot({ path: path.join(dir, `${tag}.png`), fullPage: true }); } catch {}
  };
  const dumpHtml = async (tag: string) => {
    try { fs.writeFileSync(path.join(dir, `${tag}.html`), await page.content()); } catch {}
  };

  // NOTE: Do NOT close the page/context from inside this helper unless autoClose=true.
  page.on('framenavigated', f => log(`📦 navigated: ${f.url()}`));

  log(`🕒 start run for ${employeeName}`);

  // --- Navigate to Offboarding (same steps you had) ---
  await page.getByRole('link', { name: /Staff Center/i }).click();
  await snap('nav_staff_center');

  await page.getByRole('link', { name: /My Staff/i }).click();
  await snap('nav_my_staff');

  await page.getByRole('tab', { name: /Offboarding/i }).click();
  await snap('tab_offboarding');

  // Search & open card
  const searchBox = page.getByRole('textbox', { name: /Search/i });
  await searchBox.fill('pablo');
  await searchBox.press('Enter');
  await page.waitForTimeout(500);
  await page.getByText('People Systems View', { exact: false }).click().catch(() => {});
  await searchBox.fill('pablo');
  await searchBox.press('Enter');

  await page.getByText(employeeName, { exact: false }).click();
  await handleAnyModals(page, 'after employee card open');
  await snap('opened_card');

  // Click Validate this Offboarding
  await page.getByRole('button', { name: /Validate this Offboarding/i }).click();
  await handleAnyModals(page, 'after validate click');
  await snap('after_validate');

  // ===== Assign OM People Business Partner =====
  const omRow = page.getByRole('row', { name: /OM\s+People Business Partner/i });
  await omRow.locator('span').nth(3).click(); // open dropdown
  const meOption = page.getByText(/Goswami,\s*Sanju\s*\(sgoswami@/i, { exact: false });
  await meOption.first().click({ trial: false });

  // commit selection in the flow
  await page
    .locator('g:nth-child(5) > .node-foreign-object > .node-foreign-object-div > .outer-wrapper > div')
    .click();

  await handleAnyModals(page, 'after assigning OM People Business Partner');
  await snap('after_assign_om');

  // Confirm role assignment
  await page.getByRole('button', { name: /^\s+Confirm$|^Confirm$/i }).click();
  await handleAnyModals(page, 'after confirm role assignment');

  // prerequisite #2 select “0”
  await page.locator('#prerequisite_edit-2').selectOption('0');
  await handleAnyModals(page, 'after prerequisite 2 select');

  // ===== Final Confirm → (maybe) error =====
  await page.getByRole('button', { name: /^\s+Confirm$|^Confirm$/i }).click();

  // Look for the error dialog and capture evidence
  await probeScreens(page, dir, 'post_final_confirm_probe', 3, 600);

  // Have the resolver tell us if an error dialog was present
  const hadError = await resolveErrorThenCancelUnderlyingConfirm(page, log); // should return boolean
  await handleAnyModals(page, 'post-final-confirm catchall');

  await snap('final_state');
  await dumpHtml('final_state');

  log(hadError ? '🧱 Flow blocked by expected error' : '✅ Flow completed without blocking error');

  // Only close if explicitly asked to — this avoids the “page closed” error in test teardown.
  if (autoClose) {
    try {
      await page.context().close();
      log('✅ Closed context (autoClose=true)');
    } catch {}
  }

  return hadError ? 'blocked' : 'success';
}