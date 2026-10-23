import { describe, expect, it, vi } from 'vitest';
import { TelegramAdminService } from './telegram-admin.service';

function setup() {
  const db = {
    telegramAdminLink: { findUnique: vi.fn().mockResolvedValue({ userId: 4, companyId: 3, telegramUserId: '77' }), upsert: vi.fn(), deleteMany: vi.fn() },
    telegramAdminPairing: { create: vi.fn(), deleteMany: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue({ id: 4, companyId: 3, fullName: 'Admin', role: 'ADMIN', isActive: true, company: { isActive: true } }) },
    vacancy: { findFirst: vi.fn(), updateMany: vi.fn() },
    application: { count: vi.fn().mockResolvedValue(0) },
    telegramBusinessConnection: { findMany: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  const redis = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK'), del: vi.fn(), eval: vi.fn() };
  const telegram = { sendMessage: vi.fn().mockResolvedValue({ ok: true }), answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }), getMe: vi.fn().mockResolvedValue({ username: 'hr_bot' }) };
  const recruiting = { preview: vi.fn(), approve: vi.fn(), channels: vi.fn(), addChannel: vi.fn(), removeChannel: vi.fn(), vacancyChanged: vi.fn() };
  const gemini = { generate: vi.fn() };
  const audit = { log: vi.fn() };
  const service = new TelegramAdminService(db as never, { redis, config: { FRONTEND_ORIGIN: 'https://example.test' }, limit: vi.fn() } as never, telegram as never, recruiting as never, {} as never, gemini as never, { dispatch: vi.fn() } as never, audit as never);
  return { service, db, redis, telegram, recruiting, gemini, audit };
}

const privateMessage = (text: string) => ({ message_id: 1, chat: { id: 77, type: 'private' }, from: { id: 77, first_name: 'Admin' }, date: 1, text });
const callback = (data: string) => ({ id: 'cb', from: { id: 77 }, message: { message_id: 1, chat: { id: 77, type: 'private' } }, data });

describe('Telegram bot admin panel', () => {
  it('opens only for a live company administrator in a private chat', async () => {
    const { service, db, telegram } = setup();
    expect(await service.handleText(privateMessage('/admin'))).toBe(true);
    expect(telegram.sendMessage).toHaveBeenCalledWith('77', expect.stringContaining('Admin panel'), expect.any(Object));
    telegram.sendMessage.mockClear();
    db.user.findUnique.mockResolvedValueOnce({ id: 4, companyId: 3, fullName: 'Admin', role: 'HR', isActive: true, company: { isActive: true } });
    await service.handleCallback(callback('adm:home'));
    expect(telegram.answerCallbackQuery).toHaveBeenCalledWith('cb', expect.stringContaining('ruxsati yo‘q'), true);
    expect(telegram.sendMessage).not.toHaveBeenCalled();
    expect(await service.handleText({ ...privateMessage('/admin'), chat: { id: -1001, type: 'supergroup' } })).toBe(false);
  });

  it('rejects a link whose company no longer matches the user', async () => {
    const { service, db, telegram } = setup();
    db.user.findUnique.mockResolvedValue({ id: 4, companyId: 8, fullName: 'Admin', role: 'ADMIN', isActive: true, company: { isActive: true } });
    await service.handleCallback(callback('adm:home'));
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('consumes a one-time pairing token and rejects its replay', async () => {
    const { service, db, telegram } = setup();
    const tx = {
      telegramAdminPairing: { findUnique: vi.fn().mockResolvedValue({ id: 2, companyId: 3, userId: 4, usedAt: null, expiresAt: new Date(Date.now() + 60_000) }), updateMany: vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: 4, companyId: 3, fullName: 'Admin', role: 'ADMIN', isActive: true, company: { isActive: true } }) },
      telegramAdminLink: { upsert: vi.fn() },
    };
    db.$transaction.mockImplementation(async fn => fn(tx));
    const message = privateMessage(`/start admin_${'a'.repeat(48)}`);
    await service.handleText(message);
    await service.handleText(message);
    expect(tx.telegramAdminLink.upsert).toHaveBeenCalledTimes(1);
    expect(telegram.sendMessage).toHaveBeenCalledWith('77', expect.stringContaining('eskirgan'), expect.any(Object));
  });

  it('confirms a channel publication against the current vacancy revision', async () => {
    const { service, db, recruiting } = setup();
    db.vacancy.findFirst.mockResolvedValueOnce({ revision: 3, status: 'ACTIVE' }).mockResolvedValueOnce({ revision: 4, status: 'ACTIVE' });
    recruiting.preview.mockResolvedValue({ vacancy: { title: 'Node.js', revision: 3 }, telegram: [], publications: [] });
    await service.handleCallback(callback('adm:tc:9:2:3'));
    await service.handleCallback(callback('adm:tc:9:2:3'));
    expect(recruiting.approve).toHaveBeenCalledTimes(1);
    expect(recruiting.approve).toHaveBeenCalledWith(expect.objectContaining({ companyId: 3, role: 'ADMIN' }), 9, { platform: 'TELEGRAM', channelId: 2 });
  });

  it('saves edited questions only when the vacancy and question versions match', async () => {
    const { service, db, redis, telegram } = setup();
    const questions = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, type: i < 5 ? 'HARD_SKILL' : 'SOFT_SKILL', question: 'Valid question?', options: ['One', 'Two', 'Three', 'Four'], correctIndex: 0, explanation: 'Valid explanation' }));
    redis.get.mockResolvedValue(JSON.stringify({ kind: 'question', vacancyId: 9, vacancyRevision: 3, expectedVersion: 2, questionIndex: 0, assessment: { questions } }));
    db.vacancy.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    db.vacancy.findFirst.mockResolvedValue({ title: 'Node.js', revision: 3, assessmentRevision: 3, assessmentQuestions: { questions } });
    await service.handleCallback(callback('adm:qsave:9'));
    expect(db.vacancy.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 3, revision: 3, assessmentEditVersion: 2 }) }));
    expect(redis.del).toHaveBeenCalled();
    await service.handleCallback(callback('adm:qsave:9'));
    expect(telegram.sendMessage).toHaveBeenCalledWith('77', expect.stringContaining('o‘zgargan'), expect.anything());
  });

  it('does not toggle an HR chat twice from the same old button', async () => {
    const { service, db } = setup();
    const connection = { id: 'business-connection-1', companyId: 3, enabled: true, screeningAlertsEnabled: true, telegramUserId: BigInt(77) };
    db.telegramBusinessConnection.findMany.mockResolvedValue([connection]);
    db.telegramBusinessConnection.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const { createHash } = await import('node:crypto');
    const key = createHash('sha256').update(connection.id).digest('hex').slice(0, 14);
    await service.handleCallback(callback(`adm:nt:${key}:1`));
    await service.handleCallback(callback(`adm:nt:${key}:1`));
    expect(db.telegramBusinessConnection.updateMany).toHaveBeenCalledWith({ where: { id: connection.id, companyId: 3, screeningAlertsEnabled: true }, data: { screeningAlertsEnabled: false } });
  });

  it('keeps current questions when AI regeneration fails', async () => {
    const { service, db, gemini, telegram } = setup();
    db.vacancy.findFirst.mockResolvedValue({ id: 9, companyId: 3, title: 'Node.js', description: 'Backend', revision: 2, assessmentEditVersion: 1, status: 'ACTIVE', requirements: [] });
    gemini.generate.mockRejectedValue(new Error('AI unavailable'));
    await service.handleCallback(callback('adm:qr:9'));
    expect(db.vacancy.updateMany).not.toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenCalledWith('77', expect.stringContaining('AI unavailable'), expect.any(Object));
  });

  it('shows an unavailable hh.uz connection without publishing', async () => {
    const { service, db, recruiting, telegram } = setup();
    db.vacancy.findFirst.mockResolvedValue({ id: 9, companyId: 3 });
    recruiting.preview.mockResolvedValue({ headhunter: { configured: true, connected: false }, publications: [] });
    await service.handleCallback(callback('adm:hh:9'));
    expect(recruiting.approve).not.toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenCalledWith('77', expect.stringContaining('hisobi ulanmagan'), expect.any(Object));
  });

  it('does not connect a channel when the bot lacks posting permission', async () => {
    const { service, redis, recruiting, telegram, audit } = setup();
    redis.get.mockResolvedValue(JSON.stringify({ kind: 'channel' }));
    recruiting.addChannel.mockRejectedValue(new Error('Bot cannot post to this channel'));
    await service.handleText(privateMessage('@example_channel'));
    expect(audit.log).not.toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenCalledWith('77', expect.stringContaining('cannot post'), expect.any(Object));
  });
});

describe('candidate preview for HR', () => {
  const questions = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, type: i < 5 ? 'HARD_SKILL' : 'SOFT_SKILL', question: `Savol raqami ${i + 1}?`, options: ['A', 'B', 'C', 'D'], correctIndex: 0, explanation: 'Sabab' }));
  const approved = {
    id: 5, title: 'SMM Lead', status: 'ACTIVE', revision: 2,
    assessmentQuestions: { questions }, assessmentRevision: 2, assessmentApprovedAt: new Date(),
    customQuestions: ['Nega bizni tanladingiz?'], aiInterviewEnabled: true, interviewFocus: 'Reels',
    company: { name: 'Acme', retentionDays: 180 },
  };

  function previewSetup(vacancy: Record<string, unknown> | null, aiKey = 'k') {
    const ctx = setup();
    (ctx.service as any).security = { redis: (ctx.service as any).security.redis, config: { FRONTEND_ORIGIN: 'https://example.test', AI_PROVIDER: 'auto', DEEPSEEK_API_KEY: aiKey, GEMINI_API_KEY: '' }, limit: vi.fn() };
    ctx.db.vacancy.findFirst.mockResolvedValue(vacancy);
    return ctx;
  }
  const sent = (telegram: { sendMessage: ReturnType<typeof vi.fn> }) => telegram.sendMessage.mock.calls.map((call) => String(call[1]));

  it('is a button on the vacancy screen', async () => {
    const { service, db, telegram } = setup();
    db.vacancy.findFirst.mockResolvedValue({ id: 5, title: 'SMM Lead', status: 'ACTIVE', revision: 2 });
    await service.handleCallback(callback('adm:v:5'));
    const buttons = (telegram.sendMessage.mock.calls.at(-1)![2].replyMarkup.inline_keyboard as Array<Array<{ callback_data: string }>>).flat().map((b) => b.callback_data);
    expect(buttons).toContain('adm:pv:5');
  });

  it('shows the consent text, the approved test, the written questions and the AI interview, and saves nothing', async () => {
    const { service, db, telegram, audit } = previewSetup(approved);
    await service.handleCallback(callback('adm:pv:5'));
    const texts = sent(telegram);
    expect(texts.some((text) => text.includes('hech narsa saqlanmaydi'))).toBe(true);
    expect(texts.some((text) => text.includes('SMM Lead') && text.includes('Acme') && text.includes('180'))).toBe(true);
    expect(texts.some((text) => text.includes('Test (10 ta savol') && text.includes('10. Savol raqami 10?'))).toBe(true);
    expect(texts.some((text) => text.includes('Yozma savollar (1 ta)') && text.includes('Nega bizni tanladingiz?'))).toBe(true);
    expect(texts.some((text) => text.includes('Yoqilgan') && text.includes('AI e’tibori: Reels'))).toBe(true);
    expect(db.vacancy.updateMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('says an unapproved test means manual review, and never shows an unapproved interview', async () => {
    const { service, telegram } = previewSetup({ ...approved, assessmentApprovedAt: null });
    await service.handleCallback(callback('adm:pv:5'));
    const texts = sent(telegram);
    expect(texts.some((text) => text.includes('Test hali tasdiqlanmagan'))).toBe(true);
    expect(texts.some((text) => text.includes('4. AI suhbat'))).toBe(false);
  });

  it('explains when the interview is off or the server has no AI', async () => {
    const off = previewSetup({ ...approved, aiInterviewEnabled: false });
    await off.service.handleCallback(callback('adm:pv:5'));
    expect(sent(off.telegram).some((text) => text.includes('O‘chiq'))).toBe(true);

    const noAi = previewSetup(approved, '');
    await noAi.service.handleCallback(callback('adm:pv:5'));
    expect(sent(noAi.telegram).some((text) => text.includes('AI sozlanmagan'))).toBe(true);
  });

  it('refuses another company’s vacancy', async () => {
    const { service, telegram } = previewSetup(null);
    await service.handleCallback(callback('adm:pv:5'));
    expect(sent(telegram).some((text) => text.includes('Vakansiya topilmadi'))).toBe(true);
  });
});
