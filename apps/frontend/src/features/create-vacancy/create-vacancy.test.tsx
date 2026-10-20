import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VacancyGenerator } from './index';
import { send } from '../../lib/api';
import { changeLanguage } from '../../i18n';

vi.mock('../../lib/api', () => ({ send: vi.fn() }));

const draft = {
  title: 'Middle NestJS developer',
  description: 'NestJS yordamida backend API yaratish.',
  requirements: [{ name: 'TypeScript', description: 'REST API tajribasi', required: true }],
};

describe('VacancyGenerator feature', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await changeLanguage('en');
  });
  afterEach(async () => {
    cleanup();
    await changeLanguage('uz');
  });

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

  it('renders microphone button and handles mic permissions gracefully', async () => {
    render(<VacancyGenerator configured={true} disabled={false} apply={vi.fn()} />);

    const micBtn = screen.getByRole('button', { name: /Record voice/i });
    expect(micBtn).toBeInTheDocument();
    expect(micBtn).toBeEnabled();

    // Clicking mic when navigator.mediaDevices is not available triggers permission alert
    fireEvent.click(micBtn);
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('correctly translates form labels into Uzbek, Russian and Tajik', async () => {
    await changeLanguage('uz');
    const { unmount: unmountUz } = render(
      <VacancyGenerator configured={true} disabled={false} apply={vi.fn()} />,
    );
    expect(screen.getByLabelText('Kimni ishga qidiryapsiz?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vakansiya tavsifini yaratish' })).toBeInTheDocument();
    unmountUz();

    await changeLanguage('ru');
    const { unmount: unmountRu } = render(
      <VacancyGenerator configured={true} disabled={false} apply={vi.fn()} />,
    );
    expect(screen.getByLabelText('Кого вы ищете?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сгенерировать описание вакансии' })).toBeInTheDocument();
    unmountRu();

    await changeLanguage('tg');
    const { unmount: unmountTg } = render(
      <VacancyGenerator configured={true} disabled={false} apply={vi.fn()} />,
    );
    expect(screen.getByLabelText('Шумо киро ба кор меҷӯед?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Эҷоди тавсифи вакансия' })).toBeInTheDocument();
    unmountTg();
  });
});
