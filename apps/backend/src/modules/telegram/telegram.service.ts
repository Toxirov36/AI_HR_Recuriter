import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Database } from '../../database/prisma.service';
import { admin } from '../../common/guards/auth.guard';
import type { Identity } from '../../common/utils/security';
import { getConfig } from '../../config/app.config';
import { BusinessConnectionHandler } from './handlers/business-connection.handler';
import { BusinessMessageHandler } from './handlers/business-message.handler';
import type { TelegramUpdate } from './types/telegram.types';

@Injectable()
export class TelegramService {
  private readonly config = getConfig();
  constructor(
    @Inject(Database) private db: Database,
    @Inject(BusinessConnectionHandler) private connectionHandler: BusinessConnectionHandler,
    @Inject(BusinessMessageHandler) private messageHandler: BusinessMessageHandler,
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

  async handleUpdate(update: TelegramUpdate) {
    if (!Number.isSafeInteger(update.update_id)) return;
    try {
      await this.db.telegramWebhookUpdate.create({ data: { updateId: BigInt(update.update_id) } });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return;
      throw error;
    }
    try {
      if (update.business_connection)
        await this.connectionHandler.handle(update.business_connection);
      else if (update.business_message) await this.messageHandler.handle(update.business_message);
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
