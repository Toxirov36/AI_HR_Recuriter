import { describe, expect, it, vi } from 'vitest';
import { TelegramScreeningAlertService } from './telegram-screening-alert.service';

const alert = {
  id: 1, companyId: 3, applicationId: 9, chatId: '100', status: 'PENDING', attempts: 0,
  application: {
    id: 9, companyId: 3,
    assessmentResult: { score: 70, hardSkillScore: 60, softSkillScore: 80 },
    candidate: { fullName: 'Ali <Valiyev>', phone: '+998901234567', email: null },
    vacancy: { title: 'Developer' },
  },
};

describe('Telegram screening alerts', () => {
  it('sends a passing applicant once to the company HR chat', async () => {
    const db = { telegramBusinessConnection: { findFirst: vi.fn().mockResolvedValue({ id: 'conn-1' }) }, telegramScreeningAlert: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([alert]),
      update: vi.fn(),
    } };
    const telegram = { sendMessage: vi.fn().mockResolvedValue({ ok: true }) };
    const service = new TelegramScreeningAlertService(db as never, telegram as never);
    await service.dispatch();
    expect(db.telegramBusinessConnection.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({ companyId: 3, screeningAlertsEnabled: true, user: expect.objectContaining({ companyId: 3, isActive: true }) }), select: { id: true } });
    expect(telegram.sendMessage).toHaveBeenCalledWith('100', expect.stringContaining('70%'), { parseMode: 'HTML' });
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('Ali &lt;Valiyev&gt;');
    expect(db.telegramScreeningAlert.update).toHaveBeenCalledWith({ where: { id: 1 }, data: expect.objectContaining({ status: 'SENT' }) });
  });

  it('retries a definite failure and holds an uncertain outcome', async () => {
    const db = { telegramBusinessConnection: { findFirst: vi.fn().mockResolvedValue({ id: 'conn-1' }) }, telegramScreeningAlert: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([alert]),
      update: vi.fn(),
    } };
    const telegram = { sendMessage: vi.fn().mockResolvedValueOnce({ ok: false, description: 'blocked' }).mockResolvedValueOnce({ ok: false, uncertain: true, description: 'timeout' }) };
    const service = new TelegramScreeningAlertService(db as never, telegram as never);
    await service.dispatch();
    expect(db.telegramScreeningAlert.update).toHaveBeenCalledWith({ where: { id: 1 }, data: expect.objectContaining({ status: 'FAILED', nextAttemptAt: expect.any(Date) }) });
    await service.dispatch();
    expect(db.telegramScreeningAlert.update).toHaveBeenCalledWith({ where: { id: 1 }, data: expect.objectContaining({ status: 'UNKNOWN' }) });
  });

  it('does not send another company’s application', async () => {
    const db = { telegramScreeningAlert: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([{ ...alert, companyId: 4 }]),
      update: vi.fn(),
    } };
    const telegram = { sendMessage: vi.fn() };
    await new TelegramScreeningAlertService(db as never, telegram as never).dispatch();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
    expect(db.telegramScreeningAlert.update).toHaveBeenCalledWith({ where: { id: 1 }, data: expect.objectContaining({ status: 'UNKNOWN' }) });
  });

  it('cancels a pending alert when its HR chat is disabled', async () => {
    const db = { telegramBusinessConnection: { findFirst: vi.fn().mockResolvedValue(null) }, telegramScreeningAlert: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([alert]),
      update: vi.fn(),
    } };
    const telegram = { sendMessage: vi.fn() };
    await new TelegramScreeningAlertService(db as never, telegram as never).dispatch();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
    expect(db.telegramScreeningAlert.update).toHaveBeenCalledWith({ where: { id: 1 }, data: expect.objectContaining({ status: 'CANCELLED' }) });
  });
});
