// tests/utils/modalUtils.ts
import { Page, Locator } from '@playwright/test';

/** Find the currently visible topmost dialog (dialog or alertdialog). */
async function getTopDialog(page: Page): Promise<Locator | null> {
  const candidates: Array<() => Locator> = [
    () => page.getByRole('dialog'),
    () => page.getByRole('alertdialog'),
  ];
  for (const get of candidates) {
    const dlg = get().first();
    const visible = await dlg.isVisible({ timeout: 250 }).catch(() => false);
    if (visible) return dlg;
  }
  return null;
}

/** Returns trimmed textContent of the top visible dialog, else ''. */
export async function textOfTopDialog(page: Page): Promise<string> {
  const dlg = await getTopDialog(page);
  if (!dlg) return '';
  const txt = await dlg.textContent().catch(() => '');
  return (txt ?? '').trim();
}

/** Click a button within a given dialog using multiple strategies + wait for hide. */
async function clickDialogButtonInternal(
  dlg: Locator,
  name: RegExp,
  timeout = 5000
): Promise<boolean> {
  // 0) Ensure focus by tapping inside the dialog
  try { await dlg.click({ position: { x: 8, y: 8 } }); } catch {}

  // 1) role=button
  try {
    const btn = dlg.getByRole('button', { name });
    await btn.waitFor({ state: 'visible', timeout });
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    await btn.click({ trial: false });
    await dlg.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    return true;
  } catch {}

  // 2) text within dialog
  try {
    const btn = dlg.getByText(name, { exact: false });
    await btn.waitFor({ state: 'visible', timeout: Math.max(1500, Math.floor(timeout / 2)) });
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    await btn.click({ trial: false });
    await dlg.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    return true;
  } catch {}

  // 3) CSS fallback
  try {
    const btn = dlg.locator('button', { hasText: name });
    await btn.waitFor({ state: 'visible', timeout: 1200 });
    await btn.click({ trial: false });
    await dlg.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    return true;
  } catch {}

  return false;
}

async function clickDialogButton(page: Page, name: RegExp, timeout = 5000): Promise<boolean> {
  const dlg = await getTopDialog(page);
  if (!dlg) return false;
  return clickDialogButtonInternal(dlg, name, timeout);
}

/**
 * Handle currently visible modal(s). Returns dialog text (if any).
 * Tries buttons in order: OK → Yes, proceed → Cancel → Confirm (icon or plain)
 * Polls briefly, so late-rendering dialogs don’t hang you.
 */
export async function handleAnyModals(
  page: Page,
  where = '',
  overallTimeoutMs = 6000
): Promise<string> {
  const start = Date.now();
  let lastText = '';
  const buttons = [/^OK$/i, /^Yes,?\s*proceed$/i, /^Cancel$/i, /^Confirm$/i, /^\s*Confirm$/i];

  while (Date.now() - start < overallTimeoutMs) {
    const dlg = await getTopDialog(page);
    if (!dlg) { await page.waitForTimeout(200); continue; }

    // bring to front
    try { await dlg.click({ position: { x: 6, y: 6 } }); } catch {}

    const text = (await dlg.textContent().catch(() => ''))?.trim() ?? '';
    lastText = text;

    for (const b of buttons) {
      if (await clickDialogButtonInternal(dlg, b, 2500)) {
        console.log(`[${new Date().toLocaleTimeString()}] ✅ Modal closed${where ? ` after ${where}` : ''}`);
        return text;
      }
    }

    console.log(`[${new Date().toLocaleTimeString()}] ⚠️ No matching button in dialog during ${where}; retrying...`);
    await page.waitForTimeout(250);
  }

  if (lastText) {
    console.log(`[${new Date().toLocaleTimeString()}] ⚠️ Modal remained after timeout during ${where}; text: ${lastText.slice(0, 160)}`);
  }
  return lastText;
}

/**
 * On “no personal email / unable to generate ticket”:
 *   1) Click OK on the error dialog
 *   2) Re-focus underlying “Are you sure?” confirm and click Cancel
 * Includes retries; returns true if error dialog was seen (so caller can mark “blocked”).
 */
export async function resolveErrorThenCancelUnderlyingConfirm(
  page: Page,
  log: (s: string) => void
): Promise<boolean> {
  let sawError = false;

  // 1) Wait for and clear the error dialog
  const errorDeadline = Date.now() + 8000;
  while (Date.now() < errorDeadline) {
    const txt = await textOfTopDialog(page);
    if (!txt) { await page.waitForTimeout(150); continue; }

    if (/unable to generate offboarding ticket|no personal email|error/i.test(txt)) {
      log(`🧠 Error dialog: ${txt}`);
      const ok = await clickDialogButton(page, /^OK$/i, 4000);
      if (ok) log('✅ OK on error dialog clicked');
      else    log('⚠️ Could not click OK on error dialog (will continue)');
      sawError = true;
      break;
    }

    // Clear unrelated dialogs so we can reach the error
    await handleAnyModals(page, 'non-error dialog while waiting for error', 1500);
  }

  // 2) Re-expose underlying confirm and cancel it
  await page.waitForTimeout(400);
  const confirmDeadline = Date.now() + 6000;

  while (Date.now() < confirmDeadline) {
    const dlg = await getTopDialog(page);
    const txt = dlg ? (await dlg.textContent().catch(() => '') ?? '').trim() : '';
    if (!txt) { await page.waitForTimeout(150); continue; }

    if (/are you sure/i.test(txt)) {
      log(`🧠 Underlying confirm re-exposed: ${txt}`);
      try { await dlg!.click({ position: { x: 10, y: 10 } }); } catch {}
      if (await clickDialogButtonInternal(dlg!, /^Cancel$/i, 4000)) {
        log('✅ Clicked Cancel on underlying confirm');
      } else {
        log('⚠️ Could not click Cancel on underlying confirm; trying Close');
        await clickDialogButtonInternal(dlg!, /^Close$/i, 2500);
      }
      break;
    }

    await handleAnyModals(page, 'unexpected dialog while seeking underlying confirm', 1500);
  }

  if (sawError === true) {
    // best-effort check whether confirm was still around and needed a nudge
    // (don’t fail the run — just log & move on)
    // no-op: handled above in loops
  } else {
    // no error seen; nothing else to cancel
  }

  return sawError;
}

/** Probe screenshots helper while waiting on flaky UIs. */
export async function probeScreens(page: Page, dir: string, tag: string, count = 3, gapMs = 800) {
  for (let i = 1; i <= count; i++) {
    try { await page.screenshot({ path: `${dir}/${tag}_${i}.png`, fullPage: false }); } catch {}
    await page.waitForTimeout(gapMs);
  }
}