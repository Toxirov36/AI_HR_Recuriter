import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Database } from '../../../database/prisma.service';
import { Security } from '../../../common/utils/security';
import { TelegramApiService } from '../telegram-api.service';
import type { TelegramBusinessMessage } from '../types/telegram.types';

const MAX_TELEGRAM_CV_BYTES = 10 * 1024 * 1024;
const NUDGE_INTERVAL_SECONDS = 24 * 60 * 60;

/**
 * A candidate who sends a CV to the HR's personal Telegram profile (Business chatbot) is not
 * processed there. The bot replies once per chat and day with a link to the candidate bot, where
 * the candidate picks a field, enters name and phone, uploads the CV and takes the test
 * (see TelegramJoinService). Only CV documents trigger the reply, so the HR's other
 * private chats are left alone.
 */
@Injectable()
export class BusinessMessageHandler {
  private readonly logger = new Logger(BusinessMessageHandler.name);
  constructor(
    @Inject(Database) private db: Database,
    @Optional() @Inject(TelegramApiService) private telegramApi?: TelegramApiService,
    @Optional() @Inject(Security) private security?: Security,
  ) {}

  async handle(message: TelegramBusinessMessage) {
    const connectionId = message.business_connection_id;
    const document = message.document;
    const sender = message.from;
    if (!connectionId || !document || !sender) return;

    const connection = await this.db.telegramBusinessConnection.findUnique({
      where: { id: connectionId, company: { isActive: true } },
      include: { company: { select: { name: true, publicToken: true } } },
    });
    if (!connection?.enabled || !connection.companyId || !connection.company) return;
    if (BigInt(sender.id) === connection.telegramUserId) return;

    const fileName = document.file_name?.trim();
    const mime = document.mime_type?.toLowerCase();
    const isCv =
      Boolean(fileName && /\.(pdf|docx)$/i.test(fileName)) &&
      (mime === 'application/pdf' ||
        mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    if (!isCv || (document.file_size ?? 0) > MAX_TELEGRAM_CV_BYTES) return;

    if (!this.telegramApi || !connection.canReply) {
      this.logger.warn('CV received on a Business connection without reply permission; no redirect sent');
      return;
    }
    if (!(await this.firstNudge(connectionId, message.chat.id))) return;

    try {
      const bot = await this.telegramApi.getMe();
      const link = `https://t.me/${bot.username}?start=join_${connection.company.publicToken}`;
      const text =
        `Assalomu alaykum!\n\nCV yuborganingiz uchun rahmat. ${connection.company.name} ga ariza topshirish va qisqa test topshirish uchun ` +
        `quyidagi botga o‘ting: ${link}\n\nBotda sohangizni tanlaysiz, ism va telefon raqamingizni yozasiz, CVni yuborasiz va testdan o‘tasiz.`;
      const delivery = await this.telegramApi.sendMessage(String(message.chat.id), text, {
        businessConnectionId: connectionId,
      });
      if (!delivery.ok) throw new Error(delivery.description || 'Telegram business reply failed');
    } catch (error) {
      this.logger.warn(`Failed to send the bot redirect: ${(error as Error).message}`);
    }
  }

  /** True once per Business chat per day (Redis NX key), so repeated files do not repeat the reply. */
  private async firstNudge(connectionId: string, chatId: number | string) {
    if (!this.security?.redis) return true;
    try {
      const stored = await this.security.redis.set(
        `telegram-join-nudge:${connectionId}:${chatId}`,
        '1',
        'EX',
        NUDGE_INTERVAL_SECONDS,
        'NX',
      );
      return stored === 'OK';
    } catch {
      return true;
    }
  }
}
