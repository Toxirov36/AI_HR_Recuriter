import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
test('review workflow saves notes, advances stages and records history', async ({ page }) => {
  const suffix = randomBytes(6).toString('hex');
  const headers = { 'X-Requested-With': 'recruiter-web' };
  await page.goto('/');
  const registered = await page.request.post('/api/auth/register', {
    headers,
    data: {
      companyName: `Review test ${suffix}`,
      fullName: 'Review Tester',
      email: `review-${suffix}@example.com`,
      password: randomBytes(20).toString('hex'),
    },
  });
  expect(registered.ok()).toBeTruthy();
  const vacancy = await (
    await page.request.post('/api/vacancies', {
      headers,
      data: {
        title: 'Test engineer',
        description: 'Build APIs',
        requirements: [{ name: 'NestJS' }],
      },
    })
  ).json();
  const candidate = await (
    await page.request.post('/api/candidates', {
      headers,
      data: { fullName: 'Workflow Test Candidate' },
    })
  ).json();
  const app = await (
    await page.request.post('/api/applications', {
      headers,
      data: { candidateId: candidate.id, vacancyId: vacancy.id },
    })
  ).json();
  try {
    await page.route(`**/api/applications/${app.id}`, async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.interviewQuestions = {
        questions: [
          {
            question: 'How did you build the API?',
            rationale: 'Understand relevant experience.',
            requirementId: null,
          },
        ],
      };
      await route.fulfill({ response, json: body });
    });
    await page.goto(`/applications/${app.id}`);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Move to Reviewing', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pipeline stage' })).toHaveText('Reviewing');
    await expect(page.getByText('New → Reviewing', { exact: true })).toBeVisible();
    await page
      .getByRole('textbox', { name: 'Candidate answer', exact: true })
      .fill('I used NestJS and request validation.');
    await page
      .getByRole('textbox', { name: 'HR notes', exact: true })
      .fill('Discuss integration tests.');
    await page
      .getByRole('textbox', { name: 'Overall interview notes', exact: true })
      .fill('Arrange a technical follow-up.');
    await expect(
      page.getByRole('button', { name: 'Move to Interview', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Save interview notes', exact: true }).click();
    await expect(page.getByText(/Saved by Review Tester/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Candidate answer', exact: true })).toHaveValue(
      'I used NestJS and request validation.',
    );
    await expect(page.getByRole('textbox', { name: 'HR notes', exact: true })).toHaveValue(
      'Discuss integration tests.',
    );
    await expect(
      page.getByRole('textbox', { name: 'Overall interview notes', exact: true }),
    ).toHaveValue('Arrange a technical follow-up.');
    await page.screenshot({ path: '../../.local/review-workflow-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(async () => page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right))
      .toBeLessThanOrEqual(0);
    await expect(
      page.getByRole('button', { name: 'Move to Interview', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.screenshot({ path: '../../.local/review-workflow-mobile.png', fullPage: true });
    const stage = page.getByRole('button', { name: 'Pipeline stage' });
    await stage.click();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('menuitem', { name: 'Hired' }).click();
    await expect(stage).toHaveText('Hired');
    await expect(page.getByRole('button', { name: /^Move to / })).toHaveCount(0);
  } finally {
    await page.request.delete(`/api/candidates/${candidate.id}`, { headers });
    await page.request.delete(`/api/vacancies/${vacancy.id}`, { headers });
  }
});
