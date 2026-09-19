import { Inject, Injectable, Logger } from '@nestjs/common';
import { Database } from '../../../database/prisma.service';
import type { TelegramBusinessConnectionUpdate } from '../types/telegram.types';

@Injectable()
export class BusinessConnectionHandler {
  private readonly logger = new Logger(BusinessConnectionHandler.name);
  constructor(@Inject(Database) private db: Database) {}

  async handle(connection: TelegramBusinessConnectionUpdate) {
    await this.db.telegramBusinessConnection.upsert({
      where: { id: connection.id },
      update: {
        telegramUserId: BigInt(connection.user.id),
        userChatId: BigInt(connection.user_chat_id),
        enabled: connection.is_enabled,
        canReply: connection.rights?.can_reply ?? false,
        canReadMessages: connection.rights?.can_read_messages ?? false,
      },
      create: {
        id: connection.id,
        telegramUserId: BigInt(connection.user.id),
        userChatId: BigInt(connection.user_chat_id),
        enabled: connection.is_enabled,
        canReply: connection.rights?.can_reply ?? false,
        canReadMessages: connection.rights?.can_read_messages ?? false,
      },
    });
    this.logger.log(
      `Telegram business connection received; awaiting company claim: ${connection.id}`,
    );
  }
}
