import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { changeLanguage } from '../../i18n';
import { AssessmentModal } from './assessment-modal';
import type { Vacancy } from '../../types';

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
const questions = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  type: i < 5 ? 'HARD_SKILL' : 'SOFT_SKILL',
  question: `Question number ${i + 1}?`,
  options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
  correctIndex: 0,
  explanation: `Because reason ${i + 1}`,
}));
const vacancy = { id: 5, title: 'Backend Developer', status: 'ACTIVE' } as Vacancy;

describe('AssessmentModal', () => {
  const calls: Array<{ url: string; method: string; body?: any }> = [];
  let state: 'NONE' | 'PENDING' | 'APPROVED' = 'PENDING';

  beforeEach(async () => {
    await changeLanguage('en');
    calls.length = 0;
    state = 'PENDING';
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit = {}) => {
      const method = (init.method ?? 'GET').toUpperCase();
      calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith('/assessment/approve')) state = 'APPROVED';
      if (url.endsWith('/assessment/generate')) state = 'PENDING';
      return json({ state, questions: state === 'NONE' ? null : questions, approvedAt: state === 'APPROVED' ? '2026-10-22T10:00:00Z' : null });
    }));
  });
  afterEach(async () => {
    cleanup();
    vi.unstubAllGlobals();
    await changeLanguage('uz');
  });

  it('shows the drafted questions as waiting for approval, approves them and closes the dialog', async () => {
    const close = vi.fn();
    render(<AssessmentModal vacancy={vacancy} close={close} />);
    expect(await screen.findByText('Waiting for approval')).toBeInTheDocument();
    expect(screen.getByLabelText('Question 1')).toHaveValue('Question number 1?');
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(calls.some((call) => call.method === 'POST' && call.url.endsWith('/vacancies/5/assessment/approve'))).toBe(true);
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });

  it('saves edits before approving so the approved text is what HR saw', async () => {
    render(<AssessmentModal vacancy={vacancy} close={() => undefined} />);
    fireEvent.change(await screen.findByLabelText('Question 1'), { target: { value: 'An edited question?' } });
    expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith('/assessment/approve'))).toBe(true));
    const put = calls.find((call) => call.method === 'PUT');
    expect(put?.body.questions[0].question).toBe('An edited question?');
    expect(calls.findIndex((call) => call.method === 'PUT')).toBeLessThan(calls.findIndex((call) => call.url.endsWith('/assessment/approve')));
  });

  it('offers to generate when there is no test yet', async () => {
    state = 'NONE';
    render(<AssessmentModal vacancy={vacancy} close={() => undefined} />);
    expect(await screen.findByText('Test not created yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Generate with AI' }));
    expect(await screen.findByText('Waiting for approval')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST' && call.url.endsWith('/assessment/generate'))).toBe(true);
  });
});
