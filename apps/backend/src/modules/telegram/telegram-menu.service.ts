import { Inject, Injectable } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { TelegramApiService } from './telegram-api.service';
import { TelegramJoinService } from './telegram-join.service';
import { TelegramLanguageService } from './telegram-language.service';
import { TelegramMyApplicationsService } from './telegram-my-applications.service';
import { botText, type BotMessageKey } from './telegram-i18n';
import { mainMenuKeyboard, menuActionFor } from './telegram-menu';
import type { TelegramCallbackQuery, TelegramDirectMessage } from './types/telegram.types';

const MAX_BUTTONS = 20;
type Tr = (key: BotMessageKey, params?: Record<string, string | number>) => string;

/** The bot menu: browse hiring fields and their vacancies, see the user's applications, change language. */
@Injectable()
export class TelegramMenuService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(TelegramApiService) private telegram: TelegramApiService,
    @Inject(TelegramLanguageService) private languages: TelegramLanguageService,
    @Inject(TelegramMyApplicationsService) private applications: TelegramMyApplicationsService,
    @Inject(TelegramJoinService) private join: TelegramJoinService,
  ) {}

  private async tr(userId: string): Promise<Tr> {
    const lang = await this.languages.get(userId);
    return (key, params) => botText(lang, key, params);
  }

  /** Menu buttons and /menu, /help typed or tapped in a private chat. Returns false for any other text. */
  async handleText(message: TelegramDirectMessage): Promise<boolean> {
    if (!message.from || message.chat.type !== 'private' || !message.text) return false;
    const text = message.text.trim();
    const userId = String(message.from.id);
    const chatId = message.chat.id;
    const command = /^\/(menu|help)(@\w+)?$/i.exec(text)?.[1]?.toLowerCase();
    const action = command === 'help' ? 'help' : command === 'menu' ? 'menu' : menuActionFor(text);
    if (!action) return false;
    if (action === 'menu') await this.sendMenu(chatId, userId);
    else if (action === 'fields') await this.showFields(chatId, userId);
    else if (action === 'applications') await this.applications.show(chatId, userId);
    else if (action === 'language') await this.languages.ask(chatId, userId);
    else {
      const tr = await this.tr(userId);
      await this.telegram.sendMessage(chatId, tr('menuHelpText'), { replyMarkup: mainMenuKeyboard(tr) });
    }
    return true;
  }

  async handleCallback(query: TelegramCallbackQuery): Promise<boolean> {
    const data = query.data ?? '';
    if (data !== 'menu:home' && data !== 'menu:fields' && !/^(fld|fv):\d+$/.test(data)) return false;
    const userId = String(query.from.id);
    const chatId = query.message?.chat.id ?? query.from.id;
    await this.telegram.answerCallbackQuery(query.id);

    if (data === 'menu:home') await this.sendMenu(chatId, userId);
    else if (data === 'menu:fields') await this.showFields(chatId, userId);
    else if (data.startsWith('fld:')) await this.showVacancies(chatId, userId, Number(data.slice(4)));
    else {
      const companyId = await this.languages.getCompany(userId);
      const tr = await this.tr(userId);
      if (!companyId) await this.telegram.sendMessage(chatId, tr('menuNoCompany'));
      else
        await this.join.startVacancy(
          { message_id: query.message?.message_id ?? 0, from: query.from, chat: { id: chatId, type: 'private' }, date: Math.floor(Date.now() / 1000) },
          companyId,
          Number(data.slice(3)),
        );
    }
    return true;
  }

  /** Plain /start: greet the candidate and show the menu. */
  async sendWelcome(chatId: number, userId: string, name: string) {
    const tr = await this.tr(userId);
    await this.sendMenu(chatId, userId, tr('welcome', { name }));
  }

  async sendMenu(chatId: number, userId: string, text?: string) {
    const tr = await this.tr(userId);
    await this.telegram.sendMessage(chatId, text ?? tr('menuPrompt'), { replyMarkup: mainMenuKeyboard(tr) });
  }

  private backRow(tr: Tr, callback: string) {
    return [{ text: tr('btnBack'), callback_data: callback }];
  }

  private async showFields(chatId: number, userId: string) {
    const tr = await this.tr(userId);
    const companyId = await this.languages.getCompany(userId);
    if (!companyId) {
      await this.telegram.sendMessage(chatId, tr('menuNoCompany'));
      return;
    }
    const open = { status: 'ACTIVE' as const, company: { isActive: true } };
    const fields = await this.db.vacancyField.findMany({
      where: { companyId, isActive: true, vacancies: { some: open } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: MAX_BUTTONS,
      select: { id: true, name: true, _count: { select: { vacancies: { where: open } } } },
    });
    if (!fields.length) {
      await this.telegram.sendMessage(chatId, tr('fieldsEmpty'), { replyMarkup: { inline_keyboard: [this.backRow(tr, 'menu:home')] } });
      return;
    }
    await this.telegram.sendMessage(chatId, tr('fieldsTitle'), {
      replyMarkup: {
        inline_keyboard: [
          ...fields.map((field) => [{ text: `${field.name} (${field._count.vacancies})`.slice(0, 60), callback_data: `fld:${field.id}` }]),
          this.backRow(tr, 'menu:home'),
        ],
      },
    });
  }

  private async showVacancies(chatId: number, userId: string, fieldId: number) {
    const tr = await this.tr(userId);
    const companyId = await this.languages.getCompany(userId);
    if (!companyId) {
      await this.telegram.sendMessage(chatId, tr('menuNoCompany'));
      return;
    }
    const field = await this.db.vacancyField.findFirst({ where: { id: fieldId, companyId, isActive: true }, select: { id: true, name: true } });
    if (!field) {
      await this.showFields(chatId, userId);
      return;
    }
    const back = { inline_keyboard: [this.backRow(tr, 'menu:fields')] };
    // One application per field: any earlier application in it closes the whole field.
    const candidate = await this.db.candidate.findUnique({ where: { companyId_telegramUserId: { companyId, telegramUserId: userId } }, select: { id: true } });
    const applied = candidate
      ? await this.db.application.findFirst({ where: { companyId, candidateId: candidate.id, vacancy: { fieldId: field.id } }, select: { id: true } })
      : null;
    if (applied) {
      await this.telegram.sendMessage(chatId, tr('alreadyAppliedField', { field: field.name }), {
        replyMarkup: { inline_keyboard: [[{ text: tr('myAppsButton'), callback_data: 'my:apps' }], this.backRow(tr, 'menu:fields')] },
      });
      return;
    }
    const vacancies = await this.db.vacancy.findMany({
      where: { companyId, fieldId: field.id, status: 'ACTIVE', company: { isActive: true } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_BUTTONS,
      select: { id: true, title: true },
    });
    if (!vacancies.length) {
      await this.telegram.sendMessage(chatId, tr('fieldNoVacancies'), { replyMarkup: back });
      return;
    }
    await this.telegram.sendMessage(chatId, tr('fieldVacancies', { field: field.name }), {
      replyMarkup: {
        inline_keyboard: [...vacancies.map((vacancy) => [{ text: vacancy.title.slice(0, 60), callback_data: `fv:${vacancy.id}` }]), this.backRow(tr, 'menu:fields')],
      },
    });
  }
}
