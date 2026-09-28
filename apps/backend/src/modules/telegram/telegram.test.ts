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
      candidateEvent: { create: vi.fn().mockResolvedValue({}) },
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

  it('replies in the CV sender chat through the business connection only after Telegram accepts it', async () => {
    const tx = {
      candidate: { upsert: vi.fn().mockResolvedValue({ id: 7, fullName: 'Ali' }) },
      resume: { create: vi.fn().mockResolvedValue({ id: 11 }) },
      candidateEvent: { createMany: vi.fn() },
    };
    const candidateEventCreate = vi.fn().mockResolvedValue({});
    const db = {
      telegramBusinessConnection: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'business-1', companyId: 3, enabled: true, canReply: true,
          telegramUserId: BigInt(999),
        }),
      },
      $transaction: vi.fn((callback) => callback(tx)),
      candidateEvent: { create: candidateEventCreate },
      resume: { update: vi.fn() },
    };
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    const telegramApi = { sendMessage: vi.fn().mockResolvedValue({ ok: false, description: 'Forbidden' }) };
    const handler = new BusinessMessageHandler(db as never, queue as never, telegramApi as never);
    const message = {
      message_id: 1,
      business_connection_id: 'business-1',
      chat: { id: 42 },
      from: { id: 42, first_name: 'Ali' },
      document: {
        file_id: 'file-1', file_unique_id: 'unique-1', file_name: 'cv.pdf',
        mime_type: 'application/pdf', file_size: 1024,
      },
    };

    await handler.handle(message);
    expect(telegramApi.sendMessage).toHaveBeenCalledWith(
      '42', expect.stringContaining('Rezyumengiz muvaffaqiyatli qabul qilindi'),
      { businessConnectionId: 'business-1' },
    );
    expect(candidateEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'TELEGRAM_DELIVERY_FAILED' }),
    });

    telegramApi.sendMessage.mockResolvedValueOnce({ ok: true });
    await handler.handle(message);
    expect(candidateEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'TELEGRAM_AUTO_REPLY_SENT' }),
    });
  });

  it('handles action:interview:ID callback query and moves candidate to INTERVIEW', async () => {
    const tx = {
      application: { update: vi.fn().mockResolvedValue({}) },
      applicationStageChange: { create: vi.fn().mockResolvedValue({}) },
    };
    const db = {
      telegramWebhookUpdate: { create: vi.fn(), deleteMany: vi.fn() },
      application: {
        findUnique: vi.fn().mockResolvedValue({
          id: 55,
          status: 'NEW',
          candidate: { id: 10, fullName: 'Rustam', telegramUserId: '888999' },
          vacancy: { id: 3, title: 'Go Developer' },
          company: { name: 'Acme Corp' },
          companyId: 1,
        }),
      },
      telegramBusinessConnection: {
        findFirst: vi.fn().mockResolvedValue({ id: 'conn-1', user: { fullName: 'Aziz Recruiter' } }),
      },
      $transaction: vi.fn((cb) => cb(tx)),
    };
    const telegramApi = {
      answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }),
      editMessageText: vi.fn().mockResolvedValue({ ok: true }),
      sendMessage: vi.fn().mockResolvedValue({ ok: true }),
    };
    const service = new TelegramService(
      db as never,
      { handle: vi.fn() } as never,
      { handle: vi.fn() } as never,
      telegramApi as never,
      { log: vi.fn() } as never,
    );

    await service.handleCallbackQuery({
      id: 'query-123',
      from: { id: 777, first_name: 'Aziz' },
      data: 'action:interview:55',
      message: { message_id: 10, chat: { id: 777 }, text: 'Candidate summary' },
    });

    expect(tx.application.update).toHaveBeenCalledWith({
      where: { id: 55 },
      data: { status: 'INTERVIEW' },
    });
    expect(telegramApi.answerCallbackQuery).toHaveBeenCalledWith(
      'query-123',
      expect.stringContaining('Nomzod suhbatga chaqirildi'),
    );
    expect(telegramApi.editMessageText).toHaveBeenCalled();
  });
});
