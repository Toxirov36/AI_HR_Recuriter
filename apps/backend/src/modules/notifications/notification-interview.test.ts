import { describe, expect, it, vi } from 'vitest';
import { formatInterviewTime, NotificationService } from './notification.service';

const candidate = { id: 20, fullName: 'Ali Valiyev', email: 'ali@example.com', telegramUserId: '42', companyId: 2 };
const vacancy = { id: 5, title: 'SMM Lead' };
const interview = { mode: 'ONLINE' as const, durationMinutes: 30, note: 'Portfolio olib keling' };

function setup(language: string | null, origin = 'https://hrdai.uz', business: { id: string } | null = null) {
  const db: any = {
    telegramBusinessConnection: { findFirst: vi.fn().mockResolvedValue(business), findMany: vi.fn().mockResolvedValue([{ userChatId: BigInt(900), telegramUserId: BigInt(900) }]) },
    telegramUserLanguage: { findUnique: vi.fn().mockResolvedValue(language ? { language } : null) },
    candidateEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const telegram = { sendMessage: vi.fn().mockResolvedValue({ ok: true }) };
  const email = { sendMail: vi.fn().mockResolvedValue({ success: true }) };
  const service = new NotificationService(db, telegram as never, email as never);
  (service as any).config = { FRONTEND_ORIGIN: origin };
  return { db, telegram, email, service };
}

describe('interview proposal', () => {
  it('writes to the bot chat in the candidate’s language with a button to the picking page', async () => {
    const { telegram, email, db, service } = setup('ru');
    const result = await service.sendInterviewProposal({ candidate, vacancy, companyName: 'Acme', interview, token: 'T'.repeat(32) });
    expect(result).toEqual({ telegramSent: true, emailSent: true });
    const [chat, text, options] = telegram.sendMessage.mock.calls[0];
    expect(chat).toBe('42');
    expect(text).toContain('Приглашаем вас на собеседование');
    expect(text).toContain('Онлайн (Google Meet)');
    expect(text).toContain('Portfolio olib keling');
    expect(options.businessConnectionId).toBeUndefined();
    expect(JSON.stringify(options.replyMarkup)).toContain(`/interview/${'T'.repeat(32)}`);
    expect(email.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ali@example.com', subject: expect.stringContaining('Приглашение') }));
    expect(db.candidateEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'INTERVIEW_PROPOSED' }) });
  });

  it('sends the link as a second message when the site origin is not https (local development)', async () => {
    const { telegram, service } = setup('uz', 'http://localhost:5173');
    await service.sendInterviewProposal({ candidate, vacancy, companyName: 'Acme', interview, token: 'T'.repeat(32) });
    expect(telegram.sendMessage.mock.calls[0][2].replyMarkup).toBeUndefined();
    expect(telegram.sendMessage).toHaveBeenLastCalledWith('42', `http://localhost:5173/interview/${'T'.repeat(32)}`);
  });

  it('tries the bot chat first even without a stored language, in Uzbek', async () => {
    const { telegram, service } = setup(null);
    await service.sendInterviewProposal({ candidate, vacancy, companyName: 'Acme', interview, token: 'T'.repeat(32) });
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
    const [chat, text, options] = telegram.sendMessage.mock.calls[0];
    expect(chat).toBe('42');
    expect(options.businessConnectionId).toBeUndefined();
    expect(text).toContain('Assalomu alaykum');
  });

  it('goes out from the HR’s own account, with the link in the text, when Business is connected', async () => {
    const { telegram, service } = setup(null, 'https://hrdai.uz', { id: 'biz1' });
    const result = await service.sendInterviewProposal({ candidate, vacancy, companyName: 'Acme', interview, token: 'T'.repeat(32) });
    expect(result.telegramSent).toBe(true);
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
    const [, text, options] = telegram.sendMessage.mock.calls[0];
    expect(options).toEqual({ businessConnectionId: 'biz1' });
    expect(text).toContain(`/interview/${'T'.repeat(32)}`);
  });

  it('falls back to the bot chat when the Business chat does not deliver', async () => {
    const { telegram, service } = setup(null, 'https://hrdai.uz', { id: 'biz1' });
    telegram.sendMessage.mockResolvedValueOnce({ ok: false, description: 'Forbidden' });
    const result = await service.sendInterviewProposal({ candidate, vacancy, companyName: 'Acme', interview, token: 'T'.repeat(32) });
    expect(result.telegramSent).toBe(true);
    expect(telegram.sendMessage).toHaveBeenCalledTimes(2);
    expect(telegram.sendMessage.mock.calls[1][2].businessConnectionId).toBeUndefined();
  });

  it('falls back to email when Telegram fails', async () => {
    const { telegram, service } = setup('uz');
    telegram.sendMessage.mockResolvedValue({ ok: false });
    const result = await service.sendInterviewProposal({ candidate, vacancy, companyName: 'Acme', interview, token: 'T'.repeat(32) });
    expect(result).toEqual({ telegramSent: false, emailSent: true });
  });
});

describe('interview confirmation and organizer alert', () => {
  it('sends the time in the interview’s zone and the Meet link', async () => {
    const { telegram, service } = setup('tg');
    await service.sendInterviewConfirmation({
      candidate, vacancy, companyName: 'Acme',
      interview: { mode: 'ONLINE', durationMinutes: 30, timezone: 'Asia/Tashkent', startsAt: new Date('2026-11-02T09:00:00Z'), meetUrl: 'https://meet.google.com/abc-defg-hij' },
    });
    const text = telegram.sendMessage.mock.calls[0][1] as string;
    expect(text).toContain('02.11.2026 14:00');
    expect(text).toContain('https://meet.google.com/abc-defg-hij');
    expect(text).toContain('Мусоҳиба тасдиқ шуд');
  });

  it('shows the address for an offline interview', async () => {
    const { telegram, service } = setup('uz');
    await service.sendInterviewConfirmation({
      candidate, vacancy, companyName: 'Acme',
      interview: { mode: 'OFFLINE', durationMinutes: 45, timezone: 'Asia/Tashkent', startsAt: new Date('2026-11-02T09:00:00Z'), location: 'Amir Temur 1' },
    });
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('📍 Manzil: Amir Temur 1');
  });

  it('alerts the organizer’s own Business chat only', async () => {
    const { db, telegram, service } = setup(null);
    await service.notifyOrganizer({ companyId: 2, organizerId: 5, applicationId: 11, text: 'hello' });
    expect(db.telegramBusinessConnection.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 2, userId: 5, enabled: true } }));
    expect(telegram.sendMessage).toHaveBeenCalledWith('900', 'hello', expect.anything());
  });

  it('formats times as dd.MM.yyyy HH:mm in the given zone', () => {
    expect(formatInterviewTime(new Date('2026-12-31T20:30:00Z'), 'Asia/Tashkent')).toBe('01.01.2027 01:30');
  });
});
