import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramService } from './telegram.service';
import { BusinessConnectionHandler } from './handlers/business-connection.handler';

describe('Telegram Deep-Linking & Automated Onboarding', () => {
  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test_webhook_secret_123';
  });

  it('does not create a connect request when bot identity verification fails', async () => {
    const create = vi.fn();
    const service = new TelegramService(
      { telegramConnectRequest: { create } } as never,
      {} as never, {} as never,
      { getMe: vi.fn().mockRejectedValue(new Error('Bot unavailable')) } as never,
      {} as never,
    );
    await expect(service.createConnectLink({ id: 10, companyId: 2 } as never)).rejects.toThrow('Bot unavailable');
    expect(create).not.toHaveBeenCalled();
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

  it('keeps a live connection with its company but moves one the owner removed and reconnected', async () => {
    const request = {
      id: 9, companyId: 3, userId: 11, used: false, telegramUsername: 'owner',
      company: { name: 'New Co' }, user: { id: 11, fullName: 'New Admin', role: 'ADMIN' },
    };
    const run = async (existing: { companyId: number; enabled: boolean }) => {
      const upsert = vi.fn().mockResolvedValue({ id: 'conn-1' });
      const db = {
        telegramConnectRequest: { findFirst: vi.fn().mockResolvedValue(request), update: vi.fn() },
        telegramBusinessConnection: { findUnique: vi.fn().mockResolvedValue(existing), upsert },
      };
      const handler = new BusinessConnectionHandler(db as never, { sendMessage: vi.fn().mockResolvedValue({}) } as never, { log: vi.fn() } as never);
      await handler.handle({ id: 'conn-1', user: { id: 555 }, user_chat_id: 555, is_enabled: true });
      return { update: upsert.mock.calls[0][0].update, claimed: db.telegramConnectRequest.update.mock.calls.length > 0 };
    };

    const live = await run({ companyId: 1, enabled: true });
    expect(live.update.companyId).toBeUndefined();
    expect(live.claimed).toBe(false);

    const removed = await run({ companyId: 1, enabled: false });
    expect(removed.update).toEqual(expect.objectContaining({ companyId: 3, userId: 11 }));
    expect(removed.claimed).toBe(true);
  });

  it('only reconciles an unassigned connection belonging to the /start account', async () => {
    const connectionFindFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const db = {
      telegramBusinessConnection: { findFirst: connectionFindFirst, findMany: vi.fn().mockResolvedValue([]) },
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
    // The administrator's own connection, plus old ones made before connections had an owner
    expect(deleteMany).toHaveBeenCalledWith({ where: { companyId: 2, OR: [{ userId: 10 }, { userId: null }] } });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TELEGRAM_DISCONNECTED' }),
    );
  });

  it('gives every HR their own connection: status, disconnect and the admin list', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const findMany = vi.fn().mockResolvedValue([
      { id: 'conn-hr', telegramUsername: 'hr_one', canReply: true, userId: 11, user: { fullName: 'HR One' } },
    ]);
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = {
      telegramBusinessConnection: { findFirst, findMany, deleteMany },
      telegramConnectRequest: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new TelegramService(
      db as never, {} as never, {} as never,
      { getMe: vi.fn().mockResolvedValue({ username: 'apex_recruiter_bot' }) } as never,
      { log: vi.fn() } as never,
    );
    const hr = { id: 12, companyId: 2, role: 'HR', fullName: 'HR Two', email: 'two@apex.uz' };

    // A second HR is not "connected" just because a colleague is, and gets no company list
    const status = await service.getStatus(hr);
    expect(findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { companyId: 2, enabled: true, userId: 12 } }));
    expect(db.telegramConnectRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 12 }) }));
    expect(status.connected).toBe(false);
    expect(status.team).toBeUndefined();

    // Disconnecting touches only the HR's own connection; removing a colleague's is for the administrator
    await service.disconnect(hr);
    expect(deleteMany).toHaveBeenLastCalledWith({ where: { companyId: 2, userId: 12 } });
    await expect(service.disconnect(hr, 'conn-hr')).rejects.toThrow();

    const adminUser = { id: 10, companyId: 2, role: 'ADMIN', fullName: 'Admin', email: 'admin@apex.uz' };
    const adminStatus = await service.getStatus(adminUser);
    expect(adminStatus.team).toEqual([{ id: 'conn-hr', telegramUsername: 'hr_one', canReply: true, fullName: 'HR One', mine: false }]);
    await service.disconnect(adminUser, 'conn-hr');
    expect(deleteMany).toHaveBeenLastCalledWith({ where: { id: 'conn-hr', companyId: 2 } });
  });
});

describe('Telegram candidate intake routing', () => {
  const chat = { id: 7, type: 'private' as const };
  const from = { id: 7, first_name: 'Aziz' };
  const token = '11111111-2222-3333-4444-555555555555';
  const make = () => {
    const joinService = { start: vi.fn(), handleText: vi.fn().mockResolvedValue(false), cancel: vi.fn() };
    const applyService = { start: vi.fn(), handleText: vi.fn().mockResolvedValue(false) };
    const sendMessage = vi.fn();
    const service = new TelegramService(
      {} as never, {} as never, {} as never,
      { getMe: vi.fn().mockResolvedValue({ id: 1, username: 'hr_bot' }), sendMessage } as never,
      {} as never,
      applyService as never,
      { handleText: vi.fn().mockResolvedValue(false) } as never,
      joinService as never,
    );
    return { service, joinService, applyService, sendMessage };
  };
  const msg = (text: string) => ({ message_id: 1, from, chat, date: 0, text });

  it('starts the field intake from /start join_<companyToken>', async () => {
    const { service, joinService, sendMessage } = make();
    await service.handleMessage(msg(`/start join_${token}`));
    expect(joinService.start).toHaveBeenCalledWith(expect.objectContaining({ text: `/start join_${token}` }), token);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('routes free text (name, phone) to the join session before anything else', async () => {
    const { service, joinService, applyService } = make();
    joinService.handleText.mockResolvedValue(true);
    await service.handleMessage(msg('Aziz Karimov'));
    expect(joinService.handleText).toHaveBeenCalled();
    expect(applyService.handleText).not.toHaveBeenCalled();
  });

  it('drops an unfinished join session when a vacancy link is opened', async () => {
    const { service, joinService, applyService } = make();
    await service.handleMessage(msg(`/start apply_${token}`));
    expect(joinService.cancel).toHaveBeenCalledWith('7');
    expect(applyService.start).toHaveBeenCalled();
  });
});
