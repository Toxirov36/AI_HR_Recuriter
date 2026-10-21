import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { Security } from '../../common/utils/security';
import { R2Storage } from '../../common/storage/r2-storage.service';
import { TelegramApiService } from './telegram-api.service';
import { TelegramQueueService } from './telegram-queue.service';
import { GeminiProvider } from '../ai/providers/gemini.provider';
import { assessmentInstructions } from '../ai/prompts/assessment.prompt';
import {
  calculateAssessmentScore,
} from '../ai/utils/assessment-helper';
import {
  AssessmentQuestion,
  VacancyAssessment,
  vacancyAssessmentSchema,
} from '../ai/schemas/assessment.schema';
import type { TelegramCallbackQuery, TelegramDirectMessage } from './types/telegram.types';
import { TelegramScreeningAlertService } from './telegram-screening-alert.service';

const MAX_CV_BYTES = 10 * 1024 * 1024;
const escapeTelegramHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

@Injectable()
export class TelegramApplyService {
  private readonly logger = new Logger(TelegramApplyService.name);
  private gemini: GeminiProvider;

  constructor(
    @Inject(Database) private db: Database,
    @Inject(Security) private security: Security,
    @Inject(TelegramApiService) private telegram: TelegramApiService,
    @Inject(TelegramQueueService) private queue: TelegramQueueService,
    @Optional() @Inject(R2Storage) private storage?: R2Storage,
    @Optional() @Inject(GeminiProvider) geminiProvider?: GeminiProvider,
    @Optional() @Inject(TelegramScreeningAlertService) private alerts?: TelegramScreeningAlertService,
  ) {
    const candidate =
      geminiProvider ??
      (storage && typeof (storage as any).generate === 'function'
        ? (storage as any)
        : null);
    this.gemini = candidate ?? new GeminiProvider(this.security);
  }

  async start(message: TelegramDirectMessage, token: string) {
    if (!message.from || message.chat.type !== 'private') return;

    const vacancy = await this.db.vacancy.findUnique({
      where: { publicToken: token, status: 'ACTIVE', company: { isActive: true } },
      include: {
        company: { select: { name: true, retentionDays: true } },
        requirements: { select: { name: true } },
      },
    });

    if (!vacancy) {
      await this.telegram.sendMessage(message.chat.id, 'Bu vakansiya ariza qabul qilmayapti.');
      return;
    }

    const priorCandidate = await this.db.candidate.findUnique({
      where: { companyId_telegramUserId: { companyId: vacancy.companyId, telegramUserId: String(message.from.id) } },
      select: { id: true },
    });
    if (priorCandidate && await this.db.application.findUnique({ where: { vacancyId_candidateId: { vacancyId: vacancy.id, candidateId: priorCandidate.id } }, select: { id: true } })) {
      await this.telegram.sendMessage(message.chat.id, 'Ushbu vakansiyaga arizangiz allaqachon qabul qilingan.');
      return;
    }

    if (this.storage && !this.storage.enabled) {
      await this.telegram.sendMessage(
        message.chat.id,
        `Telegram orqali CV qabul qilish sozlanmagan. Saytda ariza yuboring: ${this.security.config.FRONTEND_ORIGIN}/apply/${vacancy.publicToken}`,
      );
      return;
    }

    await this.db.telegramApplySession.upsert({
      where: { telegramUserId: String(message.from.id) },
      create: {
        telegramUserId: String(message.from.id),
        companyId: vacancy.companyId,
        vacancyId: vacancy.id,
        step: 'PRIVACY',
        currentQuestionIndex: 0,
        answers: [],
        assessmentQuestions: undefined,
        assessmentRevision: null,
        phone: null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      update: {
        companyId: vacancy.companyId,
        vacancyId: vacancy.id,
        step: 'PRIVACY',
        privacyAcceptedAt: null,
        aiConsentAt: null,
        currentQuestionIndex: 0,
        answers: [],
        assessmentQuestions: Prisma.DbNull,
        assessmentRevision: null,
        phone: null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await this.telegram.sendMessage(
      message.chat.id,
      `«${vacancy.title}» vakansiyasiga ariza.\n\n${vacancy.company.name} ma’lumotlaringiz, Telegram profilingizdagi ism va CVni ishga qabul qilish uchun saqlaydi (${vacancy.company.retentionDays} kungacha). Lavozimga mos test savollari AI yordamida yaratiladi va CVingiz AI orqali tahlil qilinadi; natijalar HRga ko‘rsatiladi. Davom etishga rozimisiz?`,
      {
        replyMarkup: {
          inline_keyboard: [
            [
              { text: 'Roziman', callback_data: `apply:${vacancy.id}:privacy:yes` },
              { text: 'Rad etaman', callback_data: `apply:${vacancy.id}:privacy:no` },
            ],
          ],
        },
      },
    );
  }

  async handleCallback(query: TelegramCallbackQuery) {
    const userId = String(query.from.id);
    const session = await this.db.telegramApplySession.findUnique({
      where: { telegramUserId: userId },
      include: {
        vacancy: {
          include: {
            requirements: { select: { name: true } },
          },
        },
      },
    });

    if (!session || session.expiresAt < new Date() || session.vacancy.status !== 'ACTIVE') {
      await this.telegram.answerCallbackQuery(
        query.id,
        'Ariza sessiyasi tugagan. E’lon havolasini qayta oching.',
        true,
      );
      return;
    }

    const chatId = query.message?.chat.id ?? query.from.id;
    const data = query.data ?? '';

    // 1. PRIVACY step
    const privacyAction = data.match(/^apply:(\d+):privacy:(yes|no)$/);
    if (privacyAction && Number(privacyAction[1]) === session.vacancyId) {
      if (session.step !== 'PRIVACY') {
        await this.telegram.answerCallbackQuery(query.id, 'Bu bosqich allaqachon yakunlangan.');
        return;
      }

      if (privacyAction[2] === 'no') {
        const removed = await this.db.telegramApplySession.deleteMany({ where: { telegramUserId: userId, vacancyId: session.vacancyId, step: 'PRIVACY' } });
        await this.telegram.answerCallbackQuery(query.id, removed.count ? 'Ariza bekor qilindi' : 'Bu bosqich allaqachon yakunlangan.');
        if (removed.count) await this.telegram.sendMessage(chatId, 'Rozilik berilmadi. Ma’lumotlar saqlanmaydi.');
        return;
      }

      let assessment: VacancyAssessment | null = null;
      try {
        assessment = await this.getAssessment(session.vacancy);
      } catch (error) {
        this.logger.warn(`Assessment unavailable for vacancy ${session.vacancyId}: ${(error as Error).message}`);
      }
      const claimed = await this.db.telegramApplySession.updateMany({
        where: { telegramUserId: userId, vacancyId: session.vacancyId, step: 'PRIVACY' },
        data: {
          step: assessment ? 'ASSESSMENT' : 'CONTACT_PHONE',
          privacyAcceptedAt: new Date(),
          aiConsentAt: new Date(),
          assessmentQuestions: assessment ?? Prisma.DbNull,
          assessmentRevision: assessment ? session.vacancy.revision : null,
          currentQuestionIndex: 0,
          answers: [],
        },
      });
      if (!claimed.count) {
        await this.telegram.answerCallbackQuery(query.id, 'Bu bosqich allaqachon yakunlangan.');
        return;
      }
      await this.telegram.answerCallbackQuery(query.id);
      if (!assessment) {
        await this.telegram.sendMessage(chatId, 'Hozir test savollarini tayyorlab bo‘lmadi. Arizangiz qo‘lda ko‘rib chiqiladi. Telefon raqamingizni yuboring (masalan: +998901234567):');
        return;
      }
      await this.telegram.sendMessage(chatId,
        `📋 <b>Lavozimga mos test (10 ta savol)</b>\n\n` +
        `• 5 ta Hard skill va 5 ta Soft skill savoli\n` +
        `🎯 O‘tish bali: 70% (kamida 7 ta to‘g‘ri javob).\n` +
        `Natijadan qat’i nazar, CVingiz qabul qilinadi.`,
        { parseMode: 'HTML', replyMarkup: { inline_keyboard: [[{ text: '▶️ Testni boshlash', callback_data: `apply:${session.vacancyId}:quiz:start` }]] } },
      );
      return;
    }

    if (/^apply:\d+:ai:(yes|no)$/.test(data)) {
      await this.telegram.answerCallbackQuery(query.id, 'Eski tugma. Vakansiya havolasini qayta oching.', true);
      return;
    }

    // 3. QUIZ START
    if (data === `apply:${session.vacancyId}:quiz:start`) {
      if (session.step !== 'ASSESSMENT') {
        await this.telegram.answerCallbackQuery(query.id, 'Test faol emas yoki yakunlangan.');
        return;
      }

      const assessment = vacancyAssessmentSchema.safeParse(session.assessmentQuestions);
      if (!assessment.success) {
        await this.telegram.answerCallbackQuery(query.id, 'Test mavjud emas. Vakansiya havolasini qayta oching.', true);
        return;
      }
      await this.telegram.answerCallbackQuery(query.id, 'Test boshlandi!');
      await this.sendQuestion(chatId, session.vacancyId, assessment.data.questions, session.currentQuestionIndex);
      return;
    }

    // 4. QUIZ QUESTION ANSWER: apply:<vacancyId>:quiz:<questionId>:<choiceIndex>
    const quizAnswerMatch = data.match(/^apply:(\d+):quiz:(\d+):(\d+)$/);
    if (quizAnswerMatch && Number(quizAnswerMatch[1]) === session.vacancyId) {
      if (session.step !== 'ASSESSMENT') {
        await this.telegram.answerCallbackQuery(query.id, 'Test yakunlangan.');
        return;
      }

      const qId = Number(quizAnswerMatch[2]);
      const choiceIdx = Number(quizAnswerMatch[3]);

      const assessment = vacancyAssessmentSchema.safeParse(session.assessmentQuestions);
      if (!assessment.success) {
        await this.telegram.answerCallbackQuery(query.id, 'Test mavjud emas. Vakansiya havolasini qayta oching.', true);
        return;
      }
      const rawAnswers = (session.answers as Array<{ questionId: number; selectedIndex: number }>) || [];

      if (session.currentQuestionIndex !== rawAnswers.length || assessment.data.questions[session.currentQuestionIndex]?.id !== qId || choiceIdx < 0 || choiceIdx > 3) {
        await this.telegram.answerCallbackQuery(query.id, 'Bu savolga allaqachon javob berdingiz.');
        return;
      }

      const updatedAnswers = [...rawAnswers, { questionId: qId, selectedIndex: choiceIdx }];
      const nextIndex = updatedAnswers.length;

      const claimed = await this.db.telegramApplySession.updateMany({
        where: { telegramUserId: userId, vacancyId: session.vacancyId, step: 'ASSESSMENT', currentQuestionIndex: session.currentQuestionIndex },
        data: {
          step: nextIndex === assessment.data.questions.length ? 'CONTACT_PHONE' : 'ASSESSMENT',
          currentQuestionIndex: nextIndex,
          answers: updatedAnswers as any,
        },
      });
      if (!claimed.count) {
        await this.telegram.answerCallbackQuery(query.id, 'Javob allaqachon qabul qilingan.');
        return;
      }
      await this.telegram.answerCallbackQuery(query.id, 'Javob qabul qilindi');

      if (nextIndex < assessment.data.questions.length) {
        await this.sendQuestion(chatId, session.vacancyId, assessment.data.questions, nextIndex);
      } else {
        const result = calculateAssessmentScore(assessment.data.questions, updatedAnswers);

        // Test tugashi bilanoq nomzodni bazaga saqlaymiz (CV yuborishni kutmasdan)
        const fullName =
          [query.from.first_name, query.from.last_name].filter(Boolean).join(' ').trim() ||
          `Telegram user ${userId}`;
        await this.db.candidate.upsert({
          where: { companyId_telegramUserId: { companyId: session.companyId, telegramUserId: userId } },
          create: {
            companyId: session.companyId,
            telegramUserId: userId,
            telegramUsername: query.from?.username ?? null,
            fullName,
            phone: null,
            source: 'TELEGRAM',
            publicSubmittedAt: new Date(),
            privacyAcceptedAt: session.privacyAcceptedAt!,
            aiConsentAt: session.aiConsentAt,
          },
          update: {
            telegramUsername: query.from?.username ?? null,
            publicSubmittedAt: new Date(),
            privacyAcceptedAt: session.privacyAcceptedAt!,
            aiConsentAt: session.aiConsentAt,
          },
        });

        await this.telegram.sendMessage(chatId,
          `📊 <b>Test natijangiz: ${result.score}%</b> (${result.correctCount}/10)\n` +
          `• Hard skills: ${result.hardSkillScore}%\n` +
          `• Soft skills: ${result.softSkillScore}%\n\n` +
          `Arizangizni yakunlash uchun telefon raqamingizni yuboring (masalan: <code>+998901234567</code>):`,
          { parseMode: 'HTML' },
        );
      }
      return;
    }

    await this.telegram.answerCallbackQuery(
      query.id,
      'Bu tugma avvalgi so‘rovga tegishli.',
      true,
    );
  }

  async handleText(message: TelegramDirectMessage): Promise<boolean> {
    if (!message.from || message.chat.type !== 'private' || !message.text) return false;
    const userId = String(message.from.id);
    const session = await this.db.telegramApplySession.findUnique({
      where: { telegramUserId: userId },
      include: { vacancy: { select: { title: true } } },
    });

    if (!session || session.expiresAt < new Date()) return false;

    if (session.step === 'CONTACT_PHONE') {
      const rawText = message.text.trim();
      const cleanedPhone = rawText.replace(/[^\d+]/g, '');

      if (!/^\+?[0-9]{9,15}$/.test(cleanedPhone)) {
        await this.telegram.sendMessage(
          message.chat.id,
          'Iltimos, telefon raqamingizni xalqaro formatda to‘g‘ri kiriting (masalan: <code>+998901234567</code>):',
          { parseMode: 'HTML' },
        );
        return true;
      }

      const updated = await this.db.telegramApplySession.updateMany({
        where: { telegramUserId: userId, step: 'CONTACT_PHONE' },
        data: {
          step: 'DOCUMENT',
          phone: cleanedPhone,
        },
      });
      if (!updated.count) return true;

      // Telefon kiritilganda nomzodni bazaga saqlaymiz (test bo'lmagan holat uchun)
      const fullName =
        [message.from.first_name, message.from.last_name].filter(Boolean).join(' ').trim() ||
        `Telegram user ${userId}`;
      await this.db.candidate.upsert({
        where: { companyId_telegramUserId: { companyId: session.companyId, telegramUserId: userId } },
        create: {
          companyId: session.companyId,
          telegramUserId: userId,
          telegramUsername: message.from?.username ?? null,
          fullName,
          phone: cleanedPhone,
          source: 'TELEGRAM',
          publicSubmittedAt: new Date(),
          privacyAcceptedAt: session.privacyAcceptedAt!,
          aiConsentAt: session.aiConsentAt,
        },
        update: {
          telegramUsername: message.from?.username ?? null,
          phone: cleanedPhone,
          publicSubmittedAt: new Date(),
          privacyAcceptedAt: session.privacyAcceptedAt!,
          aiConsentAt: session.aiConsentAt,
        },
      });

      await this.telegram.sendMessage(
        message.chat.id,
        `✅ Telefon raqamingiz saqlandi: <b>${cleanedPhone}</b>\n\n` +
          `Endi «${escapeTelegramHtml(session.vacancy.title)}» vakansiyasi uchun rezyumeyingizni (CV) <b>PDF</b> yoki <b>DOCX</b> formatidagi fayl sifatida yuboring (10 MB gacha).`,
        { parseMode: 'HTML' },
      );
      return true;
    }

    if (session.step === 'ASSESSMENT') {
      await this.telegram.sendMessage(
        message.chat.id,
        'Iltimos, test savollariga javob berish uchun yuqoridagi tugmalardan (A, B, C, D) foydalaning.',
      );
      return true;
    }

    return false;
  }

  async handleContact(message: TelegramDirectMessage): Promise<boolean> {
    if (!message.from || message.chat.type !== 'private' || !message.contact) return false;
    const userId = String(message.from.id);
    const session = await this.db.telegramApplySession.findUnique({
      where: { telegramUserId: userId },
      include: { vacancy: { select: { title: true } } },
    });

    if (!session || session.expiresAt < new Date()) return false;

    if (session.step === 'CONTACT_PHONE') {
      let rawPhone = message.contact.phone_number.trim();
      if (!rawPhone.startsWith('+')) rawPhone = `+${rawPhone}`;
      const cleanedPhone = rawPhone.replace(/[^\d+]/g, '');

      const updated = await this.db.telegramApplySession.updateMany({
        where: { telegramUserId: userId, step: 'CONTACT_PHONE' },
        data: {
          step: 'DOCUMENT',
          phone: cleanedPhone,
        },
      });
      if (!updated.count) return true;

      // Kontakt orqali telefon kiritilganda nomzodni bazaga saqlaymiz
      const fullName =
        [message.from.first_name, message.from.last_name].filter(Boolean).join(' ').trim() ||
        `Telegram user ${userId}`;
      await this.db.candidate.upsert({
        where: { companyId_telegramUserId: { companyId: session.companyId, telegramUserId: userId } },
        create: {
          companyId: session.companyId,
          telegramUserId: userId,
          telegramUsername: message.from?.username ?? null,
          fullName,
          phone: cleanedPhone,
          source: 'TELEGRAM',
          publicSubmittedAt: new Date(),
          privacyAcceptedAt: session.privacyAcceptedAt!,
          aiConsentAt: session.aiConsentAt,
        },
        update: {
          telegramUsername: message.from?.username ?? null,
          phone: cleanedPhone,
          publicSubmittedAt: new Date(),
          privacyAcceptedAt: session.privacyAcceptedAt!,
          aiConsentAt: session.aiConsentAt,
        },
      });

      await this.telegram.sendMessage(
        message.chat.id,
        `✅ Telefon raqamingiz qabul qilindi: <b>${cleanedPhone}</b>\n\n` +
          `Endi «${escapeTelegramHtml(session.vacancy.title)}» vakansiyasi uchun rezyumeyingizni (CV) <b>PDF</b> yoki <b>DOCX</b> formatidagi fayl sifatida yuboring (10 MB gacha).`,
        { parseMode: 'HTML' },
      );
      return true;
    }

    return false;
  }

  async handleDocument(message: TelegramDirectMessage) {
    if (!message.from || !message.document || message.chat.type !== 'private') return;
    const userId = String(message.from.id);
    const session = await this.db.telegramApplySession.findUnique({
      where: { telegramUserId: userId },
      include: {
        vacancy: {
          include: {
            requirements: { select: { name: true } },
          },
        },
      },
    });

    if (
      !session ||
      session.step !== 'DOCUMENT' ||
      !session.privacyAcceptedAt ||
      session.expiresAt < new Date() ||
      session.vacancy.status !== 'ACTIVE'
    ) {
      await this.telegram.sendMessage(
        message.chat.id,
        'Avval vacancy havolasini ochib, test va ma’lumotlarni kiritish bosqichlarini yakunlang.',
      );
      return;
    }

    const document = message.document;
    const name = document.file_name?.trim().slice(0, 180) ?? '';
    const mime = document.mime_type?.toLowerCase() ?? '';

    if (
      !/\.(pdf|docx)$/i.test(name) ||
      !['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(
        mime,
      ) ||
      (document.file_size ?? 0) > MAX_CV_BYTES
    ) {
      await this.telegram.sendMessage(
        message.chat.id,
        'PDF yoki DOCX formatidagi, 10 MB dan kichik CV fayl yuboring.',
      );
      return;
    }

    await this.security.limit(`telegram-apply:${userId}`, 5, 3600);

    const fullName =
      [message.from.first_name, message.from.last_name].filter(Boolean).join(' ').trim() ||
      `Telegram user ${userId}`;

    // Score the exact questions shown to this applicant, even if the vacancy was edited.
    const assessment = vacancyAssessmentSchema.safeParse(session.assessmentQuestions);
    const rawAnswers = (session.answers as Array<{ questionId: number; selectedIndex: number }>) || [];
    const assessmentResult = assessment.success && rawAnswers.length === 10
      ? calculateAssessmentScore(assessment.data.questions, rawAnswers)
      : null;

    let result: { candidate: { id: number }; resume: { id: number }; application: { id: number } };
    try {
    result = await this.db.$transaction(async (tx) => {
      const claimed = await tx.telegramApplySession.deleteMany({ where: { telegramUserId: userId, companyId: session.companyId, vacancyId: session.vacancyId, step: 'DOCUMENT', expiresAt: { gt: new Date() } } });
      if (!claimed.count) throw new Error('APPLICATION_ALREADY_SUBMITTED');
      const candidate = await tx.candidate.upsert({
        where: { companyId_telegramUserId: { companyId: session.companyId, telegramUserId: userId } },
        create: {
          companyId: session.companyId,
          telegramUserId: userId,
          telegramUsername: message.from?.username ?? null,
          fullName,
          phone: session.phone ?? null,
          source: 'TELEGRAM',
          publicSubmittedAt: new Date(),
          privacyAcceptedAt: session.privacyAcceptedAt!,
          aiConsentAt: session.aiConsentAt,
        },
        update: {
          telegramUsername: message.from?.username ?? null,
          phone: session.phone ?? undefined,
          publicSubmittedAt: new Date(),
          privacyAcceptedAt: session.privacyAcceptedAt!,
          aiConsentAt: session.aiConsentAt,
        },
      });

      const application = await tx.application.upsert({
        where: { vacancyId_candidateId: { vacancyId: session.vacancyId, candidateId: candidate.id } },
        create: {
          companyId: session.companyId,
          vacancyId: session.vacancyId,
          candidateId: candidate.id,
          status: 'NEW',
          aiConsentGranted: true,
          assessmentScore: assessmentResult?.score ?? null,
          assessmentResult: assessmentResult ? (assessmentResult as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        },
        update: {
          aiConsentGranted: true,
          assessmentScore: assessmentResult?.score ?? null,
          assessmentResult: assessmentResult ? (assessmentResult as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });

      const resume = await tx.resume.create({
        data: {
          companyId: session.companyId,
          candidateId: candidate.id,
          fileName: name,
          mimeType: mime,
          fileSize: document.file_size,
          telegramFileId: document.file_id,
        },
      });

      await tx.candidateEvent.create({
        data: {
          companyId: session.companyId,
          candidateId: candidate.id,
          type: 'TELEGRAM_APPLICATION_RECEIVED',
          label: assessmentResult ? `Applied for ${session.vacancy.title} with test score ${assessmentResult.score}%` : `Applied for ${session.vacancy.title}; manual review required`,
        },
      });

      if (assessmentResult?.passed) {
        const connections = await tx.telegramBusinessConnection.findMany({
          where: { companyId: session.companyId, enabled: true, screeningAlertsEnabled: true, user: { companyId: session.companyId, isActive: true, role: { in: ['ADMIN', 'HR', 'RECRUITER'] } } },
          select: { userChatId: true, telegramUserId: true },
        });
        const chatIds = [...new Set(connections.map((conn) => String(conn.userChatId || conn.telegramUserId)).filter((id) => id !== '0'))];
        if (chatIds.length) await tx.telegramScreeningAlert.createMany({
          data: chatIds.map((chatId) => ({ companyId: session.companyId, applicationId: application.id, chatId })),
          skipDuplicates: true,
        });
      }

      return { candidate, resume, application };
    });
    } catch (error) {
      if ((error as Error).message === 'APPLICATION_ALREADY_SUBMITTED') {
        await this.telegram.sendMessage(message.chat.id, 'Ushbu ariza avval qabul qilingan.');
        return;
      }
      throw error;
    }

    void this.alerts?.dispatch();

    try {
      await this.queue.add({
        companyId: session.companyId,
        candidateId: result.candidate.id,
        resumeId: result.resume.id,
        fileId: document.file_id,
        applicationId: result.application.id,
      });

      await this.telegram.sendMessage(
        message.chat.id,
        `✅ <b>Rezyumeyingiz va arizangiz qabul qilindi!</b>\n\n` +
          (assessmentResult
            ? `📊 Test natijangiz: <b>${assessmentResult.score}%</b> (${assessmentResult.correctCount}/10 to‘g‘ri)\n` +
              `• Hard skills: ${assessmentResult.hardSkillScore}%\n` +
              `• Soft skills: ${assessmentResult.softSkillScore}%\n\n`
            : 'Test vaqtincha ishlamadi; arizangiz HR tomonidan qo‘lda ko‘rib chiqiladi.\n\n') +
          'HR mutaxassislari arizangizni ko‘rib chiqadi.',
        { parseMode: 'HTML' },
      );
    } catch (error) {
      this.logger.warn(`Telegram application queue failed resumeId=${result.resume.id}`);
      await this.db.resume.update({
        where: { id: result.resume.id },
        data: { status: 'FAILED', error: 'Processing queue unavailable' },
      });
      await this.telegram.sendMessage(
        message.chat.id,
        'Ariza va test natijalari qabul qilindi, ammo CVni qayta ishlash navbatida uzilish bo‘ldi. HRga xabar yetkaziladi.',
      );
    }
  }

  /** Reused by the join_ flow (TelegramJoinService). */
  async getAssessment(vacancy: {
    id: number;
    companyId: number;
    title: string;
    description: string;
    revision: number;
    assessmentQuestions?: any;
    assessmentRevision?: number | null;
    requirements?: { name: string }[];
  }): Promise<VacancyAssessment> {
    if (
      vacancy.assessmentQuestions &&
      vacancy.assessmentRevision === vacancy.revision
    ) {
      const parsed = vacancyAssessmentSchema.safeParse(vacancy.assessmentQuestions);
      if (parsed.success) {
        return parsed.data;
      }
    }

    if (!this.security?.config?.GEMINI_API_KEY) throw new Error('AI assessment provider is not configured');
    const assessment = await this.gemini.generate(
          vacancyAssessmentSchema,
          `Generate 10 screening assessment questions (5 Hard Skills + 5 Soft Skills) for the role "${vacancy.title}".`,
          {
            title: vacancy.title,
            description: vacancy.description,
            requirements: vacancy.requirements?.map((r) => ({ name: r.name })) || [],
          },
          assessmentInstructions,
        );

    // Only the first completed generation wins for this vacancy revision.
    await this.db.vacancy.updateMany({
      where: { id: vacancy.id, companyId: vacancy.companyId, revision: vacancy.revision,
        OR: [{ assessmentRevision: null }, { assessmentRevision: { not: vacancy.revision } }] },
      data: { assessmentQuestions: assessment, assessmentRevision: vacancy.revision, assessmentEditVersion: { increment: 1 } },
    });
    const current = await this.db.vacancy.findUnique({ where: { id: vacancy.id }, select: { assessmentQuestions: true, assessmentRevision: true } });
    if (current?.assessmentRevision === vacancy.revision) {
      const parsed = vacancyAssessmentSchema.safeParse(current.assessmentQuestions);
      if (parsed.success) return parsed.data;
    }
    return assessment;
  }

  private async sendQuestion(
    chatId: number,
    vacancyId: number,
    questions: AssessmentQuestion[],
    index: number,
  ) {
    const q = questions[index];
    if (!q) return;

    const categoryBadge = q.type === 'HARD_SKILL' ? '💡 Hard Skill' : '🤝 Soft Skill';

    const text =
      `❓ <b>Savol ${index + 1}/${questions.length}</b> [${categoryBadge}]\n\n` +
      `${escapeTelegramHtml(q.question)}\n\n` +
      `<b>A)</b> ${escapeTelegramHtml(q.options[0])}\n` +
      `<b>B)</b> ${escapeTelegramHtml(q.options[1])}\n` +
      `<b>C)</b> ${escapeTelegramHtml(q.options[2])}\n` +
      `<b>D)</b> ${escapeTelegramHtml(q.options[3])}`;

    await this.telegram.sendMessage(chatId, text, {
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [
            { text: 'A', callback_data: `apply:${vacancyId}:quiz:${q.id}:0` },
            { text: 'B', callback_data: `apply:${vacancyId}:quiz:${q.id}:1` },
          ],
          [
            { text: 'C', callback_data: `apply:${vacancyId}:quiz:${q.id}:2` },
            { text: 'D', callback_data: `apply:${vacancyId}:quiz:${q.id}:3` },
          ],
        ],
      },
    });
  }
}
