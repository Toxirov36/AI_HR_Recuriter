import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { getConfig } from '../../config/app.config';
import { TelegramApiService } from './telegram-api.service';

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

@Injectable()
export class TelegramScreeningAlertService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramScreeningAlertService.name);
  private readonly config = getConfig();
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(Database) private db: Database,
    @Inject(TelegramApiService) private telegram: TelegramApiService,
  ) {}

  onModuleInit() {
    if (this.config.NODE_ENV === 'test' || !this.config.TELEGRAM_BOT_TOKEN) return;
    this.timer = setInterval(() => void this.dispatch(), 30_000);
    void this.dispatch();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async dispatch() {
    if (this.running) return;
    this.running = true;
    try {
      // An interrupted request may have reached Telegram. Keep it for manual review
      // instead of automatically sending a possible duplicate message.
      await this.db.telegramScreeningAlert.updateMany({
        where: { status: 'SENDING', nextAttemptAt: { lt: new Date() } },
        data: { status: 'UNKNOWN', lastError: 'Delivery interrupted; verify before retrying' },
      });
      const pending = await this.db.telegramScreeningAlert.findMany({
        where: { status: { in: ['PENDING', 'FAILED'] }, nextAttemptAt: { lte: new Date() } },
        orderBy: { id: 'asc' },
        take: 50,
        include: { application: { include: { candidate: true, vacancy: true } } },
      });
      for (const alert of pending) {
        const claimed = await this.db.telegramScreeningAlert.updateMany({
          where: { id: alert.id, status: alert.status, nextAttemptAt: { lte: new Date() } },
          data: { status: 'SENDING', attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 2 * 60_000) },
        });
        if (!claimed.count) continue;
        const app = alert.application;
        const result = app.assessmentResult as { score?: number; hardSkillScore?: number; softSkillScore?: number } | null;
        if (app.companyId !== alert.companyId || !result || (result.score ?? -1) < 70) {
          await this.db.telegramScreeningAlert.update({ where: { id: alert.id }, data: { status: 'UNKNOWN', lastError: 'Application is no longer eligible' } });
          continue;
        }
        const target = /^\d+$/.test(alert.chatId) && await this.db.telegramBusinessConnection.findFirst({
          where: { companyId: alert.companyId, OR: [{ userChatId: BigInt(alert.chatId) }, { telegramUserId: BigInt(alert.chatId) }], enabled: true, screeningAlertsEnabled: true, user: { companyId: alert.companyId, isActive: true, role: { in: ['ADMIN', 'HR', 'RECRUITER'] } } },
          select: { id: true },
        });
        if (!target) {
          await this.db.telegramScreeningAlert.update({ where: { id: alert.id }, data: { status: 'CANCELLED', lastError: 'HR chat notifications disabled' } });
          continue;
        }
        const contact = [app.candidate.phone, app.candidate.email].filter(Boolean).join(' / ') || 'Kiritilmagan';
        const message = `🎯 <b>Testdan o‘tgan nomzod</b>\n\n` +
          `👤 ${escapeHtml(app.candidate.fullName)}\n` +
          `💼 ${escapeHtml(app.vacancy.title)}\n` +
          `📞 ${escapeHtml(contact)}\n` +
          `📊 Umumiy: <b>${result.score}%</b> · Hard: ${result.hardSkillScore ?? 0}% · Soft: ${result.softSkillScore ?? 0}%\n\n` +
          `HR ko‘rib chiqishi: ${this.config.FRONTEND_ORIGIN}/applications/${app.id}`;
        const sent = await this.telegram.sendMessage(alert.chatId, message, { parseMode: 'HTML' });
        if (sent.ok) {
          await this.db.telegramScreeningAlert.update({ where: { id: alert.id }, data: { status: 'SENT', sentAt: new Date(), lastError: null } });
        } else {
          const attempts = alert.attempts + 1;
          await this.db.telegramScreeningAlert.update({
            where: { id: alert.id },
            data: {
              status: sent.uncertain ? 'UNKNOWN' : 'FAILED',
              lastError: (sent.description ?? 'Telegram delivery failed').slice(0, 300),
              nextAttemptAt: new Date(Date.now() + Math.min(60 * 60_000, 30_000 * 2 ** Math.min(attempts, 7))),
            },
          });
        }
      }
    } catch (error) {
      this.logger.warn(`Screening alert dispatch failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
