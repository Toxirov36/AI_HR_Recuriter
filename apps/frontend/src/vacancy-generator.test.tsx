import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VacancyForm } from './vacancies';
import { VacancyGenerator } from './vacancy-generator';
import { AuthContext } from './auth';
import type { User } from './types';
import { send } from './api';
vi.mock('./api', () => ({ send: vi.fn() }));
const draft = {
  title: 'Middle NestJS developer',
  description: 'NestJS yordamida backend API yaratish.',
  requirements: [{ name: 'TypeScript', description: 'REST API tajribasi', required: true }],
};
describe('AI vacancy drafts', () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(cleanup);
  it('previews a draft, fills editable fields only on apply, then saves through the normal form', async () => {
    vi.mocked(send).mockResolvedValue(draft);
    const saved = vi.fn();
    render(
      <AuthContext.Provider value={{ user: { aiConfigured: true } as User, refresh: vi.fn() }}>
        <VacancyForm value={null} close={vi.fn()} saved={saved} />
      </AuthContext.Provider>,
    );
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Existing title' } });
    fireEvent.change(screen.getByLabelText('Who are you hiring?'), {
      target: { value: 'Middle NestJS developer kerak' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate job description' }));
    await screen.findByRole('button', { name: 'Use draft' });
    expect(screen.getByLabelText('Job title')).toHaveValue('Existing title');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('/vacancies/generate-description', {
      brief: 'Middle NestJS developer kerak',
      language: 'uz',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use draft' }));
    expect(screen.getByLabelText('Job title')).toHaveValue(draft.title);
    expect(screen.getByLabelText('Description')).toHaveValue(draft.description);
    expect(screen.getByLabelText('Requirement 1')).toHaveValue('TypeScript');
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Edited title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save vacancy' }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(send).toHaveBeenLastCalledWith(
      '/vacancies',
      { ...draft, title: 'Edited title', status: 'ACTIVE' },
      'POST',
    );
  });
  it('keeps the brief after a provider error so the user can retry', async () => {
    vi.mocked(send).mockRejectedValue(new Error('Gemini is temporarily unavailable.'));
    render(<VacancyGenerator configured disabled={false} apply={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Who are you hiring?'), {
      target: { value: 'Backend developer kerak' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate job description' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Who are you hiring?')).toHaveValue('Backend developer kerak');
    expect(screen.getByRole('button', { name: 'Generate job description' })).toBeEnabled();
  });
  it('disables generation when Gemini is not configured', () => {
    render(<VacancyGenerator configured={false} disabled={false} apply={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Who are you hiring?'), {
      target: { value: 'Middle NestJS developer kerak' },
    });
    expect(screen.getByRole('button', { name: 'Generate job description' })).toBeDisabled();
    expect(send).not.toHaveBeenCalled();
  });
});
