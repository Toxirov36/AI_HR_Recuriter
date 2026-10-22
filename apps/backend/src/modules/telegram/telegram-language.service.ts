import { Inject, Injectable } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { TelegramApiService } from './telegram-api.service';
import { BOT_LANGS, BOT_LANG_LABELS, DEFAULT_BOT_LANG, LANGUAGE_PROMPT, isBotLang, type BotLang } from './telegram-i18n';

/** Remembers which language each Telegram user picked for the candidate bot. */
@Injectable()
export class TelegramLanguageService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(TelegramApiService) private telegram: TelegramApiService,
  ) {}

  /** The user's language; Uzbek until they choose another. */
  async get(userId: string): Promise<BotLang> {
    const row = await this.db.telegramUserLanguage.findUnique({ where: { telegramUserId: userId }, select: { language: true } });
    return isBotLang(row?.language) ? row.language : DEFAULT_BOT_LANG;
  }

  async has(userId: string): Promise<boolean> {
    const row = await this.db.telegramUserLanguage.findUnique({ where: { telegramUserId: userId }, select: { language: true } });
    return isBotLang(row?.language);
  }

  /** Stores the choice and returns the deep link the user opened before choosing, if any. */
  async choose(userId: string, language: BotLang): Promise<string | null> {
    const row = await this.db.telegramUserLanguage.findUnique({ where: { telegramUserId: userId }, select: { pendingStart: true } });
    await this.db.telegramUserLanguage.upsert({
      where: { telegramUserId: userId },
      create: { telegramUserId: userId, language },
      update: { language, pendingStart: null },
    });
    return row?.pendingStart ?? null;
  }

  /** Remembers the company of the last link the user opened; the bot menu browses its fields. */
  async setCompany(userId: string, companyId: number) {
    await this.db.telegramUserLanguage.upsert({
      where: { telegramUserId: userId },
      create: { telegramUserId: userId, companyId },
      update: { companyId },
    });
  }

  async getCompany(userId: string): Promise<number | null> {
    const row = await this.db.telegramUserLanguage.findUnique({ where: { telegramUserId: userId }, select: { companyId: true } });
    return row?.companyId ?? null;
  }

  /** Shows the language buttons. `pendingStart` (e.g. "join_<token>") resumes once a language is picked. */
  async ask(chatId: number, userId: string, pendingStart?: string) {
    if (pendingStart) {
      await this.db.telegramUserLanguage.upsert({
        where: { telegramUserId: userId },
        create: { telegramUserId: userId, pendingStart },
        update: { pendingStart },
      });
    }
    await this.telegram.sendMessage(chatId, LANGUAGE_PROMPT, {
      replyMarkup: { inline_keyboard: [BOT_LANGS.map((code) => ({ text: BOT_LANG_LABELS[code], callback_data: `lang:${code}` }))] },
    });
  }
}
