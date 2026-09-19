import { Inject, Injectable, Logger } from '@nestjs/common';
import { Database } from '../../../database/prisma.service';
import { TelegramQueueService } from '../telegram-queue.service';
import type { TelegramBusinessMessage } from '../types/telegram.types';

const MAX_TELEGRAM_CV_BYTES = 10 * 1024 * 1024;

@Injectable()
export class BusinessMessageHandler {
  private readonly logger = new Logger(BusinessMessageHandler.name);
  constructor(
    @Inject(Database) private db: Database,
    @Inject(TelegramQueueService) private queue: TelegramQueueService,
  ) {}

  async handle(message: TelegramBusinessMessage) {
    const connectionId = message.business_connection_id;
    const document = message.document;
    const sender = message.from;
    if (!connectionId || !document || !sender) return;

    const connection = await this.db.telegramBusinessConnection.findUnique({
      where: { id: connectionId },
    });
    if (!connection?.enabled || !connection.companyId) return;
    if (BigInt(sender.id) === connection.telegramUserId) return;

    const fileName = document.file_name?.trim().slice(0, 180);
    const mime = document.mime_type?.toLowerCase();
    const extensionAllowed = Boolean(fileName && /\.(pdf|docx)$/i.test(fileName));
    const mimeAllowed =
      mime === 'application/pdf' ||
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (!extensionAllowed || !mimeAllowed) return;
    if ((document.file_size ?? 0) > MAX_TELEGRAM_CV_BYTES) {
      this.logger.warn('Telegram CV ignored because it exceeds the 10 MB limit');
      return;
    }

    const fullName =
      [sender.first_name, sender.last_name].filter(Boolean).join(' ').trim() ||
      `Telegram candidate ${sender.id}`;
    const result = await this.db.$transaction(async (tx) => {
      const candidate = await tx.candidate.upsert({
        where: {
          companyId_telegramUserId: {
            companyId: connection.companyId!,
            telegramUserId: String(sender.id),
          },
        },
        update: { telegramUsername: sender.username ?? null },
        create: {
          companyId: connection.companyId!,
          fullName,
          telegramUserId: String(sender.id),
          telegramUsername: sender.username ?? null,
          source: 'TELEGRAM',
        },
      });
      const resume = await tx.resume.create({
        data: {
          companyId: connection.companyId!,
          candidateId: candidate.id,
          fileName: fileName!,
          mimeType: mime,
          fileSize: document.file_size,
          telegramFileId: document.file_id,
        },
      });
      await tx.candidateEvent.createMany({
        data: [
          {
            companyId: connection.companyId!,
            candidateId: candidate.id,
            type: 'TELEGRAM_CV_RECEIVED',
            label: 'CV received from Telegram',
          },
          {
            companyId: connection.companyId!,
            candidateId: candidate.id,
            type: 'RESUME_QUEUED',
            label: 'CV processing queued',
          },
        ],
      });
      return { candidate, resume };
    });

    try {
      await this.queue.add({
        resumeId: result.resume.id,
        candidateId: result.candidate.id,
        companyId: connection.companyId,
        fileId: document.file_id,
      });
      this.logger.log(
        `Telegram CV queued candidateId=${result.candidate.id} resumeId=${result.resume.id}`,
      );
    } catch (error) {
      await this.db.resume.update({
        where: { id: result.resume.id },
        data: { status: 'FAILED', error: 'Queue unavailable' },
      });
      throw error;
    }
  }
}
