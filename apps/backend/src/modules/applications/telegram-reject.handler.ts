import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { getConfig } from '../../config/app.config';
import { Database } from '../../database/prisma.service';
import { TelegramApiService } from '../telegram/telegram-api.service';
import { TelegramCallbackRegistry } from '../telegram/telegram-callback.registry';
import { hrCardKeyboard } from '../telegram/telegram-hr-card';
import type { TelegramCallbackQuery } from '../telegram/types/telegram.types';
import { ApplicationsService } from './applications.service';

const PREFIX = 'action:reject';

/**
 * The "Rad etish" button on the HR's Telegram card. It asks to confirm first, because rejecting also sends the
 * candidate a polite rejection message (ApplicationsService.changeStage does that for REJECTED).
 *   action:reject:<id>    -> asks "are you sure?"
 *   action:rejectok:<id>  -> rejects
 *   action:rejectno:<id>  -> restores the card's buttons
 */
@Injectable()
export class TelegramRejectHandler implements OnModuleInit {
  private readonly config = getConfig();

  constructor(
    @Inject(Database) private db: Database,
    @Inject(TelegramApiService) private telegram: TelegramApiService,
    @Inject(TelegramCallbackRegistry) private registry: TelegramCallbackRegistry,
    @Inject(ApplicationsService) private applications: ApplicationsService,
  ) {}

  onModuleInit() {
    this.registry.register(PREFIX, (query) => this.handle(query));
  }

  async handle(query: TelegramCallbackQuery) {
    const match = /^action:reject(ok|no)?:(\d+)$/.exec(query.data ?? '');
    if (!match) {
      await this.telegram.answerCallbackQuery(query.id, 'Noto‘g‘ri tugma', true);
      return;
    }
    const mode = match[1] ?? 'ask';
    const applicationId = Number(match[2]);

    const application = await this.db.application.findFirst({
      where: { id: applicationId, company: { isActive: true } },
      select: { id: true, companyId: true, status: true },
    });
    if (!application) {
      await this.telegram.answerCallbackQuery(query.id, 'Ariza topilmadi yoki o‘chirilgan', true);
      return;
    }

    // Only an enabled HR, recruiter or admin of the application's own company may act.
    const connection = query.from?.id
      ? await this.db.telegramBusinessConnection.findFirst({
          where: {
            telegramUserId: BigInt(query.from.id),
            enabled: true,
            companyId: application.companyId,
            user: { isActive: true, companyId: application.companyId, role: { in: ['ADMIN', 'HR', 'RECRUITER'] } },
          },
          include: { user: true },
        })
      : null;
    if (!connection?.user) {
      await this.telegram.answerCallbackQuery(query.id, 'Bu amal uchun ruxsat yo‘q.', true);
      return;
    }

    if (application.status === 'REJECTED') {
      await this.telegram.answerCallbackQuery(query.id, 'Nomzod allaqachon rad etilgan.');
      return;
    }
    if (application.status === 'HIRED') {
      await this.telegram.answerCallbackQuery(query.id, 'Nomzod qabul qilingan, rad etib bo‘lmaydi.', true);
      return;
    }

    const chatId = query.message?.chat?.id;
    const messageId = query.message?.message_id;
    const original = query.message?.text ?? '';
    const viewUrl = `${this.config.FRONTEND_ORIGIN}/applications/${application.id}`;
    const edit = (text: string, replyMarkup?: unknown) =>
      chatId && messageId ? this.telegram.editMessageText(chatId, messageId, text, replyMarkup ? { replyMarkup } : undefined) : Promise.resolve();

    if (mode === 'ask') {
      await this.telegram.answerCallbackQuery(query.id);
      await edit(`${original}\n\n❓ Nomzod rad etilsinmi? Unga muloyim rad javobi yuboriladi.`, {
        inline_keyboard: [[
          { text: '✔️ Ha, rad etish', callback_data: `${PREFIX}ok:${application.id}` },
          { text: '↩️ Bekor qilish', callback_data: `${PREFIX}no:${application.id}` },
        ]],
      });
      return;
    }

    if (mode === 'no') {
      await this.telegram.answerCallbackQuery(query.id);
      await edit(stripQuestion(original), hrCardKeyboard(application.id, viewUrl));
      return;
    }

    const actorName = [query.from.first_name, query.from.last_name].filter(Boolean).join(' ') || connection.user.fullName;
    try {
      await this.applications.changeStage(
        application.companyId,
        application.id,
        { id: connection.user.id, fullName: `${actorName} (Telegram)` },
        { status: 'REJECTED', expectedStatus: application.status },
      );
    } catch (error) {
      await this.telegram.answerCallbackQuery(query.id, (error as Error).message.slice(0, 190), true);
      return;
    }
    await this.telegram.answerCallbackQuery(query.id, 'Nomzod rad etildi, unga javob yuboriladi.');
    await edit(`${stripQuestion(original)}\n\n❌ Rad etildi · ${actorName}`);
  }
}

function stripQuestion(text: string) {
  return text.replace(/\n\n❓ Nomzod rad etilsinmi\?[^\n]*$/u, '');
}
