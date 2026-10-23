import { describe, expect, it, vi } from 'vitest';
import { TelegramCallbackRegistry } from '../telegram/telegram-callback.registry';
import { TelegramRejectHandler } from './telegram-reject.handler';

const chat = { id: 100 };
const query = (data: string, from: Record<string, unknown> = { id: 77, first_name: 'Hira' }) => ({
  id: 'cb',
  from,
  data,
  message: { message_id: 5, chat, text: '🎯 Nomzod tayyor\n\n👤 Ali' },
}) as never;

function setup({ status = 'NEW', authorized = true }: { status?: string; authorized?: boolean } = {}) {
  const db: any = {
    application: { findFirst: vi.fn().mockResolvedValue({ id: 9, companyId: 3, status }) },
    telegramBusinessConnection: { findFirst: vi.fn().mockResolvedValue(authorized ? { user: { id: 5, fullName: 'Hira Manager' } } : null) },
  };
  const telegram = { answerCallbackQuery: vi.fn(), editMessageText: vi.fn().mockResolvedValue({ ok: true }) };
  const registry = new TelegramCallbackRegistry();
  const applications = { changeStage: vi.fn().mockResolvedValue({}) };
  const handler = new TelegramRejectHandler(db, telegram as never, registry, applications as never);
  handler.onModuleInit();
  return { db, telegram, registry, applications, handler };
}

describe('Reject button on the HR card', () => {
  it('registers for every reject callback and nothing else', async () => {
    const { registry, telegram } = setup();
    expect(await registry.dispatch(query('action:reject:9'))).toBe(true);
    expect(await registry.dispatch(query('action:interview:9'))).toBe(false);
    expect(telegram.editMessageText).toHaveBeenCalledTimes(1);
  });

  it('asks to confirm first and rejects nothing yet', async () => {
    const { handler, telegram, applications } = setup();
    await handler.handle(query('action:reject:9'));
    expect(applications.changeStage).not.toHaveBeenCalled();
    const [chatId, messageId, text, options] = telegram.editMessageText.mock.calls[0];
    expect([chatId, messageId]).toEqual([100, 5]);
    expect(text).toContain('Nomzod rad etilsinmi?');
    expect(options.replyMarkup.inline_keyboard[0].map((b: any) => b.callback_data)).toEqual(['action:rejectok:9', 'action:rejectno:9']);
  });

  it('rejects through the normal stage change (which messages the candidate) after confirmation', async () => {
    const { handler, telegram, applications } = setup({ status: 'INTERVIEW' });
    await handler.handle(query('action:rejectok:9'));
    expect(applications.changeStage).toHaveBeenCalledWith(3, 9, { id: 5, fullName: 'Hira (Telegram)' }, { status: 'REJECTED', expectedStatus: 'INTERVIEW' });
    expect(telegram.editMessageText.mock.calls[0][2]).toContain('❌ Rad etildi · Hira');
    expect(telegram.answerCallbackQuery).toHaveBeenCalledWith('cb', expect.stringContaining('rad etildi'));
  });

  it('restores the card buttons when the confirmation is cancelled', async () => {
    const { handler, telegram, applications } = setup();
    const cancelled = { ...(query('action:rejectno:9') as object), message: { message_id: 5, chat, text: '🎯 Nomzod tayyor\n\n❓ Nomzod rad etilsinmi? Unga muloyim rad javobi yuboriladi.' } } as never;
    await handler.handle(cancelled);
    expect(applications.changeStage).not.toHaveBeenCalled();
    const [, , text, options] = telegram.editMessageText.mock.calls[0];
    expect(text).toBe('🎯 Nomzod tayyor');
    expect(options.replyMarkup.inline_keyboard.flat().map((b: any) => b.callback_data).filter(Boolean)).toEqual(['action:interview:9', 'action:reject:9']);
  });

  it('refuses anyone who is not an active HR, recruiter or admin of that company', async () => {
    const { handler, telegram, applications, db } = setup({ authorized: false });
    await handler.handle(query('action:rejectok:9'));
    expect(db.telegramBusinessConnection.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 3, enabled: true }) }));
    expect(applications.changeStage).not.toHaveBeenCalled();
    expect(telegram.answerCallbackQuery).toHaveBeenCalledWith('cb', 'Bu amal uchun ruxsat yo‘q.', true);
  });

  it('does nothing for an already rejected, hired or missing application', async () => {
    const rejected = setup({ status: 'REJECTED' });
    await rejected.handler.handle(query('action:rejectok:9'));
    expect(rejected.applications.changeStage).not.toHaveBeenCalled();
    expect(rejected.telegram.answerCallbackQuery).toHaveBeenCalledWith('cb', 'Nomzod allaqachon rad etilgan.');

    const hired = setup({ status: 'HIRED' });
    await hired.handler.handle(query('action:rejectok:9'));
    expect(hired.applications.changeStage).not.toHaveBeenCalled();

    const missing = setup();
    missing.db.application.findFirst.mockResolvedValue(null);
    await missing.handler.handle(query('action:rejectok:9'));
    expect(missing.applications.changeStage).not.toHaveBeenCalled();
  });

  it('reports a stage conflict instead of editing the card', async () => {
    const { handler, telegram, applications } = setup();
    applications.changeStage.mockRejectedValue(new Error('The stage was changed by another reviewer.'));
    await handler.handle(query('action:rejectok:9'));
    expect(telegram.answerCallbackQuery).toHaveBeenCalledWith('cb', 'The stage was changed by another reviewer.', true);
    expect(telegram.editMessageText).not.toHaveBeenCalled();
  });
});
