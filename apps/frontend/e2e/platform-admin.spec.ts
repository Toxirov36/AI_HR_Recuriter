import { test, expect, request } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
require('dotenv').config({ path: new URL('../../../.env', import.meta.url), quiet: true });

test('platform company management, access boundaries and suspension', async ({ page, baseURL }) => {
  const headers = { 'X-Requested-With': 'recruiter-web', Origin: baseURL! };
  const ownerApi = await request.newContext({ baseURL, extraHTTPHeaders: headers });
  const tenantApi = await request.newContext({ baseURL, extraHTTPHeaders: headers });
  const guest = await request.newContext({ baseURL, extraHTTPHeaders: headers });
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const suffix = randomBytes(7).toString('hex');
  const password = randomBytes(16).toString('hex');
  const companyIds: number[] = [];
  const companyName = `Platform QA Tenant ${suffix}`;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const ownerResponse = await ownerApi.post('/api/auth/register', {
      data: {
        companyName: `Platform QA Owner ${suffix}`,
        fullName: 'Platform QA Operator',
        email: `platform-${suffix}@example.com`,
        password,
      },
    });
    expect(ownerResponse.status()).toBe(201);
    const owner = await ownerResponse.json();
    companyIds.push(owner.companyId);
    const tenantResponse = await tenantApi.post('/api/auth/register', {
      data: {
        companyName,
        fullName: 'Platform QA Tenant Admin',
        email: `tenant-${suffix}@example.com`,
        password,
      },
    });
    expect(tenantResponse.status()).toBe(201);
    const tenant = await tenantResponse.json();
    companyIds.push(tenant.companyId);
    for (const path of ['overview', 'companies', 'audit']) {
      expect((await guest.get(`/api/platform-admin/${path}`)).status()).toBe(401);
      expect((await tenantApi.get(`/api/platform-admin/${path}`)).status()).toBe(403);
    }
    expect(
      (
        await tenantApi.put(`/api/company-admin/members/${tenant.id}`, {
          data: { role: 'ADMIN', isActive: true, platformRole: 'SUPER_ADMIN' },
        })
      ).status(),
    ).toBe(400);
    await db.query('UPDATE "User" SET "platformRole" = $1 WHERE id = $2', [
      'SUPER_ADMIN',
      owner.id,
    ]);
    expect(
      (
        await ownerApi.put(`/api/platform-admin/companies/${owner.companyId}/status`, {
          data: { isActive: false, expectedIsActive: true, reason: 'Self lockout test' },
        })
      ).status(),
    ).toBe(409);
    const response = await tenantApi.post('/api/vacancies', {
      data: {
        title: 'QA Vacancy',
        description: 'Synthetic vacancy',
        status: 'ACTIVE',
        requirements: [],
      },
    });
    expect(response.status()).toBe(201);
    const vacancy = await response.json();
    expect((await guest.get(`/api/public/vacancies/${vacancy.publicToken}`)).status()).toBe(200);
    const invite = await tenantApi.post('/api/auth/invitations', {
      data: { email: `pending-${suffix}@example.com`, role: 'HR' },
    });
    const inviteToken = new URL((await invite.json()).inviteUrl).searchParams.get('invite');

    await page.goto('/');
    await page.getByLabel('Work email').fill(`platform-${suffix}@example.com`);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('link', { name: 'Platforma admini', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Platforma admin paneli' })).toBeVisible();
    await page.getByLabel('Kompaniya qidirish').fill(suffix);
    await page.getByRole('button', { name: 'Qidirish', exact: true }).click();
    const row = page.getByRole('article', { name: `${companyName} kompaniyasi`, exact: true });
    await expect(row).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('platform-desktop.png'), fullPage: true });
    await row.getByRole('button', { name: 'Bloklash', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Tasdiqlash', exact: true })).toBeDisabled();
    await page.getByLabel('Sabab', { exact: true }).fill('Synthetic suspension verification');
    await page.getByRole('button', { name: 'Tasdiqlash', exact: true }).click();
    await expect(row.getByText('Bloklangan', { exact: true })).toBeVisible();
    expect((await tenantApi.get('/api/auth/me')).status()).toBe(401);
    expect(
      (
        await tenantApi.post('/api/auth/login', {
          data: { email: `tenant-${suffix}@example.com`, password },
        })
      ).status(),
    ).toBe(401);
    expect((await guest.get(`/api/public/vacancies/${vacancy.publicToken}`)).status()).toBe(404);
    expect(
      (
        await guest.post('/api/auth/accept-invitation', {
          data: { token: inviteToken, fullName: 'Pending QA', password },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await ownerApi.put(`/api/platform-admin/companies/${tenant.companyId}/status`, {
          data: { isActive: false, expectedIsActive: true, reason: 'Outdated request' },
        })
      ).status(),
    ).toBe(409);
    await page.getByLabel('Kompaniya holati').selectOption('blocked');
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Faollashtirish', exact: true }).click();
    await page.getByLabel('Sabab', { exact: true }).fill('Synthetic suspension check completed');
    await page.getByRole('button', { name: 'Tasdiqlash', exact: true }).click();
    await expect(
      page.getByText('Kompaniya topilmadi. Qidiruv yoki filtrni o‘zgartiring.'),
    ).toBeVisible();
    expect(
      (
        await tenantApi.post('/api/auth/login', {
          data: { email: `tenant-${suffix}@example.com`, password },
        })
      ).status(),
    ).toBe(201);
    expect((await guest.get(`/api/public/vacancies/${vacancy.publicToken}`)).status()).toBe(200);
    await page.getByRole('tab', { name: 'Amallar tarixi' }).click();
    await expect(
      page.getByText('Synthetic suspension verification', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Synthetic suspension check completed', { exact: true }),
    ).toBeVisible();
    await page.getByRole('tab', { name: 'Kompaniyalar', exact: true }).click();
    await page.getByLabel('Kompaniya holati').selectOption('all');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(row).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: test.info().outputPath('platform-mobile.png'),
      fullPage: true,
      animations: 'disabled',
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    // Deletion tests use only the isolated tenant created by this test.
    const candidateResponse = await tenantApi.post('/api/candidates', {
      data: { fullName: 'Deletion QA Candidate', email: `candidate-${suffix}@example.com` },
    });
    expect(candidateResponse.status()).toBe(201);
    const candidate = await candidateResponse.json();
    const applicationResponse = await tenantApi.post('/api/applications', {
      data: { candidateId: candidate.id, vacancyId: vacancy.id },
    });
    expect(applicationResponse.status()).toBe(201);
    const application = await applicationResponse.json();
    await db.query('UPDATE "Candidate" SET "resumeData"=$1, "resumeName"=$2 WHERE id=$3', [
      Buffer.from('synthetic-cv'),
      'qa.pdf',
      candidate.id,
    ]);
    await db.query(
      'INSERT INTO "Resume" ("companyId", "candidateId", "fileName", "status", "rawText", "updatedAt") VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING id',
      [tenant.companyId, candidate.id, 'old-qa.pdf', 'COMPLETED', 'Synthetic historical CV'],
    );
    await db.query(
      'INSERT INTO "CandidateEvent" ("companyId", "candidateId", "type", "label") VALUES ($1,$2,$3,$4)',
      [tenant.companyId, candidate.id, 'QA_EVENT', 'Synthetic event'],
    );
    await db.query(
      'INSERT INTO "TelegramBusinessConnection" (id,"companyId","userId","telegramUserId","userChatId","updatedAt") VALUES ($1,$2,$3,$4,$4,NOW())',
      [`deletion-qa-${suffix}`, tenant.companyId, tenant.id, '99999999'],
    );
    await db.query(
      'INSERT INTO "TelegramConnectRequest" ("companyId","userId",token,"expiresAt","updatedAt") VALUES ($1,$2,$3,NOW()+interval \'1 hour\',NOW())',
      [tenant.companyId, tenant.id, `deletion-qa-${suffix}`],
    );
    const deletionData = {
      confirmationName: companyName,
      reason: 'Synthetic deletion verification',
    };
    expect(
      (
        await tenantApi.delete(`/api/platform-admin/companies/${tenant.companyId}`, {
          data: deletionData,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await guest.delete(`/api/platform-admin/companies/${tenant.companyId}`, {
          data: deletionData,
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await ownerApi.delete(`/api/platform-admin/companies/${owner.companyId}`, {
          data: { ...deletionData, confirmationName: `Platform QA Owner ${suffix}` },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await ownerApi.delete(`/api/platform-admin/companies/${tenant.companyId}`, {
          data: { ...deletionData, confirmationName: 'Wrong name' },
        })
      ).status(),
    ).toBe(409);
    await page.getByRole('button', { name: 'Yangilash', exact: true }).click();
    await row.getByRole('button', { name: 'O‘chirish', exact: true }).click();
    await page.screenshot({
      path: test.info().outputPath('delete-company-mobile.png'),
      fullPage: true,
      animations: 'disabled',
    });
    const deletionResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        response.url().endsWith(`/api/platform-admin/companies/${tenant.companyId}`),
    );
    await page.getByRole('button', { name: 'Butunlay o‘chirish', exact: true }).click();
    expect((await deletionResponse).status()).toBe(200);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row).toHaveCount(0);
    expect((await tenantApi.get('/api/auth/me')).status()).toBe(401);
    expect((await guest.get(`/api/public/vacancies/${vacancy.publicToken}`)).status()).toBe(404);
    for (const table of [
      'User',
      'Candidate',
      'Resume',
      'CandidateEvent',
      'Vacancy',
      'Application',
      'Invitation',
      'TelegramBusinessConnection',
      'TelegramConnectRequest',
      'AuditLog',
    ]) {
      const count = await db.query(
        `SELECT count(*)::int AS total FROM "${table}" WHERE "companyId"=$1`,
        [tenant.companyId],
      );
      expect(count.rows[0].total).toBe(0);
    }
    expect(
      (
        await db.query(
          'SELECT count(*)::int AS total FROM "ApplicationStageChange" WHERE "applicationId"=$1',
          [application.id],
        )
      ).rows[0].total,
    ).toBe(0);
    expect(
      (
        await db.query('SELECT count(*)::int AS total FROM "Company" WHERE id=$1', [
          tenant.companyId,
        ])
      ).rows[0].total,
    ).toBe(0);
    expect((await ownerApi.get('/api/company-admin')).status()).toBe(200);
    const deletionAudit = await db.query(
      'SELECT action FROM "PlatformAuditLog" WHERE "companyId"=$1',
      [tenant.companyId],
    );
    expect(deletionAudit.rows.map((item: any) => item.action)).toEqual(
      expect.arrayContaining(['COMPANY_BLOCKED', 'COMPANY_REACTIVATED', 'COMPANY_DELETED']),
    );
    expect(
      (
        await ownerApi.delete(`/api/platform-admin/companies/${tenant.companyId}`, {
          data: deletionData,
        })
      ).status(),
    ).toBe(404);
    await db.query('UPDATE "User" SET "platformRole" = NULL WHERE id = $1', [owner.id]);
    expect((await ownerApi.get('/api/platform-admin/overview')).status()).toBe(403);
    expect(errors).toEqual([]);
  } finally {
    await ownerApi.dispose();
    await tenantApi.dispose();
    await guest.dispose();
    try {
      if (companyIds.length) {
        await db.query('BEGIN');
        for (const table of [
          'CompanyFileCleanup',
          'PlatformAuditLog',
          'AuditLog',
          'Invitation',
          'Application',
          'Vacancy',
          'Candidate',
          'TelegramConnectRequest',
          'TelegramBusinessConnection',
          'User',
        ])
          await db.query(`DELETE FROM "${table}" WHERE "companyId" = ANY($1::int[])`, [companyIds]);
        await db.query('DELETE FROM "Company" WHERE id = ANY($1::int[])', [companyIds]);
        await db.query('COMMIT');
      }
    } finally {
      await db.end();
    }
  }
});
