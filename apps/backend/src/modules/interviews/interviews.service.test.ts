import { describe, expect, it, vi } from 'vitest';
import { hashToken } from '../../common/utils/security';
import { GoogleCalendarNotConnectedError } from '../google-calendar/google-calendar.service';
import { buildSlots, createInterviewSchema } from './interviews.schemas';
import { InterviewsService } from './interviews.service';

const user = { id: 5, companyId: 3, role: 'HR', fullName: 'Hira Manager', email: 'hr@acme.uz' };
const hour = 60 * 60 * 1000;
const at = (hoursAhead: number) => new Date(Date.now() + hoursAhead * hour);
const candidate = { id: 7, fullName: 'Ali Valiyev', email: 'ali@example.com', phone: null, telegramUserId: '42', companyId: 3 };
const application = { id: 11, companyId: 3, status: 'REVIEWING', candidate, vacancy: { id: 2, title: 'SMM Lead' }, company: { name: 'Acme' } };

function setup({ googleConnected = true, active = null as unknown } = {}) {
  const tx: any = {
    application: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    applicationStageChange: { create: vi.fn() },
    interview: {
      create: vi.fn(async ({ data }: any) => ({ id: 9, ...data, slots: data.slots.create.map((s: any, i: number) => ({ id: i + 1, ...s })) })),
      update: vi.fn(async ({ data }: any) => ({ id: 9, ...data, slots: data.slots.create.map((s: any, i: number) => ({ id: i + 1, ...s })) })),
    },
    interviewSlot: { deleteMany: vi.fn() },
  };
  const db: any = {
    application: { findFirst: vi.fn().mockResolvedValue(application) },
    interview: { findFirst: vi.fn().mockResolvedValue(active), findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn() },
    $transaction: vi.fn((cb: any) => cb(tx)),
  };
  const security = { limit: vi.fn(), config: { FRONTEND_ORIGIN: 'https://hrdai.uz' } };
  const google = {
    isConnected: vi.fn().mockResolvedValue(googleConnected),
    createEvent: vi.fn().mockResolvedValue({ eventId: 'ev1', meetUrl: 'https://meet.google.com/abc-defg-hij' }),
    deleteEvent: vi.fn(),
  };
  const notifications = {
    sendInterviewProposal: vi.fn().mockResolvedValue({ telegramSent: true, emailSent: false }),
    sendInterviewConfirmation: vi.fn().mockResolvedValue({}),
    sendInterviewCancelled: vi.fn().mockResolvedValue({}),
    notifyOrganizer: vi.fn().mockResolvedValue(undefined),
  };
  const audit = { log: vi.fn() };
  const service = new InterviewsService(db, security as never, google as never, notifications as never, audit as never);
  return { db, tx, google, notifications, audit, service };
}

describe('interview slots', () => {
  it('sorts the times and gives each one an end', () => {
    const slots = buildSlots([at(30).toISOString(), at(26).toISOString()], 45);
    expect(slots[0].startsAt.getTime()).toBeLessThan(slots[1].startsAt.getTime());
    expect(slots[0].endsAt.getTime() - slots[0].startsAt.getTime()).toBe(45 * 60_000);
  });

  it('rejects past, too distant and overlapping times', () => {
    expect(() => buildSlots([at(0).toISOString()], 30)).toThrow('10 minutes');
    expect(() => buildSlots([at(24 * 100).toISOString()], 30)).toThrow('90 days');
    expect(() => buildSlots([at(24).toISOString(), new Date(at(24).getTime() + 20 * 60_000).toISOString()], 30)).toThrow('overlap');
  });

  it('requires an address for offline interviews only', () => {
    const slots = [at(24).toISOString()];
    expect(createInterviewSchema.safeParse({ mode: 'OFFLINE', slots }).success).toBe(false);
    expect(createInterviewSchema.safeParse({ mode: 'OFFLINE', slots, location: 'Tashkent, Amir Temur 1' }).success).toBe(true);
    expect(createInterviewSchema.safeParse({ mode: 'ONLINE', slots }).success).toBe(true);
    expect(createInterviewSchema.safeParse({ mode: 'ONLINE', slots: [] }).success).toBe(false);
  });
});

describe('scheduling an interview (HR)', () => {
  const input = (mode: 'ONLINE' | 'OFFLINE' = 'ONLINE') => ({ mode, slots: [at(26).toISOString(), at(50).toISOString()], durationMinutes: 30, location: mode === 'OFFLINE' ? 'Tashkent, Amir Temur 1' : undefined });

  it('stores only the token hash, moves the application to the interview stage and sends the link', async () => {
    const { tx, notifications, audit, service } = setup();
    const result = await service.create(user as never, 11, input());
    const token = result.shareUrl.split('/interview/')[1];
    expect(tx.interview.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ tokenHash: hashToken(token), organizerId: 5, mode: 'ONLINE' }));
    expect(JSON.stringify(result.interview)).not.toContain('tokenHash');
    expect(tx.application.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'INTERVIEW' } }));
    expect(tx.applicationStageChange.create).toHaveBeenCalled();
    expect(notifications.sendInterviewProposal).toHaveBeenCalledWith(expect.objectContaining({ token, interview: expect.objectContaining({ mode: 'ONLINE' }) }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'INTERVIEW_PROPOSED' }));
    expect(result.delivery).toEqual({ telegramSent: true, emailSent: false });
  });

  it('needs the recruiter’s Google account for online, not for offline', async () => {
    const online = setup({ googleConnected: false });
    await expect(online.service.create(user as never, 11, input('ONLINE'))).rejects.toThrow('Google Calendar');
    expect(online.tx.interview.create).not.toHaveBeenCalled();

    const offline = setup({ googleConnected: false });
    const result = await offline.service.create(user as never, 11, input('OFFLINE'));
    expect(result.interview.location).toBe('Tashkent, Amir Temur 1');
  });

  it('refuses a second active interview, a closed application and an unknown application', async () => {
    await expect(setup({ active: { id: 1 } }).service.create(user as never, 11, input())).rejects.toThrow('already scheduled');
    const closed = setup();
    closed.db.application.findFirst.mockResolvedValue({ ...application, status: 'REJECTED' });
    await expect(closed.service.create(user as never, 11, input())).rejects.toThrow('closed');
    const missing = setup();
    missing.db.application.findFirst.mockResolvedValue(null);
    await expect(missing.service.create(user as never, 99, input())).rejects.toThrow('not found');
  });

  it('keeps the stage when the application is already past review', async () => {
    const { db, tx, service } = setup();
    db.application.findFirst.mockResolvedValue({ ...application, status: 'OFFER' });
    await service.create(user as never, 11, input());
    expect(tx.application.updateMany).not.toHaveBeenCalled();
  });

  it('rescheduling removes the old calendar event and issues a new link', async () => {
    const { db, tx, google, service } = setup();
    db.interview.findFirst.mockResolvedValue({ id: 9, companyId: 3, applicationId: 11, organizerId: 4, mode: 'ONLINE', status: 'CONFIRMED', location: null, googleEventId: 'old', application });
    const result = await service.reschedule(user as never, 9, { slots: [at(40).toISOString()], durationMinutes: 30 });
    expect(google.deleteEvent).toHaveBeenCalledWith(4, 'old');
    expect(tx.interviewSlot.deleteMany).toHaveBeenCalledWith({ where: { interviewId: 9 } });
    expect(tx.interview.update.mock.calls[0][0].data).toEqual(expect.objectContaining({ status: 'PROPOSED', organizerId: 5, googleEventId: null, meetUrl: null }));
    expect(result.shareUrl).toContain('/interview/');
  });

  it('cancelling removes the event once and tells the candidate', async () => {
    const { db, google, notifications, service } = setup();
    db.interview.findFirst.mockResolvedValue({ id: 9, companyId: 3, applicationId: 11, organizerId: 4, googleEventId: 'ev', application });
    await service.cancel(user as never, 9);
    expect(google.deleteEvent).toHaveBeenCalledWith(4, 'ev');
    expect(notifications.sendInterviewCancelled).toHaveBeenCalled();
    db.interview.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.cancel(user as never, 9)).rejects.toThrow('already cancelled');
  });
});

describe('the candidate’s page', () => {
  const token = 'A'.repeat(32);
  const slot = (id: number, hoursAhead: number) => ({ id, startsAt: at(hoursAhead), endsAt: at(hoursAhead + 0.5) });
  const stored = (extra: Record<string, unknown> = {}) => ({
    id: 9, companyId: 3, applicationId: 11, organizerId: 5, mode: 'ONLINE', status: 'PROPOSED', durationMinutes: 30, timezone: 'Asia/Tashkent',
    location: null, note: null, meetUrl: null, declinedAt: null, confirmedSlotId: null, slots: [slot(1, 26), slot(2, 50)], application, ...extra,
  });

  it('shows the meeting without anyone’s contact details and hides slots that are too soon', async () => {
    const { db, service } = setup();
    db.interview.findUnique.mockResolvedValue(stored({ slots: [slot(1, 0.05), slot(2, 50)] }));
    const view = await service.publicView(token, '1.2.3.4');
    expect(db.interview.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: hashToken(token) } }));
    expect(view.slots.map((s) => s.id)).toEqual([2]);
    expect(view.companyName).toBe('Acme');
    expect(JSON.stringify(view)).not.toMatch(/ali@example|telegramUserId|tokenHash|organizer/i);
  });

  it('treats malformed and unknown tokens as not found', async () => {
    const { db, service } = setup();
    await expect(service.publicView('short', '1.2.3.4')).rejects.toThrow('not found');
    db.interview.findUnique.mockResolvedValue(null);
    await expect(service.publicView(token, '1.2.3.4')).rejects.toThrow('not found');
  });

  it('confirming claims the slot, creates the Meet event and tells both sides', async () => {
    const { db, google, notifications, service } = setup();
    db.interview.findUnique.mockResolvedValue(stored());
    db.interview.update.mockResolvedValue(stored({ status: 'CONFIRMED', confirmedSlotId: 2, meetUrl: 'https://meet.google.com/abc-defg-hij' }));
    const view = await service.confirm(token, 2, '1.2.3.4');
    expect(db.interview.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 9, status: 'PROPOSED' }, data: expect.objectContaining({ status: 'CONFIRMED', confirmedSlotId: 2 }) }));
    expect(google.createEvent).toHaveBeenCalledWith(5, expect.objectContaining({ withMeet: true, attendeeEmail: 'ali@example.com' }));
    expect(notifications.sendInterviewConfirmation).toHaveBeenCalledWith(expect.objectContaining({ interview: expect.objectContaining({ meetUrl: 'https://meet.google.com/abc-defg-hij' }) }));
    expect(notifications.notifyOrganizer).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('🔗 Google Meet: https://meet.google.com/abc-defg-hij') }));
    expect(view.confirmed?.meetUrl).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('lets only one answer win and rejects past slots', async () => {
    const lost = setup();
    lost.db.interview.findUnique.mockResolvedValue(stored());
    lost.db.interview.updateMany.mockResolvedValue({ count: 0 });
    await expect(lost.service.confirm(token, 1, '1.2.3.4')).rejects.toThrow('already confirmed');
    expect(lost.google.createEvent).not.toHaveBeenCalled();

    const past = setup();
    past.db.interview.findUnique.mockResolvedValue(stored({ slots: [slot(1, 0.05)] }));
    await expect(past.service.confirm(token, 1, '1.2.3.4')).rejects.toThrow('no longer available');
    await expect(past.service.confirm(token, 77, '1.2.3.4')).rejects.toThrow('not found');
  });

  it('releases the claim when the Meet link cannot be created', async () => {
    const { db, google, notifications, service } = setup();
    db.interview.findUnique.mockResolvedValue(stored());
    google.createEvent.mockRejectedValue(new GoogleCalendarNotConnectedError('revoked'));
    await expect(service.confirm(token, 1, '1.2.3.4')).rejects.toThrow('calendar is not connected');
    expect(db.interview.updateMany).toHaveBeenLastCalledWith({ where: { id: 9, status: 'CONFIRMED', confirmedSlotId: 1 }, data: { status: 'PROPOSED', confirmedSlotId: null, confirmedAt: null } });
    expect(notifications.sendInterviewConfirmation).not.toHaveBeenCalled();
  });

  it('confirms an offline interview even when the calendar entry fails', async () => {
    const { db, google, notifications, service } = setup();
    db.interview.findUnique.mockResolvedValue(stored({ mode: 'OFFLINE', location: 'Tashkent, Amir Temur 1' }));
    google.createEvent.mockRejectedValue(new Error('calendar down'));
    db.interview.update.mockResolvedValue(stored({ mode: 'OFFLINE', status: 'CONFIRMED', confirmedSlotId: 1, location: 'Tashkent, Amir Temur 1' }));
    const view = await service.confirm(token, 1, '1.2.3.4');
    expect(google.createEvent).toHaveBeenCalledWith(5, expect.objectContaining({ withMeet: false }));
    expect(notifications.sendInterviewConfirmation).toHaveBeenCalled();
    expect(view.confirmed?.location).toBe('Tashkent, Amir Temur 1');
    expect(notifications.notifyOrganizer).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('📍 Tashkent, Amir Temur 1') }));
  });

  it('refuses answers for cancelled or already confirmed interviews, and a decline asks HR for new times', async () => {
    const { db, notifications, service } = setup();
    db.interview.findUnique.mockResolvedValue(stored({ status: 'CANCELLED' }));
    await expect(service.confirm(token, 1, '1.2.3.4')).rejects.toThrow('cancelled');
    db.interview.findUnique.mockResolvedValue(stored({ status: 'CONFIRMED' }));
    await expect(service.decline(token, 'x', '1.2.3.4')).rejects.toThrow('already confirmed');

    db.interview.findUnique.mockResolvedValue(stored());
    const view = await service.decline(token, 'Hafta oxirida bandman', '1.2.3.4');
    expect(db.interview.updateMany).toHaveBeenLastCalledWith({ where: { id: 9, status: 'PROPOSED' }, data: { declinedAt: expect.any(Date), declineNote: 'Hafta oxirida bandman' } });
    expect(notifications.notifyOrganizer).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('Hafta oxirida bandman') }));
    expect(view.declined).toBe(true);
  });
});
