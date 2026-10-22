import { describe, expect, it, vi } from 'vitest';
import { BOT_LANGS, BOT_MESSAGE_KEYS, botLangFromTelegram, botText, matchesAnyLang } from './telegram-i18n';
import { TelegramLanguageService } from './telegram-language.service';
import { TelegramService } from './telegram.service';
import { TelegramJoinService } from './telegram-join.service';

const KEYS = BOT_MESSAGE_KEYS;

const token = '123e4567-e89b-12d3-a456-426614174000';
const user = { id: 42, first_name: 'Ali' };
const message = (text: string) => ({ message_id: 1, from: user, chat: { id: 42, type: 'private' }, date: 1, text });

describe('bot message catalog', () => {
  it('keeps the same placeholders in every language', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const key of KEYS) {
      const expected = placeholders(botText('uz', key));
      for (const lang of BOT_LANGS) expect(placeholders(botText(lang, key)), `${lang}.${key}`).toEqual(expected);
    }
  });

  it('fills placeholders and leaves unknown ones untouched', () => {
    expect(botText('ru', 'joinFinish', { score: 80, correct: 8, total: 10, hard: 90, soft: 70 })).toContain('80%');
    expect(botText('tg', 'askPhone', { name: 'Азиз' })).toContain('Азиз');
    expect(botText('uz', 'askPhone')).toContain('{name}');
  });

  it('recognises reply-keyboard buttons in any language', () => {
    for (const lang of BOT_LANGS) {
      expect(matchesAnyLang(botText(lang, 'btnCancel'), 'btnCancel')).toBe(true);
      expect(matchesAnyLang(botText(lang, 'btnBack'), 'btnCancel')).toBe(false);
    }
  });

  it('maps Telegram language codes to bot languages', () => {
    expect(botLangFromTelegram('ru-RU')).toBe('ru');
    expect(botLangFromTelegram('tg')).toBe('tg');
    expect(botLangFromTelegram('en')).toBeNull();
    expect(botLangFromTelegram(undefined)).toBeNull();
  });
});

describe('language choice in the bot', () => {
  function setup(stored: { language: string | null; pendingStart: string | null } | null) {
    let row = stored;
    const db: any = {
      telegramUserLanguage: {
        findUnique: vi.fn(async () => row),
        upsert: vi.fn(async ({ create, update }: any) => {
          row = row ? { ...row, ...update } : { language: null, pendingStart: null, ...create };
          return row;
        }),
      },
    };
    const api = { sendMessage: vi.fn().mockResolvedValue({ ok: true }), answerCallbackQuery: vi.fn(), getMe: vi.fn() };
    const languages = new TelegramLanguageService(db, api as never);
    const join = { start: vi.fn() };
    const service = new TelegramService(db, {} as never, {} as never, api as never, {} as never, undefined, undefined, join as never, languages);
    return { db, api, languages, join, service };
  }

  it('asks for a language before the first deep link and resumes it after the choice', async () => {
    const { api, join, service } = setup(null);
    await service.handleMessage(message(`/start join_${token}`) as never);
    expect(join.start).not.toHaveBeenCalled();
    expect(api.sendMessage.mock.calls[0][2].replyMarkup.inline_keyboard[0].map((b: any) => b.callback_data)).toEqual(['lang:uz', 'lang:ru', 'lang:tg']);

    await service.handleCallbackQuery({ id: 'cb', from: user, message: { message_id: 1, chat: { id: 42 } }, data: 'lang:ru' } as never);
    expect(api.answerCallbackQuery).toHaveBeenCalledWith('cb', expect.stringContaining('Русский'));
    expect(join.start).toHaveBeenCalledWith(expect.objectContaining({ text: `/start join_${token}` }), token);
  });

  it('skips the picker once a language is stored, and /language reopens it', async () => {
    const { api, join, service } = setup({ language: 'tg', pendingStart: null });
    await service.handleMessage(message(`/start join_${token}`) as never);
    expect(join.start).toHaveBeenCalledTimes(1);
    await service.handleMessage(message('/language') as never);
    expect(api.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining('Забонро'), expect.anything());
  });

  it('ignores an unknown language code', async () => {
    const { db, service } = setup(null);
    await service.handleCallbackQuery({ id: 'cb', from: user, data: 'lang:xx' } as never);
    expect(db.telegramUserLanguage.upsert).not.toHaveBeenCalled();
  });

  it('answers the candidate in the stored language', async () => {
    const { db, api } = setup({ language: 'ru', pendingStart: null });
    const joinDb: any = {
      telegramJoinSession: { findUnique: vi.fn().mockResolvedValue({ telegramUserId: '42', companyId: 3, step: 'NAME', expiresAt: new Date(Date.now() + 60_000) }), updateMany: vi.fn(), deleteMany: vi.fn() },
      ...db,
    };
    const languages = new TelegramLanguageService(joinDb, api as never);
    const service = new TelegramJoinService(joinDb, {} as never, api as never, {} as never, {} as never, undefined, undefined, languages);
    await service.handleText(message('x') as never);
    expect(api.sendMessage).toHaveBeenCalledWith(42, botText('ru', 'nameInvalid'));
  });
});
