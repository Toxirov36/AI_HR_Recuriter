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

  describe('Business profile CV redirect', () => {
    const connection = {
      id: 'business-1', companyId: 3, enabled: true, canReply: true, telegramUserId: BigInt(999),
      company: { name: 'Acme', publicToken: '11111111-2222-3333-4444-555555555555' },
    };
    const cv = {
      message_id: 1, business_connection_id: 'business-1', chat: { id: 42 },
      from: { id: 42, first_name: 'Ali', username: 'ali' },
      document: { file_id: 'file-1', file_unique_id: 'unique-1', file_name: 'cv.pdf', mime_type: 'application/pdf', file_size: 1024 },
    };
    const setup = (overrides: Record<string, unknown> = {}, nudge: string | null = 'OK') => {
      const db = {
        telegramBusinessConnection: { findUnique: vi.fn().mockResolvedValue({ ...connection, ...overrides }) },
        telegramBusinessChat: { upsert: vi.fn().mockResolvedValue({}) },
        candidate: { upsert: vi.fn() },
        resume: { create: vi.fn() },
        $transaction: vi.fn(),
      };
      const telegramApi = {
        getMe: vi.fn().mockResolvedValue({ username: 'hr_bot' }),
        sendMessage: vi.fn().mockResolvedValue({ ok: true }),
      };
      const security = { redis: { set: vi.fn().mockResolvedValue(nudge) } };
      return { db, telegramApi, security, handler: new BusinessMessageHandler(db as never, telegramApi as never, security as never) };
    };

    it('replies with the bot link and stores nothing', async () => {
      const { db, telegramApi, security, handler } = setup();
      await handler.handle(cv);
      expect(telegramApi.sendMessage).toHaveBeenCalledWith(
        '42',
        expect.stringContaining('https://t.me/hr_bot?start=join_11111111-2222-3333-4444-555555555555'),
        { businessConnectionId: 'business-1' },
      );
      expect(security.redis.set).toHaveBeenCalledWith('telegram-join-nudge:business-1:42', '1', 'EX', 86400, 'NX');
      expect(db.$transaction).not.toHaveBeenCalled();
      expect(db.candidate.upsert).not.toHaveBeenCalled();
      expect(db.resume.create).not.toHaveBeenCalled();
    });

    it('remembers which HR connection the candidate wrote to, even when no reply is sent', async () => {
      const { db, handler } = setup({ canReply: false });
      await handler.handle(cv);
      expect(db.telegramBusinessChat.upsert).toHaveBeenCalledWith({
        where: { companyId_telegramUserId: { companyId: 3, telegramUserId: '42' } },
        update: { connectionId: 'business-1' },
        create: { companyId: 3, telegramUserId: '42', connectionId: 'business-1' },
      });
    });

    it('does not remember the HR account itself or non-CV files', async () => {
      const own = setup();
      await own.handler.handle({ ...cv, from: { id: 999, first_name: 'HR' } });
      const photo = setup();
      await photo.handler.handle({ ...cv, document: { ...cv.document, file_name: 'photo.png', mime_type: 'image/png' } });
      for (const { db } of [own, photo]) expect(db.telegramBusinessChat.upsert).not.toHaveBeenCalled();
    });

    it('does not repeat the reply within a day for the same chat', async () => {
      const { telegramApi, handler } = setup({}, null);
      await handler.handle(cv);
      expect(telegramApi.sendMessage).not.toHaveBeenCalled();
    });

    it('ignores the HR account itself, non-CV files and connections that cannot reply', async () => {
      const own = setup();
      await own.handler.handle({ ...cv, from: { id: 999, first_name: 'HR' } });
      const photo = setup();
      await photo.handler.handle({ ...cv, document: { ...cv.document, file_name: 'photo.png', mime_type: 'image/png' } });
      const silent = setup({ canReply: false });
      await silent.handler.handle(cv);
      for (const { telegramApi } of [own, photo, silent]) expect(telegramApi.sendMessage).not.toHaveBeenCalled();
    });

    it('survives a failed Telegram reply', async () => {
      const { telegramApi, handler } = setup();
      telegramApi.sendMessage.mockResolvedValueOnce({ ok: false, description: 'Forbidden' });
      await expect(handler.handle(cv)).resolves.toBeUndefined();
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
