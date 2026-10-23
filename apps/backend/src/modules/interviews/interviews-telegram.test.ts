import { BadGatewayException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { NotificationService } from '../notifications/notification.service';
import { TelegramCallbackRegistry } from '../telegram/telegram-callback.registry';
import { botText } from '../telegram/telegram-i18n';
import { InterviewsService } from './interviews.service';

const hour = 60 * 60 * 1000;
const at = (hoursAhead: number) => new Date(Date.now() + hoursAhead * hour);
const candidate = { id: 7, fullName: 'Ali Valiyev', email: 'ali@example.com', phone: null, telegramUserId: '42', companyId: 3 };
const application = { candidate, vacancy: { id: 2, title: 'SMM Lead' }, company: { name: 'Acme' } };
const slots = [
  { id: 11, startsAt: at(26), endsAt: at(26.5) },
  { id: 12, startsAt: at(50), endsAt: at(50.5) },
];
const proposed = (extra: Record<string, unknown> = {}) => ({
  id: 9, companyId: 3, applicationId: 11, organizerId: 5, mode: 'ONLINE', status: 'PROPOSED', durationMinutes: 30, timezone: 'Asia/Tashkent',
  location: null, note: null, meetUrl: null, declinedAt: null, confirmedSlotId: null, slots, application, ...extra,
});
const query = (data: string, fromId = 42) => ({ id: 'cb', from: { id: fromId }, data, message: { message_id: 5, chat: { id: fromId } } }) as never;

function setup(interview: unknown = proposed(), language: string | null = 'uz') {
  const db: any = {
    interview: { findUnique: vi.fn().mockResolvedValue(interview), updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn().mockResolvedValue(proposed({ status: 'CONFIRMED', confirmedSlotId: 11 })) },
    telegramUserLanguage: { findUnique: vi.fn().mockResolvedValue(language ? { language } : null) },
  };
  const security = { limit: vi.fn(), config: { FRONTEND_ORIGIN: 'https://hrdai.uz' } };
  const google = { createEvent: vi.fn().mockResolvedValue({ eventId: 'ev1', meetUrl: 'https://meet.google.com/abc-defg-hij' }), deleteEvent: vi.fn(), isConnected: vi.fn().mockResolvedValue(true) };
  const notifications = { sendInterviewConfirmation: vi.fn().mockResolvedValue({}), notifyOrganizer: vi.fn().mockResolvedValue(undefined) };
  const telegram = { answerCallbackQuery: vi.fn(), editMessageText: vi.fn().mockResolvedValue({ ok: true }) };
  const registry = new TelegramCallbackRegistry();
  const service = new InterviewsService(db, security as never, google as never, notifications as never, { log: vi.fn() } as never, registry, telegram as never);
  service.onModuleInit();
  return { db, security, google, notifications, telegram, registry, service };
}

describe('time buttons in the bot chat', () => {
  it('registers for the iv: prefix only', async () => {
    const { registry, db } = setup();
    expect(await registry.dispatch(query('iv:9:11'))).toBe(true);
    expect(db.interview.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 9 } }));
    expect(await registry.dispatch(query('join:cancel'))).toBe(false);
  });

  it('confirms the tapped slot like the token page does, then replaces the buttons with the choice', async () => {
    const { service, db, google, notifications, telegram } = setup();
    await service.handleTelegram(query('iv:9:11'));
    expect(db.interview.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 9, status: 'PROPOSED' }, data: expect.objectContaining({ status: 'CONFIRMED', confirmedSlotId: 11 }) }));
    expect(google.createEvent).toHaveBeenCalledWith(5, expect.objectContaining({ withMeet: true, attendeeEmail: 'ali@example.com' }));
    expect(notifications.sendInterviewConfirmation).toHaveBeenCalledTimes(1);
    expect(notifications.notifyOrganizer).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('🔗 Havola: https://meet.google.com/abc-defg-hij') }));
    const picked = telegram.editMessageText.mock.calls[0];
    expect([picked[0], picked[1]]).toEqual([42, 5]);
    expect(picked[2]).toContain('vaqtini tanladingiz');
    expect(telegram.answerCallbackQuery).toHaveBeenCalledWith('cb', picked[2], false);
  });

  it('answers in the candidate’s own language', async () => {
    const { service, telegram } = setup(proposed(), 'ru');
    await service.handleTelegram(query('iv:9:11'));
    expect(telegram.editMessageText.mock.calls[0][2]).toContain('Вы выбрали');
  });

  it('turns "other time needed" into a request to HR for new times', async () => {
    const { service, db, notifications, telegram, google } = setup();
    await service.handleTelegram(query('iv:9:0'));
    expect(db.interview.updateMany).toHaveBeenCalledWith({ where: { id: 9, status: 'PROPOSED' }, data: { declinedAt: expect.any(Date), declineNote: null } });
    expect(notifications.notifyOrganizer).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('mos kelmadi') }));
    expect(google.createEvent).not.toHaveBeenCalled();
    expect(telegram.editMessageText.mock.calls[0][2]).toBe(botText('uz', 'interviewDeclinedThanks'));
  });

  it('refuses someone else’s interview and never touches it', async () => {
    const { service, db, telegram, google } = setup();
    await service.handleTelegram(query('iv:9:11', 99));
    expect(telegram.answerCallbackQuery).toHaveBeenCalledWith('cb', botText('uz', 'interviewButtonNotYours'), true);
    expect(db.interview.updateMany).not.toHaveBeenCalled();
    expect(google.createEvent).not.toHaveBeenCalled();
    expect(telegram.editMessageText).not.toHaveBeenCalled();
  });

  it('says a stale button is stale: unknown, cancelled, already confirmed or a slot of another interview', async () => {
    const unknown = setup(null);
    await unknown.service.handleTelegram(query('iv:9:11'));
    expect(unknown.telegram.answerCallbackQuery).toHaveBeenCalledWith('cb', botText('uz', 'interviewButtonNotYours'), true);

    for (const interview of [proposed({ status: 'CANCELLED' }), proposed({ status: 'CONFIRMED' }), proposed()]) {
      const ctx = setup(interview);
      await ctx.service.handleTelegram(query(interview.status === 'PROPOSED' ? 'iv:9:999' : 'iv:9:11'));
      expect(ctx.telegram.answerCallbackQuery).toHaveBeenCalledWith('cb', botText('uz', 'interviewButtonStale'), true);
      expect(ctx.db.interview.updateMany).not.toHaveBeenCalled();
    }
  });

  it('still confirms with a Jitsi room when Meet fails', async () => {
    const { service, google, notifications, telegram } = setup();
    google.createEvent.mockRejectedValue(new BadGatewayException('no meet'));
    await service.handleTelegram(query('iv:9:11'));
    expect(notifications.sendInterviewConfirmation.mock.calls[0][0].interview.meetUrl).toMatch(/^https:\/\/meet\.jit\.si\/shortlist-/);
    expect(telegram.answerCallbackQuery).not.toHaveBeenCalledWith('cb', botText('uz', 'interviewMeetFailed'), true);
  });

  it('limits how often one user can tap', async () => {
    const { service, security, db, telegram } = setup();
    security.limit.mockRejectedValue(new Error('Too many requests'));
    await service.handleTelegram(query('iv:9:11'));
    expect(telegram.answerCallbackQuery).toHaveBeenCalledWith('cb', botText('uz', 'interviewTooMany'), true);
    expect(db.interview.findUnique).not.toHaveBeenCalled();
  });
});

describe('the proposal message', () => {
  function notification(language: string | null = 'uz', business: { id: string } | null = null) {
    const db: any = {
      telegramBusinessConnection: { findFirst: vi.fn().mockResolvedValue(business) },
      telegramUserLanguage: { findUnique: vi.fn().mockResolvedValue(language ? { language } : null) },
      candidateEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const telegram = { sendMessage: vi.fn().mockResolvedValue({ ok: true }) };
    const email = { sendMail: vi.fn().mockResolvedValue({ success: true }) };
    const service = new NotificationService(db, telegram as never, email as never);
    (service as any).config = { FRONTEND_ORIGIN: 'https://hrdai.uz' };
    return { telegram, email, service };
  }
  const params = { candidate, vacancy: { id: 2, title: 'SMM Lead' }, companyName: 'Acme', token: 'T'.repeat(32) };
  const interview = { id: 9, mode: 'ONLINE' as const, durationMinutes: 30, timezone: 'Asia/Tashkent', slots };

  it('puts a button per proposed time and "other time" in the bot chat, next to the page link', async () => {
    const { telegram, service } = notification();
    await service.sendInterviewProposal({ ...params, interview });
    const markup = telegram.sendMessage.mock.calls[0][2].replyMarkup.inline_keyboard;
    expect(markup[0][0].url).toBe(`https://hrdai.uz/interview/${'T'.repeat(32)}`);
    expect(markup.slice(1).map((row: any[]) => row[0].callback_data)).toEqual(['iv:9:11', 'iv:9:12', 'iv:9:0']);
    expect(markup[1][0].text).toMatch(/^🕐 \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/);
    expect(markup[3][0].text).toBe(botText('uz', 'interviewNoneFit'));
  });

  it('keeps callback buttons out of the Business chat and email, which only get the link', async () => {
    const { telegram, email, service } = notification(null, { id: 'biz1' });
    await service.sendInterviewProposal({ ...params, interview });
    const [, text, options] = telegram.sendMessage.mock.calls[0];
    expect(options).toEqual({ businessConnectionId: 'biz1' });
    expect(text).toContain(`/interview/${'T'.repeat(32)}`);
    expect(JSON.stringify(email.sendMail.mock.calls[0][0])).not.toContain('iv:9:');
  });

  it('adds no time buttons when the interview carries no slots', async () => {
    const { telegram, service } = notification();
    await service.sendInterviewProposal({ ...params, interview: { mode: 'OFFLINE', durationMinutes: 30 } });
    expect(telegram.sendMessage.mock.calls[0][2].replyMarkup.inline_keyboard).toHaveLength(1);
  });
});
