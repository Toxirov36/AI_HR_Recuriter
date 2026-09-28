import { Inject, Injectable, Logger } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { TelegramApiService } from '../telegram/telegram-api.service';
import { EmailService } from './email.service';
import { getConfig } from '../../config/app.config';

export interface CandidateNotificationTarget {
  id: number;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  telegramUserId?: string | null;
  companyId: number;
}

export interface VacancyContext {
  id: number;
  title: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly config = getConfig();

  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(TelegramApiService) private readonly telegramApi: TelegramApiService,
    @Inject(EmailService) private readonly emailService: EmailService,
  ) {}

  private async getBusinessConnectionId(companyId: number): Promise<string | undefined> {
    try {
      const connection = await this.db.telegramBusinessConnection.findFirst({
        where: { companyId, enabled: true, canReply: true },
        orderBy: { updatedAt: 'desc' },
      });
      return connection?.id;
    } catch {
      return undefined;
    }
  }

  private async recordTelegramFailure(candidate: CandidateNotificationTarget, kind: string) {
    await this.db.candidateEvent.create({
      data: {
        companyId: candidate.companyId,
        candidateId: candidate.id,
        type: 'TELEGRAM_DELIVERY_FAILED',
        label: `${kind} Telegram orqali yuborilmadi. Business chat ruxsatlari va 24 soatlik javob muddatini tekshiring.`,
      },
    }).catch(() => undefined);
  }

  /**
   * 1. Automatic reply when candidate submits a CV via Telegram
   */
  async sendCvReceivedAck(
    candidate: CandidateNotificationTarget,
    connectionId?: string,
  ): Promise<void> {
    if (!candidate.telegramUserId) return;

    const message =
      `Assalomu alaykum, ${candidate.fullName}!\n\n` +
      `Rezyumengiz muvaffaqiyatli qabul qilindi, AI ko'rib chiqmoqda.\n\n` +
      `AI tizimimiz ma'lumotlaringizni tahlil qilib, mos vakansiyalar bilan solishtiradi. ` +
      `Keyingi qadamlar bo'yicha tez orada siz bilan bog'lanamiz!`;

    try {
      const bConnId = connectionId || (await this.getBusinessConnectionId(candidate.companyId));
      if (!bConnId) {
        await this.recordTelegramFailure(candidate, 'CV javobi');
        return;
      }
      const delivery = await this.telegramApi.sendMessage(candidate.telegramUserId, message, {
        businessConnectionId: bConnId,
      });
      if (!delivery.ok) throw new Error(delivery.description || 'Telegram business reply failed');

      await this.db.candidateEvent.create({
        data: {
          companyId: candidate.companyId,
          candidateId: candidate.id,
          type: 'TELEGRAM_AUTO_REPLY_SENT',
          label: "Avtomatik javob yuborildi: 'Rezyumengiz qabul qilindi, AI ko'rib chiqmoqda'",
        },
      });

      this.logger.log(`CV acknowledgement sent to candidateId=${candidate.id}`);
    } catch (err) {
      await this.recordTelegramFailure(candidate, 'CV javobi');
      this.logger.warn(
        `Failed to send CV acknowledgement to candidateId=${candidate.id}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * 2. Interview Invitation: when candidate transitions to INTERVIEW stage
   */
  async sendInterviewInvitation(params: {
    applicationId: number;
    candidate: CandidateNotificationTarget;
    vacancy: VacancyContext;
    companyName: string;
  }): Promise<{ telegramSent: boolean; emailSent: boolean }> {
    const { applicationId, candidate, vacancy, companyName } = params;
    const schedulingUrl = `${this.config.FRONTEND_ORIGIN}/interview/schedule?appId=${applicationId}`;
    let telegramSent = false;
    let emailSent = false;

    // A. Telegram Notification
    if (candidate.telegramUserId) {
      const telegramMessage =
        `🎉 Assalomu alaykum, ${candidate.fullName}!\n\n` +
        `Sizni «${companyName}» kompaniyasining «${vacancy.title}» vakansiyasi bo'yicha suhbat (interview) bosqichiga taklif etamiz!\n\n` +
        `Suhbat uchun o'zingizga qulay vaqtni tanlang:\n` +
        `👉 ${schedulingUrl}\n\n` +
        `Savollaringiz bo'lsa, ushbu chat orqali bemalol yozishingiz mumkin. Omad tilaymiz!`;

      try {
        const businessConnectionId = await this.getBusinessConnectionId(candidate.companyId);
        const result = businessConnectionId
          ? await this.telegramApi.sendMessage(candidate.telegramUserId, telegramMessage, {
              businessConnectionId,
            })
          : { ok: false };

        if (result.ok) {
          telegramSent = true;
          this.logger.log(`Telegram interview invite sent to candidateId=${candidate.id}`);
        } else {
          await this.recordTelegramFailure(candidate, 'Suhbat taklifi');
          this.logger.warn(
            `Telegram interview invite failed for candidateId=${candidate.id}: ${result.description || 'No active Business connection with reply access'}`,
          );
        }
      } catch (err) {
        await this.recordTelegramFailure(candidate, 'Suhbat taklifi');
        this.logger.warn(
          `Telegram interview invite failed for candidateId=${candidate.id}: ${(err as Error).message}`,
        );
      }
    }

    // B. Email Notification
    if (candidate.email) {
      const emailSubject = `Suhbatga taklif: ${vacancy.title} — ${companyName}`;
      const emailText =
        `Assalomu alaykum, ${candidate.fullName}!\n\n` +
        `Sizni «${companyName}» kompaniyasining «${vacancy.title}» lavozimi bo'yicha suhbatga taklif etamiz.\n\n` +
        `Suhbat uchun o'zingizga qulay vaqtni quyidagi havola orqali tanlang:\n` +
        `${schedulingUrl}\n\n` +
        `Hurmat bilan,\n${companyName} HR jamoasi`;

      const emailHtml =
        `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #1e293b;">` +
        `<h2 style="color: #1a5d4c;">Suhbatga taklifnoma</h2>` +
        `<p>Assalomu alaykum, <strong>${candidate.fullName}</strong>!</p>` +
        `<p>Sizni «<strong>${companyName}</strong>» kompaniyasining «<strong>${vacancy.title}</strong>» lavozimi bo'yicha suhbatga taklif etamiz.</p>` +
        `<p style="margin: 25px 0;">` +
        `<a href="${schedulingUrl}" style="background-color: #1a5d4c; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Qulay vaqtni tanlash</a>` +
        `</p>` +
        `<p style="color: #64748b; font-size: 13px;">Agar tugma ishlamasa, ushbu havolani brauzeringizga nusxalang: ${schedulingUrl}</p>` +
        `<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />` +
        `<p style="color: #64748b; font-size: 13px;">Hurmat bilan,<br><strong>${companyName} HR jamoasi</strong></p>` +
        `</div>`;

      try {
        const emailResult = await this.emailService.sendMail({
          to: candidate.email,
          subject: emailSubject,
          text: emailText,
          html: emailHtml,
        });
        if (emailResult.success) emailSent = true;
      } catch (err) {
        this.logger.warn(
          `Email interview invite failed for candidateId=${candidate.id}: ${(err as Error).message}`,
        );
      }
    }

    // C. Record Event in Candidate Timeline
    if (telegramSent || emailSent) {
      const channels = [telegramSent && 'Telegram', emailSent && 'Email'].filter(Boolean).join(' va ');
      try {
        await this.db.candidateEvent.create({
          data: {
            companyId: candidate.companyId,
            candidateId: candidate.id,
            type: 'INTERVIEW_INVITATION_SENT',
            label: `Suhbat taklifi yuborildi (${channels}) — ${vacancy.title}`,
          },
        });
      } catch (err) {
        this.logger.warn(`Failed to log candidateEvent: ${(err as Error).message}`);
      }
    }

    return { telegramSent, emailSent };
  }

  /**
   * 3. Polite Rejection Notice: when candidate transitions to REJECTED stage
   */
  async sendRejectionNotice(params: {
    applicationId: number;
    candidate: CandidateNotificationTarget;
    vacancy: VacancyContext;
    companyName: string;
  }): Promise<{ telegramSent: boolean; emailSent: boolean }> {
    const { candidate, vacancy, companyName } = params;
    let telegramSent = false;
    let emailSent = false;

    // A. Telegram Message
    if (candidate.telegramUserId) {
      const telegramMessage =
        `Assalomu alaykum, ${candidate.fullName}.\n\n` +
        `«${companyName}» kompaniyasining «${vacancy.title}» vakansiyasiga qiziqish bildirganingiz va vaqtingiz uchun minnatdorchilik bildiramiz.\n\n` +
        `Afsuski, barcha arizalarni sinchiklab ko'rib chiqib, ushbu bosqichda boshqa nomzod bilan davom etishga qaror qildik. ` +
        `Shunga qaramay, sizning bilim va tajribangiz bizda yaxshi taassurot qoldirdi. Kelajakdagi yangi loyihalar va imkoniyatlar uchun rezyumengizni zaxiramizda saqlab qolamiz.\n\n` +
        `Sizga kelgusi kasbiy faoliyatingizda va yangi maqsadlaringizda ulkan zafarlar tilaymiz!`;

      try {
        const businessConnectionId = await this.getBusinessConnectionId(candidate.companyId);
        const result = businessConnectionId
          ? await this.telegramApi.sendMessage(candidate.telegramUserId, telegramMessage, {
              businessConnectionId,
            })
          : { ok: false };

        if (result.ok) {
          telegramSent = true;
          this.logger.log(`Telegram rejection notice sent to candidateId=${candidate.id}`);
        } else {
          await this.recordTelegramFailure(candidate, 'Rad javobi');
          this.logger.warn(
            `Telegram rejection notice failed for candidateId=${candidate.id}: ${result.description || 'No active Business connection with reply access'}`,
          );
        }
      } catch (err) {
        await this.recordTelegramFailure(candidate, 'Rad javobi');
        this.logger.warn(
          `Telegram rejection notice failed for candidateId=${candidate.id}: ${(err as Error).message}`,
        );
      }
    }

    // B. Email Notification
    if (candidate.email) {
      const emailSubject = `Arizangiz bo'yicha yangilanish: ${vacancy.title} — ${companyName}`;
      const emailText =
        `Assalomu alaykum, ${candidate.fullName}!\n\n` +
        `«${companyName}» kompaniyasining «${vacancy.title}» lavozimiga qiziqish bildirganingiz uchun tashakkur bildiramiz.\n\n` +
        `Barcha arizalarni sinchiklab ko'rib chiqqach, afsuski, ushbu bosqichda boshqa nomzod bilan davom etishga qaror qildik. ` +
        `Sizning tajribangiz va intilishingiz bizda yuqori taassurot qoldirdi, shu sababli ma'lumotlaringizni kelajakdagi mos imkoniyatlar uchun zaxiramizda saqlab qolamiz.\n\n` +
        `Sizga kelgusi faoliyatingizda ulkan zafarlar tilaymiz!\n\nHurmat bilan,\n${companyName} HR jamoasi`;

      const emailHtml =
        `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #1e293b;">` +
        `<h3 style="color: #334155;">Arizangiz bo'yicha yangilanish</h3>` +
        `<p>Assalomu alaykum, <strong>${candidate.fullName}</strong>!</p>` +
        `<p>«<strong>${companyName}</strong>» kompaniyasining «<strong>${vacancy.title}</strong>» lavozimiga arizangizni ko'rib chiqdik.</p>` +
        `<p>Afsuski, barcha nomzodlarni sinchiklab tahlil qilgach, ushbu bosqichda boshqa nomzod bilan davom etishga qaror qildik. ` +
        `Sizning bilim va tajribangiz bizda yuqori taassurot qoldirdi, shu sababli ma'lumotlaringizni kelgusidagi mos vakansiyalar uchun zaxiramizda mamnuniyat bilan saqlab qolamiz.</p>` +
        `<p>Sizga kelgusi kasbiy yo'lingizda ulkan zafarlar tilaymiz!</p>` +
        `<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />` +
        `<p style="color: #64748b; font-size: 13px;">Hurmat bilan,<br><strong>${companyName} HR jamoasi</strong></p>` +
        `</div>`;

      try {
        const emailResult = await this.emailService.sendMail({
          to: candidate.email,
          subject: emailSubject,
          text: emailText,
          html: emailHtml,
        });
        if (emailResult.success) emailSent = true;
      } catch (err) {
        this.logger.warn(
          `Email rejection notice failed for candidateId=${candidate.id}: ${(err as Error).message}`,
        );
      }
    }

    // C. Record Event in Candidate Timeline
    if (telegramSent || emailSent) {
      const channels = [telegramSent && 'Telegram', emailSent && 'Email'].filter(Boolean).join(' va ');
      try {
        await this.db.candidateEvent.create({
          data: {
            companyId: candidate.companyId,
            candidateId: candidate.id,
            type: 'REJECTION_NOTICE_SENT',
            label: `Muloyim rad javobi yuborildi (${channels}) — ${vacancy.title}`,
          },
        });
      } catch (err) {
        this.logger.warn(`Failed to log candidateEvent: ${(err as Error).message}`);
      }
    }

    return { telegramSent, emailSent };
  }

  /**
   * 4. Recruiter Alert: New application received
   */
  async notifyRecruitersNewApplication(params: {
    applicationId: number;
    candidate: CandidateNotificationTarget;
    vacancy: VacancyContext;
    companyId: number;
    source?: string;
  }): Promise<void> {
    const { applicationId, candidate, vacancy, companyId, source } = params;

    const connections = await this.db.telegramBusinessConnection.findMany({
      where: { companyId, enabled: true },
      select: { userChatId: true, telegramUserId: true },
    });

    if (!connections.length) return;

    const viewUrl = `${this.config.FRONTEND_ORIGIN}/applications/${applicationId}`;
    const sourceText = source ? `\n📌 <b>Manba:</b> ${source}` : '';
    const contact = [candidate.email, candidate.phone].filter(Boolean).join(' / ') || "Kontakt ko'rsatilmagan";

    const text =
      `🎯 <b>Yangi ariza kelib tushdi!</b>\n\n` +
      `👤 <b>Nomzod:</b> ${candidate.fullName}\n` +
      `💼 <b>Vakansiya:</b> ${vacancy.title}\n` +
      `📞 <b>Aloqa:</b> ${contact}` +
      `${sourceText}\n\n` +
      `Nomzod arizasi ko'rib chiqishga tayyor.`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "👁 Ko'rish", url: viewUrl },
          { text: "📅 Suhbatga chaqirish", callback_data: `action:interview:${applicationId}` },
        ],
      ],
    };

    const sentTargets = new Set<string>();
    for (const conn of connections) {
      const targetChatId = (conn.userChatId || conn.telegramUserId).toString();
      if (!targetChatId || targetChatId === '0' || sentTargets.has(targetChatId)) continue;
      sentTargets.add(targetChatId);

      try {
        await this.telegramApi.sendMessage(targetChatId, text, {
          parseMode: 'HTML',
          replyMarkup,
        });
      } catch (err) {
        this.logger.warn(
          `Failed to send new application alert to chatId=${targetChatId}: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * 5. Recruiter Alert: Strong match candidate (85%+)
   */
  async notifyRecruitersStrongCandidate(params: {
    applicationId: number;
    candidate: CandidateNotificationTarget;
    vacancy: VacancyContext;
    companyId: number;
    matchPercentage: number;
    supported: number;
    partial: number;
    notFound: number;
    total: number;
  }): Promise<void> {
    const {
      applicationId,
      candidate,
      vacancy,
      companyId,
      matchPercentage,
      supported,
      partial,
      notFound,
      total,
    } = params;

    // Deduplicate: send strong match alert once per candidate
    const existingAlert = await this.db.candidateEvent.findFirst({
      where: {
        candidateId: candidate.id,
        companyId,
        type: 'TELEGRAM_STRONG_MATCH_ALERT_SENT',
      },
    });
    if (existingAlert) return;

    const connections = await this.db.telegramBusinessConnection.findMany({
      where: { companyId, enabled: true },
      select: { userChatId: true, telegramUserId: true },
    });
    if (!connections.length) return;

    const viewUrl = `${this.config.FRONTEND_ORIGIN}/applications/${applicationId}`;
    const text =
      `⚡ <b>Yuqori moslikdagi kuchli nomzod! (${matchPercentage}% moslik)</b>\n\n` +
      `👤 <b>Nomzod:</b> ${candidate.fullName}\n` +
      `💼 <b>Vakansiya:</b> ${vacancy.title}\n\n` +
      `📊 <b>AI Tahlil natijasi:</b>\n` +
      `  ✅ Mos kelgan talablar: ${supported}/${total}\n` +
      `  ⚠️ Qisman mos: ${partial}/${total}\n` +
      `  ❌ Topilmagan: ${notFound}/${total}\n\n` +
      `Ushbu nomzod vakansiya talablariga juda yuqori darajada mos keladi.`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "👁 Nomzodni ko'rish", url: viewUrl },
          { text: "📅 Suhbatga chaqirish", callback_data: `action:interview:${applicationId}` },
        ],
      ],
    };

    let sent = false;
    const sentTargets = new Set<string>();
    for (const conn of connections) {
      const targetChatId = (conn.userChatId || conn.telegramUserId).toString();
      if (!targetChatId || targetChatId === '0' || sentTargets.has(targetChatId)) continue;
      sentTargets.add(targetChatId);

      try {
        const res = await this.telegramApi.sendMessage(targetChatId, text, {
          parseMode: 'HTML',
          replyMarkup,
        });
        if (res.ok) sent = true;
      } catch (err) {
        this.logger.warn(
          `Failed to send strong match alert to chatId=${targetChatId}: ${(err as Error).message}`,
        );
      }
    }

    if (sent) {
      await this.db.candidateEvent
        .create({
          data: {
            companyId,
            candidateId: candidate.id,
            type: 'TELEGRAM_STRONG_MATCH_ALERT_SENT',
            label: `Recruiterlarga Telegram orqali kuchli nomzod (${matchPercentage}%) alerti yuborildi`,
          },
        })
        .catch(() => undefined);
    }
  }

  /**
   * 6. Notification Center: Feed of recent events for the web UI
   */
  async getCompanyNotifications(companyId: number) {
    const [recentApplications, recentInterviews] = await Promise.all([
      this.db.application.findMany({
        where: { companyId },
        take: 15,
        orderBy: { createdAt: 'desc' },
        include: {
          candidate: { select: { id: true, fullName: true, source: true, email: true } },
          vacancy: { select: { id: true, title: true } },
        },
      }),
      this.db.applicationStageChange.findMany({
        where: { application: { companyId }, toStatus: 'INTERVIEW' },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          application: {
            include: {
              candidate: { select: { id: true, fullName: true } },
              vacancy: { select: { id: true, title: true } },
            },
          },
        },
      }),
    ]);

    const notifications: Array<{
      id: string;
      type: 'NEW_APPLICATION' | 'STRONG_MATCH' | 'STAGE_INTERVIEW' | 'TELEGRAM_CV';
      title: string;
      subtitle: string;
      link: string;
      createdAt: string;
      badge?: string;
      matchScore?: number;
    }> = [];

    for (const app of recentApplications) {
      let matchScore: number | undefined;
      const analysis = app.analysis as { requirements?: { status: string }[] } | null;
      if (analysis?.requirements && analysis.requirements.length > 0) {
        const supported = analysis.requirements.filter((r) => r.status === 'SUPPORTED').length;
        const partial = analysis.requirements.filter((r) => r.status === 'PARTIAL').length;
        matchScore = Math.round(
          ((supported + partial * 0.5) / analysis.requirements.length) * 100,
        );
      }

      if (matchScore !== undefined && matchScore >= 85) {
        notifications.push({
          id: `strong-${app.id}`,
          type: 'STRONG_MATCH',
          title: `Kuchli moslik: ${app.candidate.fullName}`,
          subtitle: `${app.vacancy.title} • ${matchScore}% mos keldi`,
          link: `/applications/${app.id}`,
          createdAt: app.updatedAt.toISOString(),
          badge: `${matchScore}%`,
          matchScore,
        });
      }

      notifications.push({
        id: `app-${app.id}`,
        type: app.candidate.source === 'TELEGRAM' ? 'TELEGRAM_CV' : 'NEW_APPLICATION',
        title:
          app.candidate.source === 'TELEGRAM'
            ? `Telegram CV: ${app.candidate.fullName}`
            : `Yangi ariza: ${app.candidate.fullName}`,
        subtitle: `${app.vacancy.title} lavozimiga`,
        link: `/applications/${app.id}`,
        createdAt: app.createdAt.toISOString(),
      });
    }

    for (const stage of recentInterviews) {
      notifications.push({
        id: `interview-${stage.id}`,
        type: 'STAGE_INTERVIEW',
        title: `Suhbat bosqichi: ${stage.application.candidate.fullName}`,
        subtitle: `${stage.application.vacancy.title} (${stage.actorName})`,
        link: `/applications/${stage.applicationId}`,
        createdAt: stage.createdAt.toISOString(),
      });
    }

    notifications.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return notifications.slice(0, 20);
  }
}
