import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';

test('vacancy status select opens above the modal and updates the selected value', async ({
  page,
}) => {
  const suffix = randomBytes(6).toString('hex');
  const headers = { 'X-Requested-With': 'recruiter-web' };

  await page.goto('/');
  const registered = await page.request.post('/api/auth/register', {
    headers,
    data: {
      companyName: `Select test ${suffix}`,
      fullName: 'Select Tester',
      email: `select-${suffix}@example.com`,
      password: randomBytes(20).toString('hex'),
    },
  });
  expect(registered.ok()).toBeTruthy();

  await page.goto('/vacancies?new');
  const trigger = page.getByRole('combobox', { name: 'Status' });
  await trigger.click();
  await expect(page.getByRole('option', { name: 'Draft' })).toBeVisible();
  await page.getByRole('option', { name: 'Draft' }).click();
  await expect(trigger).toHaveText('Draft');
  await expect(page.getByRole('option', { name: 'Draft' })).toHaveCount(0);
});
