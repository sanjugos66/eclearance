export async function login(page) {
  const username = 'sgoswami@connextglobal.com';
  const password = 'P@ssword123!'; // ✅ Hardcoded here now

  await page.goto('https://test-megatool.connextglobal.com/login?return=%2Fhome');
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'LOG IN' }).click();

  // Retry with known good password if needed
  if (await page.getByRole('button', { name: 'OK' }).isVisible({ timeout: 2000 })) {
    await page.getByRole('button', { name: 'OK' }).click();
    await page.fill('#username', username);
    await page.fill('#password', 'P@ssword123!');
    await page.getByRole('button', { name: 'LOG IN' }).click();
  }

  await page.waitForURL('**/home');
}