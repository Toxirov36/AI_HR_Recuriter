import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramService } from './telegram.service';
import { BusinessMessageHandler } from './handlers/business-message.handler';

describe('Telegram integration', () => {
  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test_webhook_secret_123';
  });

  it('verifies the webhook secret and ignores duplicate Telegram updates', async () => {
    const create = vi.fn().mockRejectedValue({ code: 'P2002' });
    const connectionHandler = { handle: vi.fn() };
    const service = new TelegramService(
      { telegramWebhookUpdate: { create, delete: vi.fn() } } as never,
      connectionHandler as never,
      { handle: vi.fn() } as never,
    );

    expect(service.verifySecret('test_webhook_secret_123')).toBe(true);
    expect(service.verifySecret('wrong')).toBe(false);
    await service.handleUpdate({
      update_id: 123,
      business_connection: {
        id: 'connection',
        user: { id: 1 },
        user_chat_id: 2,
        is_enabled: true,
      },
    });
    expect(connectionHandler.handle).not.toHaveBeenCalled();
  });

  it('deduplicates a Telegram sender and queues an allowed CV without logging its content', async () => {
    const tx = {
      candidate: {
        upsert: vi.fn().mockResolvedValue({ id: 7 }),
      },
      resume: {
        create: vi.fn().mockResolvedValue({ id: 11 }),
      },
      candidateEvent: { createMany: vi.fn() },
    };
    const db = {
      telegramBusinessConnection: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'business-1',
          companyId: 3,
          enabled: true,
          telegramUserId: BigInt(999),
        }),
      },
      $transaction: vi.fn((callback) => callback(tx)),
      resume: { update: vi.fn() },
    };
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    const handler = new BusinessMessageHandler(db as never, queue as never);

    await handler.handle({
      message_id: 1,
      business_connection_id: 'business-1',
      chat: { id: 5 },
      from: { id: 42, first_name: 'Ali', username: 'ali' },
      document: {
        file_id: 'file-1',
        file_unique_id: 'unique-1',
        file_name: 'cv.pdf',
        mime_type: 'application/pdf',
        file_size: 1024,
      },
    });

    expect(tx.candidate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId_telegramUserId: { companyId: 3, telegramUserId: '42' } },
        create: expect.objectContaining({ source: 'TELEGRAM' }),
      }),
    );
    expect(queue.add).toHaveBeenCalledWith({
      resumeId: 11,
      candidateId: 7,
      companyId: 3,
      fileId: 'file-1',
    });
  });
});
