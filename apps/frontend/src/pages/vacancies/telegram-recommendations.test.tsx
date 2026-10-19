import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, send } from '../../lib/api';
import { TelegramRecommendations } from './telegram-recommendations';

vi.mock('../../lib/api', () => ({ api: vi.fn(), send: vi.fn() }));

const completed = {
  configured: true,
  run: {
    id: 8, status: 'COMPLETED', stale: false, error: null,
    createdAt: '2026-10-15T00:00:00.000Z', finishedAt: '2026-10-15T00:01:00.000Z',
    results: [
      { telegramId: '1', title: 'Dev Jobs', username: 'devjobs', url: 'https://t.me/devjobs', subscriberCount: 100, score: 90, reason: 'Dasturchi mavzulari ko‘p', evidencePosts: 10, checkedAt: '2026-10-15T00:00:00.000Z' },
      { telegramId: '2', title: 'Big Jobs', username: 'bigjobs', url: 'https://t.me/bigjobs', subscriberCount: 50000, score: 30, reason: 'Umumiy ish e’lonlari', evidencePosts: 2, checkedAt: '2026-10-15T00:00:00.000Z' },
    ],
  },
};

describe('Telegram channel recommendations', () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(api).mockResolvedValue(completed); });
  afterEach(cleanup);

  it('sorts fit and subscribers separately and opens the public channel', async () => {
    render(<TelegramRecommendations vacancyId={5} />);
    await screen.findByText('Dasturchi mavzulari ko‘p');
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', 'https://t.me/devjobs');
    expect(screen.getByRole('button', { name: 'Moslik' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Obunachilar' }));
    expect(screen.getByRole('button', { name: 'Obunachilar' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', 'https://t.me/bigjobs');
    expect(screen.getByText(/Obunachilar: 50,000/)).toBeInTheDocument();
  });

  it('marks results stale and starts a new run on request', async () => {
    vi.mocked(api).mockResolvedValue({ ...completed, run: { ...completed.run, stale: true } });
    vi.mocked(send).mockResolvedValue({ id: 9, status: 'QUEUED' });
    render(<TelegramRecommendations vacancyId={5} />);
    await screen.findByText(/Natijalar eskirgan/);
    fireEvent.click(screen.getByRole('button', { name: 'Tahlilni yangilash' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('/integrations/recruiting/vacancies/5/telegram/discover', {}));
  });
});
