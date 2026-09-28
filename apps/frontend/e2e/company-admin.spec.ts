import { test, expect, request } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const { config } = require('dotenv');
config({ path: new URL('../../../.env', import.meta.url), quiet: true });

test('company admin settings, tenant isolation, roles and session blocking', async ({ page, baseURL }) => {
  const headers = { 'X-Requested-With': 'recruiter-web', Origin: baseURL! };
  const admin = await request.newContext({ baseURL, extraHTTPHeaders: headers });
  const colleague = await request.newContext({ baseURL, extraHTTPHeaders: headers });
  const other = await request.newContext({ baseURL, extraHTTPHeaders: headers });
  const suffix = randomBytes(8).toString('hex');
  const password = randomBytes(16).toString('hex');
  const companyIds: number[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const register = await admin.post('/api/auth/register', { data: { companyName: 'Admin Panel QA', fullName: 'QA Admin', email: `admin-${suffix}@example.com`, password } });
    expect(register.status()).toBe(201);
    const owner = await register.json(); companyIds.push(owner.companyId);
    const another = await other.post('/api/auth/register', { data: { companyName: 'Other QA Company', fullName: 'Other Admin', email: `other-${suffix}@example.com`, password } });
    expect(another.status()).toBe(201);
    const otherOwner = await another.json(); companyIds.push(otherOwner.companyId);
    const invitation = await admin.post('/api/auth/invitations', { data: { email: `member-${suffix}@example.com`, role: 'HR' } });
    const token = new URL((await invitation.json()).inviteUrl).searchParams.get('invite');
    const accepted = await colleague.post('/api/auth/accept-invitation', { data: { token, fullName: 'QA Recruiter', password } });
    expect(accepted.status()).toBe(201);
    const member = await accepted.json();

    expect((await colleague.get('/api/company-admin')).status()).toBe(403);
    expect((await admin.put(`/api/company-admin/members/${otherOwner.id}`, { data: { role: 'HR', isActive: false } })).status()).toBe(404);
    expect((await admin.put(`/api/company-admin/members/${owner.id}`, { data: { role: 'HR', isActive: false } })).status()).toBe(409);

    await page.goto('/');
    await page.getByLabel('Work email').fill(`admin-${suffix}@example.com`);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('link', { name: 'Admin panel', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Kompaniya admin paneli' })).toBeVisible();
    await expect(page.getByLabel('Kompaniya nomi', { exact: true })).toHaveValue('Admin Panel QA');
    await page.getByLabel('Kompaniya nomi', { exact: true }).fill('Admin Panel QA Updated');
    await page.getByLabel('Saqlash muddati (kun)').fill('365');
    await page.getByRole('button', { name: 'Sozlamalarni saqlash' }).click();
    await expect(page.getByText('Kompaniya sozlamalari saqlandi')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Kompaniya nomi', { exact: true })).toHaveValue('Admin Panel QA Updated');
    await expect(page.getByLabel('Saqlash muddati (kun)')).toHaveValue('365');
    await page.screenshot({ path: test.info().outputPath('admin-desktop.png'), fullPage: true });

    await page.getByRole('tab', { name: /Jamoa va Rollar/ }).click();
    await page.getByRole('button', { name: 'QA Recruiter ruxsatlarini boshqarish' }).click();
    await page.getByLabel('Rol', { exact: true }).selectOption('RECRUITER');
    await page.getByLabel('Tizimga kirishga ruxsat berish').uncheck();
    await page.getByRole('button', { name: 'O‘zgarishlarni tasdiqlash' }).click();
    await expect(page.getByText('Bloklangan', { exact: true })).toBeVisible();
    expect((await colleague.get('/api/auth/me')).status()).toBe(401);
    expect((await colleague.post('/api/auth/login', { data: { email: `member-${suffix}@example.com`, password } })).status()).toBe(401);
    const logs = await (await admin.get('/api/v1/audit-logs')).json();
    expect(logs.items.some((entry: any) => entry.action === 'MEMBER_ACCESS_UPDATED')).toBe(true);
    expect(logs.items.some((entry: any) => entry.action === 'COMPANY_SETTINGS_UPDATED')).toBe(true);
    expect((await (await other.get('/api/company-admin')).json()).company.name).toBe('Other QA Company');

    await page.getByRole('button', { name: 'QA Recruiter ruxsatlarini boshqarish' }).click();
    await page.getByLabel('Tizimga kirishga ruxsat berish').check();
    await page.getByRole('button', { name: 'O‘zgarishlarni tasdiqlash' }).click();
    await expect(page.getByText('Bloklangan', { exact: true })).toHaveCount(0);
    expect((await colleague.post('/api/auth/login', { data: { email: `member-${suffix}@example.com`, password } })).status()).toBe(201);
    expect((await colleague.get('/api/company-admin')).status()).toBe(403);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('tab', { name: 'Umumiy ko‘rinish' }).click();
    await expect(page.getByLabel('Kompaniya nomi', { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('admin-mobile.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await admin.dispose(); await colleague.dispose(); await other.dispose();
    if (companyIds.length) {
      const db = new Client({ connectionString: process.env.DATABASE_URL });
      await db.connect();
      try {
        await db.query('BEGIN');
        for (const table of ['AuditLog', 'Invitation', 'User']) await db.query(`DELETE FROM "${table}" WHERE "companyId" = ANY($1::int[])`, [companyIds]);
        await db.query('DELETE FROM "Company" WHERE id = ANY($1::int[])', [companyIds]);
        await db.query('COMMIT');
      } finally { await db.end(); }
    }
  }
});
