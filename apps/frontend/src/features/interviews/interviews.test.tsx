import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { changeLanguage } from '../../i18n';
import { api, send } from '../../lib/api';
import { PublicInterviewPage } from '../../pages/public-interview';
import type { GoogleCalendarStatus, Interview, PublicInterview } from '../../types';
import { InterviewPanel } from './interview-panel';
import { ScheduleInterviewDialog } from './schedule-interview-dialog';

vi.mock('../../lib/api', () => ({ send: vi.fn(), api: vi.fn(), ApiError: class ApiError extends Error {} }));

const google: GoogleCalendarStatus = { configured: true, connected: true, googleEmail: 'hr@acme.uz' };
let googleStatus = google;
let interviews: Interview[] = [];
vi.mock('../../components/ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../components/ui')>();
  return {
    ...original,
    useData: vi.fn((url: string) =>
      url.includes('google-calendar') ? { data: googleStatus, error: '', reload: vi.fn() } : { data: interviews, error: '', reload: vi.fn() },
    ),
  };
});

const future = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const interview = (extra: Partial<Interview> = {}): Interview => ({
  id: 9, applicationId: 11, mode: 'ONLINE', status: 'PROPOSED', durationMinutes: 30, timezone: 'Asia/Tashkent', location: null, note: null,
  meetUrl: null, confirmedSlotId: null, confirmedAt: null, declinedAt: null, declineNote: null,
  slots: [{ id: 1, startsAt: future(26), endsAt: future(26.5) }], createdAt: future(-1), ...extra,
});
const proposal = { interview: interview(), delivery: { telegramSent: true, emailSent: false }, shareUrl: 'https://hrdai.uz/interview/abc' };

beforeEach(async () => {
  await changeLanguage('en');
  googleStatus = google;
  interviews = [];
  vi.mocked(send).mockReset();
  vi.mocked(api).mockReset();
});
afterEach(async () => {
  cleanup();
  await changeLanguage('uz');
});

describe('schedule interview dialog', () => {
  it('sends an online interview with the proposed times and shows the candidate link', async () => {
    vi.mocked(send).mockResolvedValue(proposal);
    const saved = vi.fn();
    render(<MemoryRouter><ScheduleInterviewDialog applicationId={11} close={vi.fn()} saved={saved} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Send to candidate' }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    const [path, body] = vi.mocked(send).mock.calls[0] as [string, any];
    expect(path).toBe('/applications/11/interviews');
    expect(body).toEqual(expect.objectContaining({ mode: 'ONLINE', durationMinutes: 30 }));
    expect(body.slots).toHaveLength(2);
    expect(body.location).toBeUndefined();
    expect(await screen.findByDisplayValue('https://hrdai.uz/interview/abc')).toBeVisible();
    expect(saved).toHaveBeenCalled();
  });

  it('asks for an address when the interview is offline and sends it', async () => {
    vi.mocked(send).mockResolvedValue(proposal);
    // An existing offline interview opens the dialog in offline mode (Radix selects need a real browser to drive).
    render(<MemoryRouter><ScheduleInterviewDialog applicationId={11} existing={interview({ mode: 'OFFLINE' })} close={vi.fn()} saved={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Send to candidate' }));
    expect(await screen.findByText('Pick the place on the map or enter an address.')).toBeVisible();
    expect(send).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Address (optional)'), { target: { value: 'Tashkent, Amir Temur 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to candidate' }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(vi.mocked(send).mock.calls[0][0]).toBe('/interviews/9/schedule');
    expect((vi.mocked(send).mock.calls[0][1] as any).location).toBe('Tashkent, Amir Temur 1');
  });

  it('lets HR send an online interview without Google Calendar, with a note about the Jitsi link', () => {
    googleStatus = { configured: true, connected: false, googleEmail: null };
    render(<MemoryRouter><ScheduleInterviewDialog applicationId={11} close={vi.fn()} saved={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText(/online interviews will get a Jitsi link/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Send to candidate' })).toBeEnabled();
    expect(screen.queryByText(/Google Meet\)/)).not.toBeInTheDocument();
  });

  it('says the online interview is a Google Meet, and from which account, when the calendar is connected', () => {
    render(<MemoryRouter><ScheduleInterviewDialog applicationId={11} close={vi.fn()} saved={vi.fn()} /></MemoryRouter>);
    expect(screen.getAllByText('Online (Google Meet)').length).toBeGreaterThan(0);
    expect(screen.getByText(/Google Meet link and a calendar entry are created automatically.*hr@acme\.uz/)).toBeVisible();
    expect(screen.queryByText(/Jitsi/)).not.toBeInTheDocument();
  });

  it('reschedules an existing interview through its own endpoint', async () => {
    vi.mocked(send).mockResolvedValue(proposal);
    render(<MemoryRouter><ScheduleInterviewDialog applicationId={11} existing={interview()} close={vi.fn()} saved={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Send to candidate' }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(vi.mocked(send).mock.calls[0][0]).toBe('/interviews/9/schedule');
    expect(vi.mocked(send).mock.calls[0][2]).toBe('PUT');
  });
});

describe('interview panel', () => {
  const panel = (status: any = 'REVIEWING') => render(<MemoryRouter><InterviewPanel applicationId={11} status={status} /></MemoryRouter>);

  it('offers to schedule when nothing is planned, except for closed applications', () => {
    panel();
    expect(screen.getByText('No interview scheduled yet.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Schedule interview' })).toBeVisible();
    cleanup();
    panel('REJECTED');
    expect(screen.queryByRole('button', { name: 'Schedule interview' })).toBeNull();
  });

  it('shows a confirmed online interview with its Meet link', () => {
    interviews = [interview({ status: 'CONFIRMED', confirmedSlotId: 1, meetUrl: 'https://meet.google.com/abc-defg-hij' })];
    panel('INTERVIEW');
    expect(screen.getByText('Confirmed')).toBeVisible();
    expect(screen.getByRole('link', { name: /Join the meeting/ })).toHaveAttribute('href', 'https://meet.google.com/abc-defg-hij');
    expect(screen.getByRole('button', { name: 'Propose new times' })).toBeVisible();
  });

  it('shows the waiting state and a candidate’s request for other times', () => {
    interviews = [interview({ declinedAt: future(-1), declineNote: 'Busy this week' })];
    panel('INTERVIEW');
    expect(screen.getByText('The candidate asked for other times')).toBeVisible();
    expect(screen.getByText(/Busy this week/)).toBeVisible();
  });

  it('cancels after confirmation', async () => {
    interviews = [interview()];
    vi.mocked(send).mockResolvedValue({ ok: true });
    panel('INTERVIEW');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel interview' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel interview', hidden: false }, { timeout: 2000 }).then(() => screen.getAllByRole('button', { name: 'Cancel interview' }).at(-1)!));
    await waitFor(() => expect(send).toHaveBeenCalledWith('/interviews/9/cancel', {}, 'PUT'));
  });
});

describe('candidate interview page', () => {
  const publicView = (extra: Partial<PublicInterview> = {}): PublicInterview => ({
    status: 'PROPOSED', mode: 'ONLINE', companyName: 'Acme', vacancyTitle: 'SMM Lead', durationMinutes: 30, timezone: 'Asia/Tashkent',
    location: null, note: null, declined: false, slots: [{ id: 1, startsAt: future(26) }, { id: 2, startsAt: future(50) }], confirmed: null, ...extra,
  });
  beforeEach(() => window.history.pushState({}, '', '/interview/' + 'T'.repeat(32)));

  it('lists the times and confirms the one the candidate picks', async () => {
    vi.mocked(api).mockResolvedValue(publicView());
    vi.mocked(send).mockResolvedValue(publicView({ status: 'CONFIRMED', slots: [], confirmed: { startsAt: future(26), meetUrl: 'https://meet.google.com/abc-defg-hij', location: null } }));
    render(<PublicInterviewPage />);
    expect(await screen.findByText(/Acme invites you to an interview for SMM Lead/)).toBeVisible();
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirm' })[1]);
    await waitFor(() => expect(send).toHaveBeenCalledWith(`/public/interviews/${'T'.repeat(32)}/confirm`, { slotId: 2 }));
    expect(await screen.findByText('Your interview is confirmed')).toBeVisible();
    expect(screen.getByRole('link', { name: /Join the meeting/ })).toHaveAttribute('href', 'https://meet.google.com/abc-defg-hij');
  });

  it('lets the candidate say none of the times work', async () => {
    vi.mocked(api).mockResolvedValue(publicView());
    vi.mocked(send).mockResolvedValue(publicView({ declined: true }));
    render(<PublicInterviewPage />);
    fireEvent.click(await screen.findByText('None of these times work for me'));
    fireEvent.change(screen.getByPlaceholderText(/suits you better/), { target: { value: 'Mornings only' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith(expect.stringContaining('/decline'), { note: 'Mornings only' }));
    expect(await screen.findByText('Thanks! HR will send you new times.')).toBeVisible();
  });

  it('shows the address for an offline interview and the cancelled state', async () => {
    vi.mocked(api).mockResolvedValue(publicView({ mode: 'OFFLINE', location: 'Tashkent, Amir Temur 1' }));
    render(<PublicInterviewPage />);
    expect(await screen.findByText('Tashkent, Amir Temur 1')).toBeVisible();
    cleanup();
    vi.mocked(api).mockResolvedValue(publicView({ status: 'CANCELLED', slots: [] }));
    render(<PublicInterviewPage />);
    expect(await screen.findByText('This interview was cancelled.')).toBeVisible();
  });

  it('says so when the link is not valid', async () => {
    vi.mocked(api).mockRejectedValue(new Error('Interview not found'));
    render(<PublicInterviewPage />);
    expect(await screen.findByText('Interview not found')).toBeVisible();
  });
});
