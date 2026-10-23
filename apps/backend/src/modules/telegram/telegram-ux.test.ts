import { describe, expect, it, vi } from 'vitest';
import { getDefaultAssessmentForVacancy } from '../ai/utils/assessment-helper';
import { markChosen } from './telegram-chosen';
import { botText } from './telegram-i18n';
import { TelegramApplyService } from './telegram-apply.service';
import { TelegramJoinService } from './telegram-join.service';
import { TelegramLanguageService } from './telegram-language.service';
import { TelegramService } from './telegram.service';

const user = { id: 42, first_name: 'Ali' };
const chat = { id: 42, type: 'private' as const };
const query = (data: string, text = 'Original matn') => ({ id: 'cb', from: user, data, message: { message_id: 7, chat: { id: 42 }, text } }) as never;
const assessment = getDefaultAssessmentForVacancy('SMM manager');

describe('markChosen', () => {
  it('rewrites the message with the choice and no buttons', async () => {
    const api = { editMessageText: vi.fn().mockResolvedValue({ ok: true }) };
    await markChosen(api, query('x', 'Roziman yoki yo‘q?'), 'Roziman');
    expect(api.editMessageText).toHaveBeenCalledWith(42, 7, 'Roziman yoki yo‘q?\n\n✅ Roziman');
    expect(api.editMessageText.mock.calls[0]).toHaveLength(3); // no reply markup, so Telegram removes the buttons
  });

  it('never throws: a failed edit, a missing message or a client without edit support is ignored', async () => {
    await expect(markChosen({ editMessageText: vi.fn().mockRejectedValue(new Error('too old')) }, query('x'), 'A')).resolves.toBeUndefined();
    await expect(markChosen({}, query('x'), 'A')).resolves.toBeUndefined();
    const api = { editMessageText: vi.fn() };
    await markChosen(api, { id: 'cb', from: user, data: 'x' } as never, 'A');
    expect(api.editMessageText).not.toHaveBeenCalled();
  });
});

describe('the tapped choice stays visible', () => {
  it('shows the letter of a quiz answer in the vacancy-link flow', async () => {
    const last = assessment.questions[9];
    const answers = assessment.questions.slice(0, 9).map((q) => ({ questionId: q.id, selectedIndex: q.correctIndex }));
    const db: any = {
      telegramApplySession: {
        findUnique: vi.fn().mockResolvedValue({ telegramUserId: '42', companyId: 3, vacancyId: 5, step: 'ASSESSMENT', currentQuestionIndex: 9, answers, assessmentQuestions: assessment, customQuestions: [], expiresAt: new Date(Date.now() + 60_000), vacancy: { status: 'ACTIVE' } }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      candidate: { upsert: vi.fn().mockResolvedValue({ id: 7 }) },
    };
    const telegram = { sendMessage: vi.fn().mockResolvedValue({ ok: true }), answerCallbackQuery: vi.fn(), editMessageText: vi.fn().mockResolvedValue({ ok: true }) };
    const service = new TelegramApplyService(db, { limit: vi.fn(), config: {} } as never, telegram as never, {} as never);
    await service.handleCallback(query(`apply:5:quiz:${last.id}:2`, 'Savol 10'));
    expect(telegram.editMessageText).toHaveBeenCalledWith(42, 7, `Savol 10\n\n✅ ${botText('uz', 'yourAnswer', { letter: 'C' })}`);
  });

  it('shows the consent choice and the picked vacancy in the company-link flow', async () => {
    const session = { telegramUserId: '42', companyId: 3, step: 'PRIVACY', answers: [], expiresAt: new Date(Date.now() + 60_000) };
    const db: any = {
      telegramJoinSession: { findUnique: vi.fn().mockResolvedValue(session), updateMany: vi.fn().mockResolvedValue({ count: 1 }), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      vacancy: { findMany: vi.fn().mockResolvedValue([{ id: 5, title: 'SMM Lead', fieldId: null }, { id: 6, title: 'Backend', fieldId: null }]), findFirst: vi.fn() },
      candidate: { findUnique: vi.fn().mockResolvedValue(null) },
      application: { findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn() },
    };
    const telegram = { sendMessage: vi.fn().mockResolvedValue({ ok: true }), answerCallbackQuery: vi.fn(), editMessageText: vi.fn().mockResolvedValue({ ok: true }) };
    const service = new TelegramJoinService(db, { limit: vi.fn() } as never, telegram as never, {} as never, {} as never, { enabled: true } as never);
    await service.handleCallback(query('join:privacy:yes', 'Davom etishga rozimisiz?'));
    expect(telegram.editMessageText).toHaveBeenLastCalledWith(42, 7, 'Davom etishga rozimisiz?\n\n✅ Roziman');

    db.telegramJoinSession.findUnique.mockResolvedValue({ ...session, step: 'VACANCY' });
    db.vacancy.findFirst.mockResolvedValue({ id: 5, title: 'SMM Lead', fieldId: null, field: null });
    await service.handleCallback(query('join:vac:5', 'Qaysi vakansiya?'));
    expect(telegram.editMessageText).toHaveBeenLastCalledWith(42, 7, 'Qaysi vakansiya?\n\n✅ SMM Lead');

    db.telegramJoinSession.findUnique.mockResolvedValue({ ...session, step: 'PRIVACY' });
    await service.handleCallback(query('join:privacy:no', 'Davom etishga rozimisiz?'));
    expect(telegram.editMessageText).toHaveBeenLastCalledWith(42, 7, 'Davom etishga rozimisiz?\n\n✅ Rad etaman');
  });
});

describe('voice, photos and stickers during an application', () => {
  function setup(sessions: { join?: Date | null; apply?: Date | null }, language = 'ru') {
    const db: any = {
      telegramJoinSession: { findUnique: vi.fn().mockResolvedValue(sessions.join ? { expiresAt: sessions.join } : null) },
      telegramApplySession: { findUnique: vi.fn().mockResolvedValue(sessions.apply ? { expiresAt: sessions.apply } : null) },
      telegramUserLanguage: { findUnique: vi.fn().mockResolvedValue({ language }) },
    };
    const api = { sendMessage: vi.fn().mockResolvedValue({ ok: true }), getMe: vi.fn() };
    const languages = new TelegramLanguageService(db, api as never);
    const service = new TelegramService(db, {} as never, {} as never, api as never, {} as never, undefined, undefined, undefined, languages);
    return { api, service };
  }
  const voice = { message_id: 1, chat, from: user, date: 1 } as never;
  const future = () => new Date(Date.now() + 60_000);

  it('says what the bot expects, in the candidate’s language', async () => {
    const { api, service } = setup({ join: future() });
    await service.handleMessage(voice);
    expect(api.sendMessage).toHaveBeenCalledWith(42, botText('ru', 'nonTextReply'));
    const apply = setup({ apply: future() }, 'tg');
    await apply.service.handleMessage(voice);
    expect(apply.api.sendMessage).toHaveBeenCalledWith(42, botText('tg', 'nonTextReply'));
  });

  it('stays silent outside an application, after it expired, and in group chats', async () => {
    const none = setup({});
    await none.service.handleMessage(voice);
    const expired = setup({ join: new Date(Date.now() - 1000) });
    await expired.service.handleMessage(voice);
    const group = setup({ join: future() });
    await group.service.handleMessage({ message_id: 1, chat: { id: -1, type: 'supergroup' }, from: user, date: 1 } as never);
    for (const ctx of [none, expired, group]) expect(ctx.api.sendMessage).not.toHaveBeenCalled();
  });

  it('never fails the webhook when the lookup breaks', async () => {
    const { api, service } = setup({ join: future() });
    (service as any).db.telegramJoinSession.findUnique.mockRejectedValue(new Error('db down'));
    await expect(service.handleMessage(voice)).resolves.toBeUndefined();
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it('marks the picked language on the language picker message', async () => {
    const db: any = { telegramUserLanguage: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() } };
    const api = { sendMessage: vi.fn(), answerCallbackQuery: vi.fn(), editMessageText: vi.fn().mockResolvedValue({ ok: true }), getMe: vi.fn() };
    const languages = new TelegramLanguageService(db, api as never);
    const menu = { sendMenu: vi.fn(), handleText: vi.fn(), handleCallback: vi.fn().mockResolvedValue(false) };
    const service = new TelegramService(db, {} as never, {} as never, api as never, {} as never, undefined, undefined, undefined, languages, undefined, menu as never);
    await service.handleCallbackQuery(query('lang:ru', 'Tilni tanlang / Выберите язык'));
    expect(api.editMessageText).toHaveBeenCalledWith(42, 7, expect.stringContaining('✅ 🇷🇺 Русский'));
  });
});
