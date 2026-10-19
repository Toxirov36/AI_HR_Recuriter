import { expect, test } from '@playwright/test';

test('public landing stays available when the session API fails and opens registration', async ({
  page,
}) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.goto('/');
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Get started free' }).first().click();
  await expect(page).toHaveURL(/\/register$/);
});

test('guest routes to login and old invitation links still open registration', async ({ page }) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"user":null}' }),
  );
  await page.goto('/vacancies');
  await expect(page).toHaveURL(/\/login\?next=%2Fvacancies$/);
  await expect(page.getByLabel('Work email')).toBeVisible();
  await page.goto(`/?invite=${'a'.repeat(64)}`);
  await expect(page.getByRole('button', { name: 'Join workspace' })).toBeVisible();
  await page.goto(`/register?invite=${'b'.repeat(64)}`);
  await expect(page.getByRole('button', { name: 'Join workspace' })).toBeVisible();
});

test('signed-in visitors to the landing are sent to the dashboard', async ({ page }) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 1, fullName: 'HR User', role: 'ADMIN', company: { id: 1, name: 'Example' } },
      }),
    }),
  );
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('login returns a guest to the requested workspace page', async ({ page }) => {
  let signedIn = false;
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: signedIn
          ? { id: 1, fullName: 'HR User', role: 'ADMIN', company: { id: 1, name: 'Example' } }
          : null,
      }),
    }),
  );
  await page.route('**/api/auth/login', (route) => {
    signedIn = true;
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/vacancies');
  await page.getByLabel('Work email').fill('hr@example.com');
  await page.locator('input[name="password"]').fill('example-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/vacancies$/);
});

test('landing content can be viewed in every supported language', async ({ page }) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"user":null}' }),
  );
  await page.goto('/');
  for (const [language, heading] of [
    ['O‘zbekcha', 'Yollash jarayonini ravshanroq boshqaring.'],
    ['Русский', 'Больше ясности в каждом решении о найме.'],
    ['English', 'Bring clarity to every hiring decision.'],
    ['Тоҷикӣ', 'Қарорҳои қабул ба корро равшантар кунед.'],
  ]) {
    await page.getByRole('button', { name: /Select language/ }).click();
    await page.getByRole('menuitem', { name: language }).click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
});
