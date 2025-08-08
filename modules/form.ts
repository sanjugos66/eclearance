import { selectDropdown } from './dropdowns';

export async function handleAction(page, action) {
  const { type, field, value } = action;
  switch (type) {
    case "type":
      await page.fill(`label:has-text("${field}") + input`, value);
      break;
    case "select":
      await selectDropdown(page, field, value);
      break;
    case "click":
      await page.click(`text="${field}"`);
      break;
  }
}