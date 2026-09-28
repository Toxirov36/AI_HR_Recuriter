import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Database } from '../../database/prisma.service';
import { admin } from '../../common/guards/auth.guard';
import type { Identity } from '../../common/utils/security';
import { getConfig } from '../../config/app.config';
import { BusinessConnectionHandler } from './handlers/business-connection.handler';
import { BusinessMessageHandler } from './handlers/business-message.handler';
import { TelegramApiService } from './telegram-api.service';
import { AuditService } from '../audit/audit.service';
import type {
  TelegramCallbackQuery,
  TelegramDirectMessage,
  TelegramUpdate,
} from './types/telegram.types';

@Injectable()
export class TelegramService {
  private readonly config = getConfig();

  constructor(
    @Inject(Database) private db: Database,
    @Inject(BusinessConnectionHandler) private connectionHandler: BusinessConnectionHandler,
    @Inject(BusinessMessageHandler) private messageHandler: BusinessMessageHandler,
    @Inject(TelegramApiService) private telegramApi: TelegramApiService,
    @Inject(AuditService) private audit: AuditService,
  ) {}

  verifySecret(value?: string) {
    const expected = this.config.TELEGRAM_WEBHOOK_SECRET;
    if (!expected || !value) return false;
    const actualBuffer = Buffer.from(value);
    const expectedBuffer = Buffer.from(expected);
    return (
      actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  async createConnectLink(user: Identity) {
    const token = `connect_${randomBytes(8).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes validity

    await this.db.telegramConnectRequest.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        token,
        expiresAt,
      },
    });

    const bot = await this.telegramApi.getMe();
    const connectUrl = `https://t.me/${bot.username}?start=${token}`;

    return {
      token,
      connectUrl,
      expiresAt: expiresAt.toISOString(),
      botUsername: bot.username,
    };
  }

  async handleMessage(message: TelegramDirectMessage) {
    if (!message?.text) return;
    const text = message.text.trim();

    const startMatch = text.match(/^\/start(?:\s+(connect_[a-zA-Z0-9_-]+))?/);
    if (!startMatch) return;

    const token = startMatch[1];
    const bot = await this.telegramApi.getMe();
    const firstName = message.from?.first_name || 'Hurmatli foydalanuvchi';

    if (!token) {
      const welcome =
        `👋 Assalomu alaykum, ${firstName}!\n\n` +
        `Ushbu bot HR platformasining rasmiy Secretary boti hisoblanadi.\n\n` +
        `Telegram hisobingizni HR tizimiga ulash uchun platforma sozlamalari (Settings) bo'limiga o'ting va «Connect Telegram» tugmasini bosing.`;
      await this.telegramApi.sendMessage(message.chat.id, welcome);
      return;
    }

    const connectRequest = await this.db.telegramConnectRequest.findFirst({
      where: {
        token,
        used: false,
        expiresAt: { gt: new Date() },
      },
      include: { company: true },
    });

    if (!connectRequest) {
      const expired =
        `⚠️ Ushbu ulanish havolasi muddati o'tgan yoki allaqachon ishlatilgan.\n\n` +
        `Iltimos, HR platformasi sozlamalaridan qaytadan «Connect Telegram» tugmasini bosing va yangi havola oling.`;
      await this.telegramApi.sendMessage(message.chat.id, expired);
      return;
    }

    // Link telegramUserId to connectRequest
    await this.db.telegramConnectRequest.update({
      where: { id: connectRequest.id },
      data: {
        telegramUserId: String(message.from?.id || message.chat.id),
        telegramUsername: message.from?.username || null,
      },
    });

    const instruction =
      `🎉 Assalomu alaykum, ${firstName}!\n\n` +
      `Siz «${connectRequest.company.name}» HR tizimi bilan ulanish jarayonini boshladingiz.\n\n` +
      `Telegram hisobingizni to'liq ulash uchun quyidagi 4 ta oddiy qadamni bajaring:\n\n` +
      `1️⃣ Telegram Sozlamalari (Settings) ga kiring\n` +
      `2️⃣ «Telegram Business» → «Chatbots» (Chat-botlar) bo'limini oching\n` +
      `3️⃣ Ushbu botni (@${bot.username}) tanlang\n` +
      `4️⃣ «Read Messages» va «Reply to Messages» ruxsatlarini yoqib, «Connect» (Ulash) tugmasini bosing.\n\n` +
      `⚡ Ulaganingizdan so'ng, saytda holat avtomatik ravishda tasdiqlanadi!`;

    await this.telegramApi.sendMessage(message.chat.id, instruction);
  }

  async getStatus(user: Identity) {
    let connection = await this.db.telegramBusinessConnection.findFirst({
      where: { companyId: user.companyId, enabled: true },
      orderBy: { updatedAt: 'desc' },
    });

    // Reconcile only when /start proved ownership of this exact Telegram account.
    if (!connection) {
      const recentRequest = await this.db.telegramConnectRequest.findFirst({
        where: {
          companyId: user.companyId,
          used: false,
          telegramUserId: { not: null },
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (recentRequest?.telegramUserId) {
        const candidate = await this.db.telegramBusinessConnection.findFirst({
          where: {
            companyId: null,
            telegramUserId: BigInt(recentRequest.telegramUserId),
            enabled: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (candidate) {
          connection = await this.db.telegramBusinessConnection.update({
            where: { id: candidate.id },
            data: {
              companyId: user.companyId,
              userId: recentRequest.userId,
              telegramUsername: candidate.telegramUsername || recentRequest.telegramUsername || undefined,
            },
          });

          await this.db.telegramConnectRequest.update({
            where: { id: recentRequest.id },
            data: {
              used: true,
              telegramUserId: candidate.telegramUserId.toString(),
              telegramUsername: candidate.telegramUsername,
            },
          });

          await this.audit.log({
            companyId: user.companyId,
            userId: user.id,
            actorName: user.fullName,
            actorRole: user.role,
            action: 'TELEGRAM_CONNECTED',
            resourceType: 'TELEGRAM_CONNECTION',
            resourceId: candidate.id,
            details: {
              telegramUserId: candidate.telegramUserId.toString(),
              telegramUsername: candidate.telegramUsername,
              autoReconciled: true,
            },
          });
        }
      }
    }

    const pending = !connection
      ? await this.db.telegramConnectRequest.findFirst({
          where: {
            companyId: user.companyId,
            userId: user.id,
            used: false,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
          select: { telegramUserId: true, telegramUsername: true, expiresAt: true },
        })
      : null;
    const bot = await this.telegramApi.getMe();

    return {
      connected: Boolean(connection),
      setup: pending
        ? {
            telegramVerified: Boolean(pending.telegramUserId),
            telegramUsername: pending.telegramUsername,
            expiresAt: pending.expiresAt.toISOString(),
          }
        : null,
      connection: connection
        ? {
            id: connection.id,
            telegramUserId: connection.telegramUserId.toString(),
            telegramUsername: connection.telegramUsername,
            canReply: connection.canReply,
            canReadMessages: connection.canReadMessages,
            enabled: connection.enabled,
            createdAt: connection.createdAt.toISOString(),
          }
        : null,
      botUsername: bot.username,
    };
  }

  async disconnect(user: Identity) {
    admin(user);
    const existing = await this.db.telegramBusinessConnection.findMany({
      where: { companyId: user.companyId },
    });

    if (!existing.length) {
      return { ok: true, message: 'Ulanish mavjud emas' };
    }

    await this.db.telegramBusinessConnection.deleteMany({
      where: { companyId: user.companyId },
    });

    await this.audit.log({
      companyId: user.companyId,
      userId: user.id,
      actorName: user.fullName,
      actorRole: user.role,
      action: 'TELEGRAM_DISCONNECTED',
      resourceType: 'TELEGRAM_CONNECTION',
      resourceId: existing[0]?.id || 'all',
      details: {
        disconnectedConnectionsCount: existing.length,
      },
    });

    return { ok: true };
  }

  async handleUpdate(update: TelegramUpdate) {
    if (!Number.isSafeInteger(update.update_id)) return;
    try {
      await this.db.telegramWebhookUpdate.create({ data: { updateId: BigInt(update.update_id) } });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return;
      throw error;
    }
    try {
      if (update.message) {
        await this.handleMessage(update.message);
      } else if (update.business_connection) {
        await this.connectionHandler.handle(update.business_connection);
      } else if (update.business_message) {
        await this.messageHandler.handle(update.business_message);
      } else if (update.callback_query) {
        await this.handleCallbackQuery(update.callback_query);
      }
      void this.db.telegramWebhookUpdate
        .deleteMany({
          where: { createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        })
        .catch(() => undefined);
    } catch (error) {
      await this.db.telegramWebhookUpdate
        .delete({ where: { updateId: BigInt(update.update_id) } })
        .catch(() => undefined);
      throw error;
    }
  }

  async handleCallbackQuery(query: TelegramCallbackQuery) {
    if (!query?.data) return;
    const data = query.data.trim();

    if (data.startsWith('action:interview:')) {
      const applicationId = parseInt(data.replace('action:interview:', ''), 10);
      if (isNaN(applicationId)) {
        await this.telegramApi.answerCallbackQuery(query.id, 'Noto‘g‘ri ariza ID', true);
        return;
      }

      const application = await this.db.application.findUnique({
        where: { id: applicationId, company: { isActive: true } },
        include: {
          candidate: true,
          vacancy: true,
          company: true,
        },
      });

      if (!application) {
        await this.telegramApi.answerCallbackQuery(
          query.id,
          'Ariza topilmadi yoki o‘chirilgan',
          true,
        );
        return;
      }

      if (application.status === 'INTERVIEW') {
        await this.telegramApi.answerCallbackQuery(
          query.id,
          'Nomzod allaqachon suhbat bosqichida!',
        );
        return;
      }

      if (
        application.status === 'OFFER' ||
        application.status === 'HIRED' ||
        application.status === 'REJECTED'
      ) {
        await this.telegramApi.answerCallbackQuery(
          query.id,
          `Arizaning joriy holati: ${application.status}`,
          true,
        );
        return;
      }

      // Identify recruiter from connection
      const senderTgId = query.from?.id ? BigInt(query.from.id) : null;
      const connection = senderTgId
        ? await this.db.telegramBusinessConnection.findFirst({
            where: { telegramUserId: senderTgId, enabled: true, companyId: application.companyId, user: { isActive: true, companyId: application.companyId, role: { in: ['ADMIN', 'HR', 'RECRUITER'] } } },
            include: { user: true },
          })
        : null;

      if (!connection?.user) {
        await this.telegramApi.answerCallbackQuery(query.id, 'Bu amal uchun ruxsat yo‘q.', true);
        return;
      }
      const actorName =
        [query.from?.first_name, query.from?.last_name].filter(Boolean).join(' ') ||
        connection?.user?.fullName ||
        'Telegram Recruiter';
      const actorId = connection?.userId || 1;

      // Update application stage in database
      await this.db.$transaction(async (tx) => {
        await tx.application.update({
          where: { id: applicationId },
          data: { status: 'INTERVIEW' },
        });
        await tx.applicationStageChange.create({
          data: {
            applicationId,
            fromStatus: application.status,
            toStatus: 'INTERVIEW',
            actorId,
            actorName: `${actorName} (Telegram)`,
          },
        });
      });

      // Send candidate interview invitation link
      const schedulingUrl = `${this.config.FRONTEND_ORIGIN}/interview/schedule?appId=${applicationId}`;
      if (application.candidate.telegramUserId) {
        const candidateMsg =
          `🎉 Assalomu alaykum, ${application.candidate.fullName}!\n\n` +
          `Sizni «${application.company.name}» kompaniyasining «${application.vacancy.title}» vakansiyasi bo'yicha suhbat (interview) bosqichiga taklif etamiz!\n\n` +
          `Suhbat uchun o'zingizga qulay vaqtni tanlang:\n` +
          `👉 ${schedulingUrl}\n\n` +
          `Savollaringiz bo'lsa, bemalol yozishingiz mumkin. Omad tilaymiz!`;

        const bConnId =
          connection?.id ||
          (
            await this.db.telegramBusinessConnection.findFirst({
              where: { companyId: application.companyId, enabled: true, canReply: true },
            })
          )?.id;

        if (bConnId) {
          await this.telegramApi
            .sendMessage(application.candidate.telegramUserId, candidateMsg, {
              businessConnectionId: bConnId,
            })
            .catch(() => undefined);
        }
      }

      await this.telegramApi.answerCallbackQuery(
        query.id,
        '✅ Nomzod suhbatga chaqirildi va taklifnoma yuborildi!',
      );

      // Edit original message to reflect interview invitation
      if (query.message?.chat?.id && query.message?.message_id) {
        const originalText = query.message.text || '';
        const updatedText =
          `${originalText}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `✅ <b>Suhbatga chaqirildi!</b>\n` +
          `👤 <b>Mas'ul:</b> ${actorName}\n` +
          `📅 <b>Sana:</b> ${new Date().toLocaleDateString('uz-UZ')}`;

        const viewUrl = `${this.config.FRONTEND_ORIGIN}/applications/${applicationId}`;
        await this.telegramApi.editMessageText(
          query.message.chat.id,
          query.message.message_id,
          updatedText,
          {
            parseMode: 'HTML',
            replyMarkup: {
              inline_keyboard: [[{ text: '👁 Nomzod profilini ochish', url: viewUrl }]],
            },
          },
        );
      }
    }
  }

  async claim(user: Identity, connectionId: string) {
    admin(user);
    const connection = await this.db.telegramBusinessConnection.findUnique({
      where: { id: connectionId },
      select: { companyId: true, enabled: true },
    });
    if (!connection) throw new NotFoundException('Telegram business connection not found');
    if (connection.companyId && connection.companyId !== user.companyId)
      throw new ConflictException('Telegram business connection is already claimed');
    await this.db.telegramBusinessConnection.update({
      where: { id: connectionId },
      data: { companyId: user.companyId },
    });
    return { ok: true };
  }

  async connections(user: Identity) {
    admin(user);
    const connections = await this.db.telegramBusinessConnection.findMany({
      where: { companyId: user.companyId },
      orderBy: { updatedAt: 'desc' },
    });
    return connections.map((connection) => ({
      ...connection,
      telegramUserId: connection.telegramUserId.toString(),
      userChatId: connection.userChatId.toString(),
    }));
  }
}
