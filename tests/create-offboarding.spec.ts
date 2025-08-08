import { test, expect } from '@playwright/test';
import { login } from '../modules/login';
import { createOffboardingTicket } from '../modules/offboarding';

test('Create Offboarding Ticket for Samantha', async ({ page }) => {
  await login(page, 'sgoswami@connextglobal.com', 'Password123!');
  await createOffboardingTicket(page, 'Chicco, Samantha May');
});