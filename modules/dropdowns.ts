export async function selectDropdown(page, label: string, value: string) {
  await page.click(`label:has-text("${label}") + div select`);
  await page.selectOption(`label:has-text("${label}") + div select`, { label: value });
}