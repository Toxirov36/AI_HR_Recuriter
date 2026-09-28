import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VacancyGenerator } from './index';
import { send } from '../../lib/api';

vi.mock('../../lib/api', () => ({ send: vi.fn() }));

const draft = {
  title: 'Middle NestJS developer',
  description: 'NestJS yordamida backend API yaratish.',
  requirements: [{ name: 'TypeScript', description: 'REST API tajribasi', required: true }],
};

describe('VacancyGenerator feature', () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(cleanup);

  it('generates a draft and calls apply when use draft is clicked', async () => {
    vi.mocked(send).mockResolvedValue(draft);
    const apply = vi.fn();

    render(<VacancyGenerator configured={true} disabled={false} apply={apply} />);

    fireEvent.change(screen.getByLabelText('Who are you hiring?'), {
      target: { value: 'Middle NestJS developer kerak' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Generate job description' }));

    await screen.findByRole('button', { name: 'Use draft' });

    expect(send).toHaveBeenCalledWith('/vacancies/generate-description', {
      brief: 'Middle NestJS developer kerak',
      language: 'uz',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Use draft' }));
    expect(apply).toHaveBeenCalledWith(draft);
  });

  it('keeps the brief after a provider error so the user can retry', async () => {
    vi.mocked(send).mockRejectedValue(new Error('Gemini is temporarily unavailable.'));
    render(<VacancyGenerator configured={true} disabled={false} apply={vi.fn()} />);

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
