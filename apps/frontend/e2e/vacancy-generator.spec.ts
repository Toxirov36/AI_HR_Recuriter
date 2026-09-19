import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
test('AI vacancy preview can be applied, edited and saved', async ({ page }) => {
  const suffix = randomBytes(6).toString('hex');
  const headers = { 'X-Requested-With': 'recruiter-web' };
  await page.goto('/');
  const registered = await page.request.post('/api/auth/register', {
    headers,
    data: {
      companyName: `Generator test ${suffix}`,
      fullName: 'Generator Tester',
      email: `generator-${suffix}@example.com`,
      password: randomBytes(20).toString('hex'),
    },
  });
  expect(registered.ok()).toBeTruthy();
  const draft = {
    title: 'Middle NestJS Developer',
    description:
      'Lavozim haqida\nNestJS yordamida backend xizmatlarini ishlab chiqish.\n\nVazifalar\n- REST API yaratish\n- Testlar yozish',
    requirements: [
      { name: 'NestJS va TypeScript', description: 'REST API yaratish tajribasi', required: true },
      { name: 'Docker', description: 'Konteynerlar bilan ishlash', required: false },
    ],
  };
  await page.route('**/api/vacancies/generate-description', async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      brief: 'Middle NestJS developer kerak',
      language: 'uz',
    });
    await route.fulfill({ json: draft });
  });
  await page.goto('/vacancies?new');
  await page.getByRole('tab', { name: 'AI draft' }).click();
  await page
    .getByRole('textbox', { name: 'Who are you hiring?' })
    .fill('Middle NestJS developer kerak');
  await page.getByRole('button', { name: 'Generate job description', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Use draft', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Job title', exact: true })).toHaveCount(0);
  await page.screenshot({
    path: '../../.local/vacancy-generator-desktop.png',
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('heading', { name: 'AI job description generator' })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: '../../.local/vacancy-generator-mobile.png',
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Use draft', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Job title', exact: true })).toHaveValue(
    draft.title,
  );
  await expect(page.getByRole('textbox', { name: 'Requirement 1', exact: true })).toHaveValue(
    'NestJS va TypeScript',
  );
  await page
    .getByRole('textbox', { name: 'Job title', exact: true })
    .fill('Middle NestJS Engineer');
  const saving = page.waitForResponse(
    (r) => r.url().endsWith('/api/vacancies') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create vacancy', exact: true }).click();
  const response = await saving;
  expect(response.status()).toBe(201);
  const vacancy = await response.json();
  try {
    expect(vacancy.title).toBe('Middle NestJS Engineer');
    expect(vacancy.requirements).toHaveLength(2);
    await expect(
      page.getByRole('heading', { name: 'Middle NestJS Engineer', exact: true }),
    ).toBeVisible();
  } finally {
    await page.request.delete(`/api/vacancies/${vacancy.id}`, { headers });
  }
});
