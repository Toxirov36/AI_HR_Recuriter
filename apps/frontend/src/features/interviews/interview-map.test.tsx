import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { changeLanguage } from '../../i18n';
import { api, send } from '../../lib/api';
import { PublicInterviewPage } from '../../pages/public-interview';
import type { Interview, PublicInterview } from '../../types';
import { InterviewPanel } from './interview-panel';
import { ScheduleInterviewDialog } from './schedule-interview-dialog';

vi.mock('../../lib/api', () => ({ send: vi.fn(), api: vi.fn(), ApiError: class ApiError extends Error {} }));

let interviews: Interview[] = [];
vi.mock('../../components/ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../components/ui')>();
  return {
    ...original,
    useData: vi.fn((url: string) =>
      url.includes('google-calendar') ? { data: { configured: true, connected: true, googleEmail: 'hr@acme.uz' }, error: '', reload: vi.fn() } : { data: interviews, error: '', reload: vi.fn() },
    ),
  };
});

const future = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const interview = (extra: Partial<Interview> = {}): Interview => ({
  id: 9, applicationId: 11, mode: 'OFFLINE', status: 'PROPOSED', durationMinutes: 30, timezone: 'Asia/Tashkent', location: 'Tashkent, Amir Temur 1', note: null,
  meetUrl: null, confirmedSlotId: null, confirmedAt: null, declinedAt: null, declineNote: null,
  slots: [{ id: 1, startsAt: future(26), endsAt: future(26.5) }], createdAt: future(-1), ...extra,
});

beforeEach(async () => {
  await changeLanguage('en');
  interviews = [];
  vi.mocked(send).mockReset();
  vi.mocked(api).mockReset();
});
afterEach(async () => {
  cleanup();
  await changeLanguage('uz');
});

describe('map link for offline interviews', () => {
  it('sends the map link with the address, prefilled when rescheduling', async () => {
    vi.mocked(send).mockResolvedValue({ interview: interview(), delivery: { telegramSent: true, emailSent: false }, shareUrl: 'https://hrdai.uz/interview/abc' });
    render(<MemoryRouter><ScheduleInterviewDialog applicationId={11} existing={interview({ mapUrl: 'https://yandex.uz/maps/?ll=69.2797%2C41.3111' })} close={vi.fn()} saved={vi.fn()} /></MemoryRouter>);
    const field = screen.getByLabelText('Map link (optional)');
    expect(field).toHaveValue('https://yandex.uz/maps/?ll=69.2797%2C41.3111');
    fireEvent.change(field, { target: { value: ' https://www.google.com/maps/@41.3111,69.2797,17z ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to candidate' }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect((vi.mocked(send).mock.calls[0][1] as any).mapUrl).toBe('https://www.google.com/maps/@41.3111,69.2797,17z');
  });

  it('is not offered, and not sent, for an online interview', () => {
    render(<MemoryRouter><ScheduleInterviewDialog applicationId={11} close={vi.fn()} saved={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByLabelText('Map link (optional)')).toBeNull();
  });

  it('shows an open-on-map link in the HR panel and on the candidate page', async () => {
    interviews = [interview({ mapUrl: 'https://yandex.uz/maps/-/CCUx' })];
    render(<MemoryRouter><InterviewPanel applicationId={11} status="INTERVIEW" onChanged={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Open on map' })).toHaveAttribute('href', 'https://yandex.uz/maps/-/CCUx');
    cleanup();

    window.history.pushState({}, '', '/interview/' + 'T'.repeat(32));
    const view: PublicInterview = {
      status: 'CONFIRMED', mode: 'OFFLINE', companyName: 'Acme', vacancyTitle: 'SMM Lead', durationMinutes: 30, timezone: 'Asia/Tashkent',
      location: 'Tashkent, Amir Temur 1', mapUrl: 'https://yandex.uz/maps/-/CCUx', note: null, declined: false, slots: [],
      confirmed: { startsAt: future(26), meetUrl: null, location: 'Tashkent, Amir Temur 1', mapUrl: 'https://yandex.uz/maps/-/CCUx' },
    };
    vi.mocked(api).mockResolvedValue(view);
    render(<PublicInterviewPage />);
    const links = await screen.findAllByRole('link', { name: 'Open on map' });
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => expect(link).toHaveAttribute('href', 'https://yandex.uz/maps/-/CCUx'));
  });
});
