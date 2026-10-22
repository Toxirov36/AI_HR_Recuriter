import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { changeLanguage } from '../../i18n';
import { CandidateIntakePanel } from './candidate-intake';

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

describe('CandidateIntakePanel', () => {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];

  beforeEach(async () => {
    await changeLanguage('en');
    calls.length = 0;
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit = {}) => {
      const method = (init.method ?? 'GET').toUpperCase();
      calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith('/candidate-link')) return json({ url: 'https://t.me/hr_bot?start=join_abc' });
      return json({ ok: true });
    }));
  });
  afterEach(async () => {
    cleanup();
    vi.unstubAllGlobals();
    await changeLanguage('uz');
  });

  it('shows the bot link for candidates', async () => {
    render(<CandidateIntakePanel />);
    await waitFor(() => expect(screen.getByLabelText('Bot link for candidates')).toHaveValue('https://t.me/hr_bot?start=join_abc'));
  });

  it('turns automatic channel posting on and off', async () => {
    render(<CandidateIntakePanel />);
    const toggle = await screen.findByRole('checkbox', { name: /Post active vacancies to Telegram channels automatically/ });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(calls.find((call) => call.method === 'PUT')).toMatchObject({ url: '/api/v1/integrations/telegram/auto-publish', body: { enabled: true } });
  });
});
