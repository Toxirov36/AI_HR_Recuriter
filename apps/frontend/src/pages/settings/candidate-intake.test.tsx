import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { changeLanguage } from '../../i18n';
import { CandidateIntakePanel } from './candidate-intake';

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

describe('CandidateIntakePanel', () => {
  let fields: Array<{ id: number; name: string; sortOrder: number; isActive: boolean; _count: { vacancies: number } }>;
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];

  beforeEach(async () => {
    await changeLanguage('en');
    fields = [{ id: 1, name: 'SMM', sortOrder: 0, isActive: true, _count: { vacancies: 2 } }];
    calls.length = 0;
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit = {}) => {
      const method = (init.method ?? 'GET').toUpperCase();
      calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith('/candidate-link')) return json({ url: 'https://t.me/hr_bot?start=join_abc' });
      if (url.endsWith('/vacancy-fields') && method === 'GET') return json(fields);
      if (url.endsWith('/vacancy-fields') && method === 'POST') {
        fields = [...fields, { id: 2, name: 'IT', sortOrder: 1, isActive: true, _count: { vacancies: 0 } }];
        return json({ id: 2 });
      }
      return json({ ok: true });
    }));
  });
  afterEach(async () => {
    cleanup();
    vi.unstubAllGlobals();
    await changeLanguage('uz');
  });

  it('shows the bot link and the existing fields', async () => {
    render(<CandidateIntakePanel />);
    expect(await screen.findByText('SMM')).toBeInTheDocument();
    expect(screen.getByText('2 vacancies')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Bot link for candidates')).toHaveValue('https://t.me/hr_bot?start=join_abc'));
  });

  it('adds a field', async () => {
    render(<CandidateIntakePanel />);
    await screen.findByText('SMM');
    fireEvent.change(screen.getByPlaceholderText('For example: SMM, IT, Videographer'), { target: { value: ' IT ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('IT')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ name: 'IT', sortOrder: 1 });
  });
});
