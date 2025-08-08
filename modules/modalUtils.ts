import { Page } from '@playwright/test';

async function textOfTopDialog(page: Page): Promise<string> {
  const dlg = page.getByRole('dialog');
  const visible = await dlg.isVisible({ timeout: 800 }).catch(() => false);
  if (!visible) return '';
  return (await dlg.textContent().catch(() => ''))?.trim() ?? '';
}

async function clickDialogButton(page: Page, name: RegExp, timeout = 5000): Promise<boolean> {
  const dlg = page.getByRole('dialog');
  const btn = dlg.getByRole('button', { name });
  try {
    await btn.waitFor({ state: 'visible', timeout });
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    await btn.click({ trial: false });
    await dlg.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/**
 * Handle whatever modal is currently visible. Returns the dialog text (if any).
 * Tries buttons in this order by default: OK → Yes, proceed → Cancel → Confirm
 */
export async function handleAnyModals(page: Page, where = ''): Promise<string> {
  const text = await textOfTopDialog(page);
  if (!text) return '';

  const buttons = [/^OK$/i, /^Yes, proceed$/i, /^Cancel$/i, /^Confirm$/i, /^\s+Confirm$/i];
  for (const b of buttons) {
    if (await clickDialogButton(page, b, 3000)) {
      console.log(`[${new Date().toLocaleTimeString()}] ✅ Modal closed${where ? ` after ${where}` : ''}`);
      return text;
    }
  }
  console.log(`[${new Date().toLocaleTimeString()}] ⚠️ No matching button found in dialog during ${where}`);
  return text;
}

/**
 * When the final “Error … no personal email …” pops, we need:
 *   1) Click OK on the error dialog
 *   2) Re-focus the underlying “Are you sure?” dialog and click Cancel
 */
export async function resolveErrorThenCancelUnderlyingConfirm(page: Page, log: (s: string) => void) {
  // 1) Error → OK
  const topText = await textOfTopDialog(page);
  if (!topText) return;

  if (/unable to generate offboarding ticket|no personal email|error/i.test(topText)) {
    log(`🧠 Error dialog: ${topText}`);
    const okDone = await clickDialogButton(page, /^OK$/i, 4000);
    if (!okDone) {
      log('⚠️ Could not click OK on error dialog');
      return;
    }
    log('✅ OK on error dialog clicked');
  }

  // 2) Underlying confirm → Cancel
  // Give the underlying dialog a tick to be “topmost”
  await page.waitForTimeout(400);
  const confirmText = await textOfTopDialog(page);
  if (/are you sure/i.test(confirmText)) {
    log(`🧠 Underlying confirm re-exposed: ${confirmText}`);
    // “activate” by clicking the dialog body if needed
    try {
      const dlg = page.getByRole('dialog');
      await dlg.click({ position: { x: 10, y: 10 } }).catch(() => {});
    } catch {}
    const cancelled = await clickDialogButton(page, /^Cancel$/i, 4000);
    if (cancelled) {
      log('✅ Clicked Cancel on underlying confirm');
    } else {
      log('⚠️ Could not click Cancel on underlying confirm; trying “Close” fallback');
      await clickDialogButton(page, /^Close$/i, 2000);
    }
  }
}

/** Tiny helper for “probe” screenshots while waiting on flaky UIs. */
export async function probeScreens(page: Page, dir: string, tag: string, count = 3, gapMs = 800) {
  for (let i = 1; i <= count; i++) {
    try { await page.screenshot({ path: `${dir}/${tag}_${i}.png`, fullPage: false }); } catch {}
    await page.waitForTimeout(gapMs);
  }
}