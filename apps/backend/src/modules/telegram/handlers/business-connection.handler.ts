import { Inject, Injectable, Logger } from '@nestjs/common';
import { Database } from '../../../database/prisma.service';
import { TelegramApiService } from '../telegram-api.service';
import { AuditService } from '../../audit/audit.service';
import type { TelegramBusinessConnectionUpdate } from '../types/telegram.types';

@Injectable()
export class BusinessConnectionHandler {
  private readonly logger = new Logger(BusinessConnectionHandler.name);

  constructor(
    @Inject(Database) private db: Database,
    @Inject(TelegramApiService) private telegramApi: TelegramApiService,
    @Inject(AuditService) private audit: AuditService,
  ) {}

  async handle(connection: TelegramBusinessConnectionUpdate) {
    const telegramUserIdStr = String(connection.user.id);
    const username = connection.user.username || null;

    // Only the Telegram account that opened the one-time /start link may claim it.
    let pendingRequest = await this.db.telegramConnectRequest.findFirst({
      where: {
        telegramUserId: telegramUserIdStr,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      include: { company: true, user: true },
    });
    const existing = await this.db.telegramBusinessConnection.findUnique({
      where: { id: connection.id }, select: { companyId: true },
    });
    if (existing?.companyId && pendingRequest?.companyId !== existing.companyId) {
      pendingRequest = null;
    }

    const companyId = pendingRequest?.companyId ?? undefined;
    const userId = pendingRequest?.userId ?? undefined;

    const canReply =
      connection.rights?.can_reply ?? (connection as { can_reply?: boolean }).can_reply ?? false;
    const canReadMessages =
      connection.rights?.can_read_messages ??
      (connection as { can_read_messages?: boolean }).can_read_messages ??
      false;

    const record = await this.db.telegramBusinessConnection.upsert({
      where: { id: connection.id },
      update: {
        companyId: companyId ?? undefined,
        userId: userId ?? undefined,
        telegramUserId: BigInt(connection.user.id),
        telegramUsername: username || pendingRequest?.telegramUsername || undefined,
        userChatId: BigInt(connection.user_chat_id),
        enabled: connection.is_enabled,
        canReply,
        canReadMessages,
      },
      create: {
        id: connection.id,
        companyId,
        userId,
        telegramUserId: BigInt(connection.user.id),
        telegramUsername: username || pendingRequest?.telegramUsername || null,
        userChatId: BigInt(connection.user_chat_id),
        enabled: connection.is_enabled,
        canReply,
        canReadMessages,
      },
    });

    if (pendingRequest && connection.is_enabled) {
      // Mark request as successfully connected
      await this.db.telegramConnectRequest.update({
        where: { id: pendingRequest.id },
        data: { used: true },
      });

      // Send congratulations message in Telegram
      const name = connection.user.first_name || pendingRequest.user.fullName;
      const message =
        `🎉 Tabriklaymiz, ${name}!\n\n` +
        `Telegram hisobingiz «${pendingRequest.company.name}» HR platformasiga muvaffaqiyatli ulandi! ✅\n\n` +
        `Endi nomzodlar sizga yuborgan rezyumelar to'g'ridan-to'g'ri tizimga kelib tushadi va ularga avtomatik xabarlar yuboriladi.`;

      await this.telegramApi.sendMessage(connection.user.id, message).catch(() => undefined);

      // Audit log
      await this.audit.log({
        companyId: pendingRequest.companyId,
        userId: pendingRequest.userId,
        actorName: pendingRequest.user.fullName,
        actorRole: pendingRequest.user.role,
        action: 'TELEGRAM_CONNECTED',
        resourceType: 'TELEGRAM_CONNECTION',
        resourceId: connection.id,
        details: {
          telegramUserId: telegramUserIdStr,
          telegramUsername: username,
          canReply: connection.rights?.can_reply ?? false,
          canReadMessages: connection.rights?.can_read_messages ?? false,
        },
      });

      this.logger.log(
        `Telegram business connection ${connection.id} linked to company ${pendingRequest.companyId} (user: ${pendingRequest.userId})`,
      );
    } else {
      this.logger.log(
        `Telegram business connection received: ${connection.id} (enabled: ${connection.is_enabled})`,
      );
    }

    return record;
  }
}
