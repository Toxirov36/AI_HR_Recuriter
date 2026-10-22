import { Inject, Injectable, Logger } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { TelegramApiService } from '../telegram/telegram-api.service';
import { EmailService } from './email.service';
import { getConfig } from '../../config/app.config';
import { botText, DEFAULT_BOT_LANG, isBotLang, type BotLang } from '../telegram/telegram-i18n';

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
    const { candidate, vacancy, companyName } = params;
    const lang = await this.candidateLang(candidate);
    const values = { name: candidate.fullName, company: companyName, vacancy: vacancy.title };
    return this.deliver(candidate, {
      lang,
      text: botText(lang, 'interviewInvited', values),
      subject: `${botText(lang, 'interviewSubjectProposal')}: ${vacancy.title} — ${companyName}`,
      eventType: 'INTERVIEW_INVITATION_SENT',
      eventLabel: (channels) => `Suhbat taklifi yuborildi (${channels}) — ${vacancy.title}`,
      failureKind: 'Suhbat taklifi',
    });
  }

  /** The proposal: tells the candidate the format and links to the page where they pick one of the slots. */
  async sendInterviewProposal(params: {
    candidate: CandidateNotificationTarget;
    vacancy: VacancyContext;
    companyName: string;
    interview: { mode: 'ONLINE' | 'OFFLINE'; durationMinutes: number; note?: string | null };
    token: string;
  }) {
    const { candidate, vacancy, companyName, interview, token } = params;
    const lang = await this.candidateLang(candidate);
    const link = `${this.config.FRONTEND_ORIGIN}/interview/${token}`;
    const text = botText(lang, 'interviewProposal', {
      name: candidate.fullName,
      company: companyName,
      vacancy: vacancy.title,
      format: botText(lang, interview.mode === 'ONLINE' ? 'interviewFormatOnline' : 'interviewFormatOffline'),
      minutes: interview.durationMinutes,
      noteLine: interview.note ? botText(lang, 'interviewNoteLine', { note: interview.note }) : '',
    });
    return this.deliver(candidate, {
      lang,
      text,
      link: { url: link, label: botText(lang, 'interviewChoose') },
      subject: `${botText(lang, 'interviewSubjectProposal')}: ${vacancy.title} — ${companyName}`,
      eventType: 'INTERVIEW_PROPOSED',
      eventLabel: (channels) => `Suhbat vaqtlari taklif qilindi (${channels}) — ${vacancy.title}`,
      failureKind: 'Suhbat vaqtlari',
    });
  }

  async sendInterviewConfirmation(params: {
    candidate: CandidateNotificationTarget;
    vacancy: VacancyContext;
    companyName: string;
    interview: { mode: 'ONLINE' | 'OFFLINE'; durationMinutes: number; timezone: string; startsAt: Date; meetUrl?: string | null; location?: string | null };
  }) {
    const { candidate, vacancy, companyName, interview } = params;
    const lang = await this.candidateLang(candidate);
    const where =
      interview.mode === 'ONLINE'
        ? botText(lang, 'interviewWhereOnline', { url: interview.meetUrl ?? '' })
        : botText(lang, 'interviewWhereOffline', { address: interview.location ?? '' });
    return this.deliver(candidate, {
      lang,
      text: botText(lang, 'interviewConfirmed', {
        company: companyName,
        vacancy: vacancy.title,
        when: formatInterviewTime(interview.startsAt, interview.timezone),
        timezone: interview.timezone,
        minutes: interview.durationMinutes,
        where,
      }),
      subject: `${botText(lang, 'interviewSubjectConfirmed')}: ${vacancy.title} — ${companyName}`,
      eventType: 'INTERVIEW_CONFIRMATION_SENT',
      eventLabel: (channels) => `Suhbat tasdiqlandi, nomzodga yuborildi (${channels}) — ${vacancy.title}`,
      failureKind: 'Suhbat tasdig‘i',
    });
  }

  async sendInterviewCancelled(params: { candidate: CandidateNotificationTarget; vacancy: VacancyContext; companyName: string }) {
    const { candidate, vacancy, companyName } = params;
    const lang = await this.candidateLang(candidate);
    return this.deliver(candidate, {
      lang,
      text: botText(lang, 'interviewCancelled', { company: companyName, vacancy: vacancy.title }),
      subject: `${botText(lang, 'interviewSubjectCancelled')}: ${vacancy.title} — ${companyName}`,
      eventType: 'INTERVIEW_CANCELLED_SENT',
      eventLabel: (channels) => `Suhbat bekor qilingani yuborildi (${channels}) — ${vacancy.title}`,
      failureKind: 'Suhbat bekor qilinishi',
    });
  }

  /** Tells the recruiter who scheduled the interview that the candidate answered (Telegram Business chat). */
  async notifyOrganizer(params: { companyId: number; organizerId: number; applicationId: number; text: string }) {
    const connections = await this.db.telegramBusinessConnection.findMany({
      where: { companyId: params.companyId, userId: params.organizerId, enabled: true },
      select: { userChatId: true, telegramUserId: true },
    });
    const viewUrl = `${this.config.FRONTEND_ORIGIN}/applications/${params.applicationId}`;
    const sent = new Set<string>();
    for (const connection of connections) {
      const chatId = (connection.userChatId || connection.telegramUserId).toString();
      if (!chatId || chatId === '0' || sent.has(chatId)) continue;
      sent.add(chatId);
      try {
        await this.telegramApi.sendMessage(chatId, params.text, { replyMarkup: this.linkButton(viewUrl, '👁 Ko‘rish') });
      } catch (err) {
        this.logger.warn(`Failed to notify organizer chatId=${chatId}: ${(err as Error).message}`);
      }
    }
  }

  /** Candidate language: what they chose in the bot, Uzbek otherwise. */
  private async candidateLang(candidate: CandidateNotificationTarget): Promise<BotLang> {
    return (await this.botChat(candidate)).lang;
  }

  /** Whether the candidate has used the candidate bot (so a direct bot message can reach them) and in which language. */
  private async botChat(candidate: CandidateNotificationTarget): Promise<{ lang: BotLang; started: boolean }> {
    if (!candidate.telegramUserId) return { lang: DEFAULT_BOT_LANG, started: false };
    try {
      const row = await this.db.telegramUserLanguage.findUnique({ where: { telegramUserId: candidate.telegramUserId }, select: { language: true } });
      return isBotLang(row?.language) ? { lang: row.language, started: true } : { lang: DEFAULT_BOT_LANG, started: false };
    } catch {
      return { lang: DEFAULT_BOT_LANG, started: false };
    }
  }

  /** Telegram only accepts https links on inline buttons; other origins (local dev) get no button. */
  private linkButton(url: string, label: string) {
    return url.startsWith('https://') ? { inline_keyboard: [[{ text: label, url }]] } : undefined;
  }

  /** Telegram (the bot chat first, then the Business chat), then email; records the result on the candidate's timeline. */
  private async deliver(
    candidate: CandidateNotificationTarget,
    message: {
      lang: BotLang;
      text: string;
      subject: string;
      link?: { url: string; label: string };
      eventType: string;
      eventLabel: (channels: string) => string;
      failureKind: string;
    },
  ): Promise<{ telegramSent: boolean; emailSent: boolean }> {
    const { text, link } = message;
    const textWithLink = link ? `${text}\n\n👉 ${link.url}` : text;
    let telegramSent = false;
    let emailSent = false;

    if (candidate.telegramUserId) {
      try {
        // 1) The bot chat: works for anyone who has ever opened the bot (Telegram refuses the message otherwise).
        const direct = await this.telegramApi.sendMessage(candidate.telegramUserId, text, {
          replyMarkup: link ? this.linkButton(link.url, link.label) : undefined,
        });
        let delivered = direct.ok === true;
        if (delivered && link && !link.url.startsWith('https://')) await this.telegramApi.sendMessage(candidate.telegramUserId, link.url);
        // 2) Otherwise the HR's Telegram Business chat (needs reply access and a chat within the last 24 hours).
        if (!delivered) {
          const businessConnectionId = await this.getBusinessConnectionId(candidate.companyId);
          if (businessConnectionId) {
            const viaBusiness = await this.telegramApi.sendMessage(candidate.telegramUserId, textWithLink, { businessConnectionId });
            delivered = viaBusiness.ok === true;
          }
        }
        telegramSent = delivered;
        if (!delivered) await this.recordTelegramFailure(candidate, message.failureKind);
      } catch (err) {
        await this.recordTelegramFailure(candidate, message.failureKind);
        this.logger.warn(`Telegram ${message.eventType} failed for candidateId=${candidate.id}: ${(err as Error).message}`);
      }
    }

    if (candidate.email) {
      try {
        const html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #1e293b;">${escapeHtml(text).replace(/\n/g, '<br>')}${
          link ? `<p style="margin: 25px 0;"><a href="${escapeHtml(link.url)}" style="background-color: #1a5d4c; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">${escapeHtml(link.label)}</a></p><p style="color: #64748b; font-size: 13px;">${escapeHtml(link.url)}</p>` : ''
        }</div>`;
        const result = await this.emailService.sendMail({ to: candidate.email, subject: message.subject, text: textWithLink, html });
        emailSent = Boolean(result.success);
      } catch (err) {
        this.logger.warn(`Email ${message.eventType} failed for candidateId=${candidate.id}: ${(err as Error).message}`);
      }
    }

    if (telegramSent || emailSent) {
      const channels = [telegramSent && 'Telegram', emailSent && 'Email'].filter(Boolean).join(' va ');
      await this.db.candidateEvent
        .create({ data: { companyId: candidate.companyId, candidateId: candidate.id, type: message.eventType, label: message.eventLabel(channels) } })
        .catch((err: Error) => this.logger.warn(`Failed to log candidateEvent: ${err.message}`));
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

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "dd.MM.yyyy HH:mm" in the interview's own time zone, the same in every language. */
export function formatInterviewTime(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
}
