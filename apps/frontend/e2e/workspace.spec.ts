import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
test('register, create vacancy and candidate, review pipeline, invite teammate, mobile navigation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a workspace' }).click();
  await page.getByLabel('Company name').fill('Northstar Studio');
  await page.getByLabel('Full name', { exact: true }).fill('Alex Morgan');
  await page.getByLabel('Work email').fill(`browser-${randomBytes(6).toString('hex')}@example.com`);
  await page.getByLabel('Password').fill(randomBytes(24).toString('hex'));
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recruiting overview' })).toBeVisible();
  await page.getByRole('link', { name: 'Create vacancy', exact: true }).first().click();
  await page.getByLabel('Job title').fill('Senior backend engineer');
  await page
    .getByLabel('Description', { exact: true })
    .fill(
      'Help our team build thoughtful, reliable products. Own APIs, collaborate with designers, and make complex things feel simple.',
    );
  await page.getByLabel('Requirement 1', { exact: true }).fill('NestJS and TypeScript');
  await page
    .getByLabel('Requirement 1 details')
    .fill('Experience designing and delivering production APIs.');
  await page.getByRole('button', { name: 'Add requirement' }).click();
  await page.getByLabel('Requirement 2', { exact: true }).fill('PostgreSQL');
  await page.getByRole('button', { name: 'Create vacancy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Senior backend engineer' })).toBeVisible();
  await page.getByRole('link', { name: 'Candidates', exact: true }).click();
  await page.getByRole('button', { name: 'Add candidate', exact: true }).click();
  await page.getByLabel('Full name').fill('Jamie Chen');
  await page.getByLabel('Email', { exact: true }).fill('jamie@example.com');
  await page.getByRole('button', { name: 'Save candidate' }).click();
  await expect(page.getByText('Jamie Chen', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'View Jamie Chen' }).click();
  await expect(page.getByRole('heading', { name: 'Jamie Chen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Parse resume with AI' })).toBeDisabled();
  await page.getByRole('link', { name: 'Hiring pipeline', exact: true }).click();
  await page.getByRole('button', { name: 'New application' }).click();
  const candidateSelect = page.getByRole('combobox', { name: 'candidates', exact: true });
  await candidateSelect.click();
  await page.getByRole('option', { name: 'Jamie Chen', exact: true }).click();
  const vacancySelect = page.getByRole('combobox', { name: 'vacancies', exact: true });
  await vacancySelect.click();
  await page.getByRole('option', { name: 'Senior backend engineer', exact: true }).click();
  await page.getByRole('button', { name: 'Create application', exact: true }).click();
  await page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name: 'Jamie Chen' }) })
    .click();
  await expect(page.getByText('Evidence informs. People decide.')).toBeVisible();
  const stage = page.getByRole('button', { name: 'Pipeline stage' });
  await stage.click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('menuitem', { name: 'Interview', exact: true }).click();
  await expect(stage).toHaveText('Interview');
  await expect(page.getByRole('button', { name: 'Match CV evidence' })).toBeDisabled();
  await expect(page.getByText('Not analyzed', { exact: true })).toHaveCount(2);
  await page.getByRole('link', { name: 'Team & access' }).click();
  await page.getByLabel('Work email').fill(`invite-${randomBytes(5).toString('hex')}@example.com`);
  await page.getByRole('button', { name: 'Create invitation link' }).click();
  await expect(page.getByLabel('Invitation link')).toHaveValue(/invite=/);
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recruiting overview' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Review Jamie Chen' })).toBeVisible();
  await page.screenshot({
    path: '../../.local/dashboard-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Candidates', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Candidates', exact: true })).toBeVisible();
  await expect(page.locator('.sidebar')).not.toHaveClass(/visible/);
  await expect(page.getByText('Jamie Chen', { exact: true })).toBeVisible();
  await page.screenshot({
    path: '../../.local/candidates-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  expect(errors).toEqual([]);
});
