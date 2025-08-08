export async function createOffboardingTicket(page, employeeName: string) {
  await page.getByRole('link', { name: ' Staff Center' }).click();
  await page.getByRole('link', { name: ' My Staff' }).click();
  await page.getByRole('tab', { name: ' Offboarding' }).click();
  await page.getByText('Create offboarding ticket', { exact: true }).click();

  const [last, first] = employeeName.split(',').map(s => s.trim());

  await page.locator('#createOffboardingTicket span').nth(2).click();
  await page.getByRole('combobox').fill(last);
  await page.waitForTimeout(1000);

  const dropdownOptions = page.locator('div[role="option"]');
  const optionCount = await dropdownOptions.count();

  if (optionCount === 0) {
    console.log(`❌ No dropdown options detected for "${last}".`);
    await page.screenshot({ path: `screenshots/${first}_no_dropdown.png` });
    return { result: 'no-selection', message: 'No dropdown entries appeared' };
  }

  const options = await dropdownOptions.allInnerTexts();
  console.log(`🔍 Dropdown options for "${last}":`, options);

  const match = dropdownOptions.filter({ hasText: employeeName }).first();

  if (await match.isVisible()) {
    console.log(`✅ Hover + click on matched item: ${employeeName}`);
    await match.hover();
    await match.click({ force: true });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
  } else {
    console.log(`⚠️ No exact match — fallback with ArrowDown/Enter`);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
  }

  // Click the Create Ticket button
  await page.mouse.click(50, 50);
  await page.waitForTimeout(300);
  try {
    await page.getByRole('button', { name: ' Create Ticket' }).click({ timeout: 3000 });
  } catch (e) {
    console.log('⚠️ Retry Create Ticket click after blur...');
    await page.getByRole('combobox').press('Tab');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: ' Create Ticket' }).click();
  }

  // Wait for error modal OR timeout (Promise.race)
  const errorModal = page.getByRole('dialog', { name: 'Error' });

  let modalAppeared = false;
  try {
    await Promise.race([
      errorModal.waitFor({ state: 'visible', timeout: 6000 }),
      page.waitForTimeout(6000),
    ]);
    modalAppeared = await errorModal.isVisible();
  } catch (e) {
    modalAppeared = false;
  }

  if (modalAppeared) {
    const errorText = (await errorModal.textContent())?.trim();
    console.log('❌ Error modal appeared:', errorText);
    await page.getByRole('button', { name: 'OK' }).click();

    if (errorText?.includes('already has an active offboarding ticket')) {
      return { result: 'duplicate', message: errorText };
    } else if (errorText?.includes('Please select a user')) {
      return { result: 'no-selection', message: errorText };
    } else {
      return { result: 'error', message: errorText };
    }
  }

  // Screenshot after submit for tracking
  await page.screenshot({ path: `screenshots/${first.replace(/\\s+/g, '_')}_submission.png` });

  // Check for ticket presence on dashboard
  const ticketVisible = await page.locator(`text=${first}`).first().isVisible({ timeout: 3000 }).catch(() => false);
  if (ticketVisible) {
    console.log(`🆗 Ticket visible for ${employeeName}`);
    return { result: 'created' };
  } else {
    console.log(`⚠️ Ticket not visible for ${employeeName} — might not have saved.`);
    return { result: 'uncertain' };
  }
}