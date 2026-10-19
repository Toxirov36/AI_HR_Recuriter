import { test, expect } from '@playwright/test';

test('dashboard filters and vacancy editor remain usable at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.addInitScript(() => localStorage.setItem('shortlist_locale', localStorage.getItem('shortlist_locale') ?? 'en'));
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/auth/session')) return json({ user: { id: 1, fullName: 'HR Tester', role: 'ADMIN', companyId: 1, company: { name: 'Test Company' }, aiConfigured: false } });
    if (url.pathname.endsWith('/dashboard')) return json({ vacancies: 1, draftVacancies: 2, newApplications: 23, candidates: 25, applications: 30, stages: [{ status: 'NEW', _count: 23 }], recent: [] });
    if (url.pathname.endsWith('/vacancies')) return json({ items: url.searchParams.get('status') === 'DRAFT' ? [{ id: 1, title: 'Tish doktori', description: 'Stomatologik yordam', department: null, location: null, workModel: null, employmentType: null, seniority: null, status: 'DRAFT', createdAt: new Date().toISOString(), requirements: [], _count: { applications: 0 } }] : [], total: url.searchParams.get('status') === 'DRAFT' ? 1 : 0, page: 1, pageSize: 20 });
    if (url.pathname.endsWith('/applications')) return json({ items: [], total: 0, page: 1, pageSize: 20, stageCounts: { NEW: 23 } });
    return json({ items: [], total: 0, connected: false });
  });

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Recruiting overview' })).toBeVisible();
  const draftStart = await page.evaluate(() => performance.now());
  await page.getByRole('link', { name: /Draft vacancies/i }).click();
  await expect(page).toHaveURL(/\/vacancies\?status=DRAFT/);
  await expect(page.getByRole('heading', { name: 'Tish doktori' })).toBeVisible();
  const draftMs = await page.evaluate((start) => Math.round(performance.now() - start), draftStart);
  test.info().annotations.push({ type: 'dashboard-to-drafts-ms', description: String(draftMs) });
  await expect(page.getByText('Not specified').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Edit Tish doktori' }).click();
  const title = page.getByRole('dialog', { name: 'Edit vacancy' }).getByRole('textbox', { name: 'Vacancy title', exact: true });
  await expect(title).toHaveValue('Tish doktori');
  await expect(page.getByLabel('Department')).toHaveValue('');
  await expect(page.getByLabel('Location')).toHaveValue('');
  await title.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Department')).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Close' }).click();
  const sortedVacancies = page.waitForRequest((request) => request.url().includes('/api/vacancies?') && request.url().includes('sort=title'));
  await page.getByRole('combobox', { name: 'Sort vacancies' }).selectOption('title');
  await sortedVacancies;

  await page.goto('/dashboard');
  const applicationsStart = await page.evaluate(() => performance.now());
  await page.getByRole('link', { name: /New applications/i }).click();
  await expect(page).toHaveURL(/\/pipeline\?stage=NEW/);
  await expect(page.getByText('23').first()).toBeVisible();
  const applicationsMs = await page.evaluate((start) => Math.round(performance.now() - start), applicationsStart);
  test.info().annotations.push({ type: 'dashboard-to-new-applications-ms', description: String(applicationsMs) });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const locale of ['uz', 'ru', 'en', 'tg']) {
    await page.evaluate((value) => localStorage.setItem('shortlist_locale', value), locale);
    await page.reload();
    await expect(page.locator('.pipeline-summary-grid')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
