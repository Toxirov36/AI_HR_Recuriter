import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramService } from './telegram.service';
import { BusinessConnectionHandler } from './handlers/business-connection.handler';

describe('Telegram Deep-Linking & Automated Onboarding', () => {
  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test_webhook_secret_123';
  });

  it('generates a one-time connect token and deep link URL', async () => {
    const create = vi.fn().mockResolvedValue({ id: 1 });
    const db = {
      telegramConnectRequest: { create },
      telegramWebhookUpdate: { create: vi.fn(), delete: vi.fn() },
    };
    const telegramApi = {
      getMe: vi.fn().mockResolvedValue({ id: 99, username: 'apex_recruiter_bot' }),
      sendMessage: vi.fn(),
    };
    const audit = { log: vi.fn() };

    const service = new TelegramService(
      db as never,
      {} as never,
      {} as never,
      telegramApi as never,
      audit as never,
    );

    const user = { id: 10, companyId: 2, role: 'ADMIN', fullName: 'Dilshodbek Toxirov', email: 'admin@apex.uz' };
    const result = await service.createConnectLink(user);

    expect(result.token).toMatch(/^connect_[a-f0-9]{16}$/);
    expect(result.connectUrl).toBe(`https://t.me/apex_recruiter_bot?start=${result.token}`);
    expect(result.botUsername).toBe('apex_recruiter_bot');
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 2,
        userId: 10,
        token: result.token,
      }),
    });
  });

  it('handles /start with connect token: binds telegramUserId and sends 4-step setup instructions', async () => {
    const update = vi.fn().mockResolvedValue({ id: 1 });
    const findFirst = vi.fn().mockResolvedValue({
      id: 5,
      token: 'connect_abc123',
      companyId: 2,
      userId: 10,
      used: false,
      company: { name: 'Apex Learning Centre' },
    });
    const db = {
      telegramConnectRequest: { findFirst, update },
      telegramWebhookUpdate: { create: vi.fn().mockResolvedValue({}) },
    };
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    const telegramApi = {
      getMe: vi.fn().mockResolvedValue({ id: 99, username: 'apex_recruiter_bot' }),
      sendMessage,
    };

    const service = new TelegramService(
      db as never,
      {} as never,
      {} as never,
      telegramApi as never,
      {} as never,
    );

    await service.handleMessage({
      message_id: 101,
      from: { id: 123456789, first_name: 'Dilshodbek', username: 'toxirov_d' },
      chat: { id: 123456789, type: 'private' },
      date: Math.floor(Date.now() / 1000),
      text: '/start connect_abc123',
    });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ token: 'connect_abc123', used: false }),
      }),
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: {
        telegramUserId: '123456789',
        telegramUsername: 'toxirov_d',
      },
    });
    expect(sendMessage).toHaveBeenCalledWith(
      123456789,
      expect.stringContaining('Telegram Business'),
    );
    expect(sendMessage).toHaveBeenCalledWith(
      123456789,
      expect.stringContaining('@apex_recruiter_bot'),
    );
  });

  it('automatically maps business_connection update to company & user via telegramUserId', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 5,
      companyId: 2,
      userId: 10,
      used: false,
      company: { name: 'Apex Learning Centre' },
      user: { id: 10, fullName: 'Dilshodbek Toxirov', role: 'ADMIN' },
    });
    const updateRequest = vi.fn().mockResolvedValue({});
    const upsertConnection = vi.fn().mockResolvedValue({
      id: 'conn-xyz',
      companyId: 2,
      enabled: true,
    });
    const db = {
      telegramConnectRequest: { findFirst, update: updateRequest },
      telegramBusinessConnection: { findUnique: vi.fn().mockResolvedValue(null), upsert: upsertConnection },
    };
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    const telegramApi = { sendMessage };
    const auditLog = vi.fn().mockResolvedValue({});
    const audit = { log: auditLog };

    const handler = new BusinessConnectionHandler(
      db as never,
      telegramApi as never,
      audit as never,
    );

    await handler.handle({
      id: 'conn-xyz',
      user: { id: 123456789, first_name: 'Dilshodbek', username: 'toxirov_d' },
      user_chat_id: 123456789,
      is_enabled: true,
      rights: { can_reply: true, can_read_messages: true },
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { telegramUserId: '123456789', used: false, expiresAt: { gt: expect.any(Date) } },
      orderBy: { createdAt: 'desc' },
      include: { company: true, user: true },
    });

    expect(upsertConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conn-xyz' },
        create: expect.objectContaining({
          companyId: 2,
          userId: 10,
          telegramUserId: BigInt(123456789),
          canReply: true,
          canReadMessages: true,
          enabled: true,
        }),
      }),
    );

    expect(updateRequest).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { used: true },
    });

    expect(sendMessage).toHaveBeenCalledWith(
      123456789,
      expect.stringContaining('Telegram hisobingiz «Apex Learning Centre» HR platformasiga muvaffaqiyatli ulandi'),
    );

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 2,
        action: 'TELEGRAM_CONNECTED',
      }),
    );
  });

  it('does not claim an unrelated business connection or invent missing rights', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'unclaimed' });
    const db = {
      telegramConnectRequest: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
      telegramBusinessConnection: { findUnique: vi.fn().mockResolvedValue(null), upsert },
    };
    const handler = new BusinessConnectionHandler(
      db as never,
      { sendMessage: vi.fn() } as never,
      { log: vi.fn() } as never,
    );
    await handler.handle({
      id: 'unclaimed', user: { id: 987654321 }, user_chat_id: 987654321, is_enabled: true,
    });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ companyId: undefined, canReply: false, canReadMessages: false }),
    }));
    expect(db.telegramConnectRequest.update).not.toHaveBeenCalled();
  });

  it('only reconciles an unassigned connection belonging to the /start account', async () => {
    const connectionFindFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const db = {
      telegramBusinessConnection: { findFirst: connectionFindFirst },
      telegramConnectRequest: { findFirst: vi.fn().mockResolvedValue({
        id: 8, companyId: 2, userId: 10, telegramUserId: '123456789', used: false,
        expiresAt: new Date('2026-09-23T12:00:00Z'),
      }) },
    };
    const service = new TelegramService(
      db as never, {} as never, {} as never,
      { getMe: vi.fn().mockResolvedValue({ username: 'apex_recruiter_bot' }) } as never,
      { log: vi.fn() } as never,
    );
    const status = await service.getStatus({ id: 10, companyId: 2, role: 'ADMIN', fullName: 'Admin', email: 'admin@test.com' });
    expect(status.connected).toBe(false);
    expect(status.setup).toEqual({
      telegramVerified: true,
      telegramUsername: undefined,
      expiresAt: '2026-09-23T12:00:00.000Z',
    });
    expect(connectionFindFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { companyId: null, telegramUserId: BigInt(123456789), enabled: true },
    }));
  });

  it('retrieves connection status and handles disconnection cleanly', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'conn-xyz',
      telegramUserId: BigInt(123456789),
      telegramUsername: 'toxirov_d',
      canReply: true,
      canReadMessages: true,
      enabled: true,
      createdAt: new Date('2026-09-20T10:00:00Z'),
    });
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const findMany = vi.fn().mockResolvedValue([{ id: 'conn-xyz' }]);
    const db = {
      telegramBusinessConnection: { findFirst, findMany, deleteMany },
    };
    const telegramApi = {
      getMe: vi.fn().mockResolvedValue({ username: 'apex_recruiter_bot' }),
    };
    const audit = { log: vi.fn() };

    const service = new TelegramService(
      db as never,
      {} as never,
      {} as never,
      telegramApi as never,
      audit as never,
    );

    const user = { id: 10, companyId: 2, role: 'ADMIN', fullName: 'Dilshodbek Toxirov', email: 'admin@apex.uz' };
    const status = await service.getStatus(user);

    expect(status.connected).toBe(true);
    expect(status.connection?.telegramUsername).toBe('toxirov_d');
    expect(status.connection?.canReply).toBe(true);
    expect(status.botUsername).toBe('apex_recruiter_bot');

    const disconnectRes = await service.disconnect(user);
    expect(disconnectRes.ok).toBe(true);
    expect(deleteMany).toHaveBeenCalledWith({ where: { companyId: 2 } });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TELEGRAM_DISCONNECTED' }),
    );
  });
});
