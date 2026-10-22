import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { Security } from '../../common/utils/security';
import { R2Storage } from '../../common/storage/r2-storage.service';
import { calculateAssessmentScore } from '../ai/utils/assessment-helper';
import { AssessmentQuestion, vacancyAssessmentSchema } from '../ai/schemas/assessment.schema';
import { TelegramApiService } from './telegram-api.service';
import { TelegramApplyService } from './telegram-apply.service';
import { TelegramQueueService } from './telegram-queue.service';
import { TelegramScreeningAlertService } from './telegram-screening-alert.service';
import type { TelegramCallbackQuery, TelegramDirectMessage } from './types/telegram.types';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CV_BYTES = 10 * 1024 * 1024;
const MAX_VACANCY_BUTTONS = 10;
const CV_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** "Ism Familiya": at least two words made of letters, apostrophes, dots or hyphens. */
export function parseFullName(input: string): string | null {
  const name = input.replace(/\s+/g, ' ').trim();
  if (name.length < 3 || name.length > 80) return null;
  if (!/^[\p{L}][\p{L}\p{M}'’ʻʼ`.\- ]*$/u.test(name)) return null;
  const words = name.split(' ').filter((word) => /\p{L}/u.test(word));
  return words.length >= 2 ? name : null;
}

/** Accepts +998901234567 or 998901234567 style numbers (9-15 digits). */
export function parsePhone(input: string, assumePlus = false): string | null {
  let value = input.trim();
  if (assumePlus && !value.startsWith('+')) value = `+${value}`;
  const cleaned = value.replace(/[^\d+]/g, '');
  return /^\+?[0-9]{9,15}$/.test(cleaned) ? cleaned : null;
}

/**
 * Candidate intake from t.me/<bot>?start=join_<companyToken>:
 * consent -> field -> vacancy -> name -> phone -> CV -> AI test.
 * Independent of TelegramApplyService (the apply_<vacancyToken> flow); both use the same bot.
 */
@Injectable()
export class TelegramJoinService {
  private readonly logger = new Logger(TelegramJoinService.name);

  constructor(
    @Inject(Database) private db: Database,
    @Inject(Security) private security: Security,
    @Inject(TelegramApiService) private telegram: TelegramApiService,
    @Inject(TelegramQueueService) private queue: TelegramQueueService,
    @Inject(TelegramApplyService) private apply: TelegramApplyService,
    @Optional() @Inject(R2Storage) private storage?: R2Storage,
    @Optional() @Inject(TelegramScreeningAlertService) private alerts?: TelegramScreeningAlertService,
  ) {}

  /** The link HR shares with candidates (and the Business redirect message uses the same one). */
  async candidateLink(companyId: number) {
    const company = await this.db.company.findUniqueOrThrow({ where: { id: companyId }, select: { publicToken: true, telegramAutoPublish: true } });
    const bot = await this.telegram.getMe();
    return { url: `https://t.me/${bot.username}?start=join_${company.publicToken}`, botUsername: bot.username, autoPublish: company.telegramAutoPublish };
  }

  /** Drops an unfinished join session, e.g. when the same user opens a vacancy link instead. */
  async cancel(userId: string) {
    await this.db.telegramJoinSession.deleteMany({ where: { telegramUserId: userId } });
  }

  async start(message: TelegramDirectMessage, token: string) {
    if (!message.from || message.chat.type !== 'private') return;
    const userId = String(message.from.id);

    const company = await this.db.company.findFirst({
      where: { publicToken: token, isActive: true },
      select: { id: true, name: true, retentionDays: true },
    });
    if (!company) {
      await this.telegram.sendMessage(message.chat.id, 'Bu havola yaroqsiz yoki ariza qabul qilish to‘xtatilgan.');
      return;
    }
    if (this.storage && !this.storage.enabled) {
      await this.telegram.sendMessage(message.chat.id, 'Hozircha Telegram orqali ariza qabul qilinmayapti. Keyinroq urinib ko‘ring.');
      return;
    }

    await this.db.telegramApplySession.deleteMany({ where: { telegramUserId: userId } });
    await this.db.telegramJoinSession.upsert({
      where: { telegramUserId: userId },
      create: { telegramUserId: userId, companyId: company.id, step: 'PRIVACY', answers: [], expiresAt: this.expiry() },
      update: {
        companyId: company.id,
        step: 'PRIVACY',
        vacancyId: null,
        fullName: null,
        phone: null,
        privacyAcceptedAt: null,
        aiConsentAt: null,
        applicationId: null,
        currentQuestionIndex: 0,
        answers: [],
        assessmentQuestions: Prisma.DbNull,
        assessmentRevision: null,
        expiresAt: this.expiry(),
      },
    });

    await this.telegram.sendMessage(
      message.chat.id,
      `${company.name} ga ariza.\n\n${company.name} ma’lumotlaringiz, ismingiz, telefon raqamingiz va CVni ishga qabul qilish uchun saqlaydi (${company.retentionDays} kungacha). Tanlangan lavozimga mos test savollari AI yordamida yaratiladi va CVingiz AI orqali tahlil qilinadi; natijalar HRga ko‘rsatiladi. Davom etishga rozimisiz?`,
      {
        replyMarkup: {
          inline_keyboard: [[
            { text: 'Roziman', callback_data: 'join:privacy:yes' },
            { text: 'Rad etaman', callback_data: 'join:privacy:no' },
          ]],
        },
      },
    );
  }

  async handleCallback(query: TelegramCallbackQuery): Promise<boolean> {
    const data = query.data ?? '';
    if (!data.startsWith('join:')) return false;
    const userId = String(query.from.id);
    const chatId = query.message?.chat.id ?? query.from.id;

    const session = await this.activeSession(userId);
    if (!session) {
      await this.telegram.answerCallbackQuery(query.id, 'Ariza sessiyasi tugagan. Havolani qayta oching.', true);
      return true;
    }
    const stale = () => this.telegram.answerCallbackQuery(query.id, 'Bu bosqich allaqachon yakunlangan.');

    if (data === 'join:privacy:no') {
      const removed = await this.db.telegramJoinSession.deleteMany({ where: { telegramUserId: userId, step: 'PRIVACY' } });
      if (!removed.count) {
        await stale();
        return true;
      }
      await this.telegram.answerCallbackQuery(query.id, 'Ariza bekor qilindi');
      await this.telegram.sendMessage(chatId, 'Rozilik berilmadi. Ma’lumotlar saqlanmaydi.');
      return true;
    }

    if (data === 'join:privacy:yes') {
      await this.offerVacancies(query, session);
      return true;
    }

    const vacancyMatch = data.match(/^join:vac:(\d+)$/);
    if (vacancyMatch) {
      if (session.step !== 'VACANCY') {
        await stale();
        return true;
      }
      await this.chooseVacancy(query, session, Number(vacancyMatch[1]));
      return true;
    }

    if (data === 'join:quizstart') {
      if (session.step !== 'ASSESSMENT') {
        await this.telegram.answerCallbackQuery(query.id, 'Test faol emas yoki yakunlangan.');
        return true;
      }
      const assessment = vacancyAssessmentSchema.safeParse(session.assessmentQuestions);
      if (!assessment.success) {
        await this.telegram.answerCallbackQuery(query.id, 'Test hali tayyor emas. Birozdan keyin urinib ko‘ring.', true);
        return true;
      }
      await this.telegram.answerCallbackQuery(query.id, 'Test boshlandi!');
      await this.sendQuestion(chatId, assessment.data.questions, session.currentQuestionIndex);
      return true;
    }

    const answerMatch = data.match(/^join:q:(\d+):(\d+)$/);
    if (answerMatch) {
      await this.answer(query, session, Number(answerMatch[1]), Number(answerMatch[2]));
      return true;
    }

    await this.telegram.answerCallbackQuery(query.id, 'Bu tugma avvalgi so‘rovga tegishli.', true);
    return true;
  }

  async handleText(message: TelegramDirectMessage): Promise<boolean> {
    if (!message.from || message.chat.type !== 'private' || !message.text) return false;
    const session = await this.activeSession(String(message.from.id));
    if (!session) return false;
    const chatId = message.chat.id;
    const userId = String(message.from.id);

    switch (session.step) {
      case 'NAME': {
        const fullName = parseFullName(message.text);
        if (!fullName) {
          await this.telegram.sendMessage(chatId, 'Iltimos, ism va familiyangizni to‘liq yozing (masalan: Aziz Karimov).');
          return true;
        }
        const claimed = await this.db.telegramJoinSession.updateMany({
          where: { telegramUserId: userId, step: 'NAME' },
          data: { step: 'PHONE', fullName },
        });
        if (claimed.count) await this.askPhone(chatId, fullName);
        return true;
      }
      case 'PHONE': {
        const phone = parsePhone(message.text);
        if (!phone) {
          await this.telegram.sendMessage(
            chatId,
            'Iltimos, telefon raqamingizni xalqaro formatda kiriting (masalan: <code>+998901234567</code>) yoki «Raqamni ulashish» tugmasini bosing.',
            { parseMode: 'HTML' },
          );
          return true;
        }
        await this.savePhone(userId, chatId, phone);
        return true;
      }
      case 'ASSESSMENT':
        await this.telegram.sendMessage(chatId, 'Iltimos, test savollariga javob berish uchun yuqoridagi tugmalardan (A, B, C, D) foydalaning.');
        return true;
      case 'DOCUMENT':
        await this.telegram.sendMessage(chatId, 'Rezyumeyingizni (CV) <b>PDF</b> yoki <b>DOCX</b> fayl sifatida yuboring (10 MB gacha).', { parseMode: 'HTML' });
        return true;
      default:
        await this.telegram.sendMessage(chatId, 'Iltimos, yuqoridagi tugmalardan birini tanlang.');
        return true;
    }
  }

  async handleContact(message: TelegramDirectMessage): Promise<boolean> {
    if (!message.from || message.chat.type !== 'private' || !message.contact) return false;
    const session = await this.activeSession(String(message.from.id));
    if (!session) return false;
    if (session.step !== 'PHONE') return false;
    const phone = parsePhone(message.contact.phone_number, true);
    if (!phone) {
      await this.telegram.sendMessage(message.chat.id, 'Raqam noto‘g‘ri ko‘rinadi. Iltimos, raqamni qo‘lda kiriting (masalan: +998901234567).');
      return true;
    }
    await this.savePhone(String(message.from.id), message.chat.id, phone);
    return true;
  }

  async handleDocument(message: TelegramDirectMessage): Promise<boolean> {
    if (!message.from || !message.document || message.chat.type !== 'private') return false;
    const userId = String(message.from.id);
    const session = await this.activeSession(userId);
    if (!session) return false;
    const chatId = message.chat.id;

    if (session.step !== 'DOCUMENT' || !session.privacyAcceptedAt || !session.fullName) {
      await this.telegram.sendMessage(chatId, 'CV yuborishdan oldin avvalgi bosqichlarni (soha, ism, telefon) yakunlang.');
      return true;
    }

    const document = message.document;
    const fileName = document.file_name?.trim().slice(0, 180) ?? '';
    const mime = document.mime_type?.toLowerCase() ?? '';
    if (!/\.(pdf|docx)$/i.test(fileName) || !CV_MIME_TYPES.includes(mime) || (document.file_size ?? 0) > MAX_CV_BYTES) {
      await this.telegram.sendMessage(chatId, 'PDF yoki DOCX formatidagi, 10 MB dan kichik CV fayl yuboring.');
      return true;
    }
    await this.security.limit(`telegram-join:${userId}`, 5, 3600);

    const vacancy = session.vacancyId
      ? await this.db.vacancy.findFirst({
          where: { id: session.vacancyId, companyId: session.companyId, status: 'ACTIVE', company: { isActive: true } },
          include: { requirements: { select: { name: true } } },
        })
      : null;
    if (session.vacancyId && !vacancy) {
      await this.cancel(userId);
      await this.telegram.sendMessage(chatId, 'Bu vakansiya endi ariza qabul qilmayapti. Havolani qayta ochib, boshqa vakansiyani tanlang.');
      return true;
    }
    let result: { candidateId: number; resumeId: number; applicationId: number | null };
    try {
      result = await this.db.$transaction(async (tx) => {
        // The session update/delete is the atomic claim: a repeated update cannot submit twice.
        const claimed = vacancy
          ? await tx.telegramJoinSession.updateMany({
              where: { telegramUserId: userId, step: 'DOCUMENT', expiresAt: { gt: new Date() } },
              data: { step: 'ASSESSMENT', assessmentQuestions: Prisma.DbNull, currentQuestionIndex: 0, answers: [] },
            })
          : await tx.telegramJoinSession.deleteMany({
              where: { telegramUserId: userId, step: 'DOCUMENT', expiresAt: { gt: new Date() } },
            });
        if (!claimed.count) throw new Error('ALREADY_SUBMITTED');

        const candidate = await tx.candidate.upsert({
          where: { companyId_telegramUserId: { companyId: session.companyId, telegramUserId: userId } },
          create: {
            companyId: session.companyId,
            telegramUserId: userId,
            telegramUsername: message.from?.username ?? null,
            fullName: session.fullName!,
            phone: session.phone ?? null,
            source: 'TELEGRAM',
            publicSubmittedAt: new Date(),
            privacyAcceptedAt: session.privacyAcceptedAt!,
            aiConsentAt: session.aiConsentAt,
          },
          update: {
            telegramUsername: message.from?.username ?? null,
            fullName: session.fullName!,
            phone: session.phone ?? undefined,
            publicSubmittedAt: new Date(),
            privacyAcceptedAt: session.privacyAcceptedAt!,
            aiConsentAt: session.aiConsentAt,
          },
        });

        let applicationId: number | null = null;
        if (vacancy) {
          const application = await tx.application.upsert({
            where: { vacancyId_candidateId: { vacancyId: vacancy.id, candidateId: candidate.id } },
            create: { companyId: session.companyId, vacancyId: vacancy.id, candidateId: candidate.id, status: 'NEW', aiConsentGranted: true },
            update: { aiConsentGranted: true },
          });
          applicationId = application.id;
          await tx.telegramJoinSession.updateMany({ where: { telegramUserId: userId }, data: { applicationId } });
        }

        const resume = await tx.resume.create({
          data: {
            companyId: session.companyId,
            candidateId: candidate.id,
            fileName,
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
            label: vacancy
              ? `Applied via Telegram bot for ${vacancy.title}`
              : 'Left details via Telegram bot; no open vacancy',
          },
        });
        return { candidateId: candidate.id, resumeId: resume.id, applicationId };
      });
    } catch (error) {
      if ((error as Error).message === 'ALREADY_SUBMITTED') {
        await this.telegram.sendMessage(chatId, 'Ushbu ariza avval qabul qilingan.');
        return true;
      }
      throw error;
    }

    try {
      await this.queue.add({
        companyId: session.companyId,
        candidateId: result.candidateId,
        resumeId: result.resumeId,
        fileId: document.file_id,
        ...(result.applicationId ? { applicationId: result.applicationId } : {}),
      });
    } catch {
      this.logger.warn(`Telegram join queue failed resumeId=${result.resumeId}`);
      await this.db.resume.update({ where: { id: result.resumeId }, data: { status: 'FAILED', error: 'Processing queue unavailable' } });
    }

    if (!vacancy) {
      await this.telegram.sendMessage(
        chatId,
        '✅ <b>Ma’lumotlaringiz va CV qabul qilindi!</b>\n\nHozircha bu sohada ochiq vakansiya yo‘q. Yangi vakansiya ochilsa, HR siz bilan bog‘lanadi.',
        { parseMode: 'HTML' },
      );
      return true;
    }

    await this.telegram.sendMessage(chatId, '✅ <b>CV qabul qilindi.</b> Endi qisqa test topshiring.', { parseMode: 'HTML' });
    await this.prepareAssessment(userId, chatId, vacancy);
    return true;
  }

  // --- steps ---

  private vacancyFilter(session: { companyId: number }) {
    return { companyId: session.companyId, status: 'ACTIVE' as const, company: { isActive: true } };
  }

  /** After consent: list the company's open vacancies (one is picked automatically, none keeps the contact details). */
  private async offerVacancies(query: TelegramCallbackQuery, session: SessionRow) {
    const userId = String(query.from.id);
    const chatId = query.message?.chat.id ?? query.from.id;
    const vacancies = await this.db.vacancy.findMany({
      where: this.vacancyFilter(session),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_VACANCY_BUTTONS,
      select: { id: true, title: true },
    });
    const single = vacancies.length === 1 ? vacancies[0] : null;
    if (single && (await this.alreadyApplied(session.companyId, single.id, userId))) {
      await this.cancel(userId);
      await this.telegram.answerCallbackQuery(query.id);
      await this.telegram.sendMessage(chatId, `«${single.title}» vakansiyasiga arizangiz allaqachon qabul qilingan.`);
      return;
    }
    const claimed = await this.db.telegramJoinSession.updateMany({
      where: { telegramUserId: userId, step: 'PRIVACY' },
      data: {
        step: vacancies.length > 1 ? 'VACANCY' : 'NAME',
        privacyAcceptedAt: new Date(),
        aiConsentAt: new Date(),
        vacancyId: single?.id ?? null,
      },
    });
    if (!claimed.count) {
      await this.telegram.answerCallbackQuery(query.id, 'Bu bosqich allaqachon yakunlangan.');
      return;
    }
    await this.telegram.answerCallbackQuery(query.id);

    if (vacancies.length > 1) {
      await this.telegram.sendMessage(chatId, 'Qaysi vakansiyaga ariza topshirmoqchisiz?', {
        replyMarkup: { inline_keyboard: vacancies.map((vacancy) => [{ text: vacancy.title.slice(0, 60), callback_data: `join:vac:${vacancy.id}` }]) },
      });
      return;
    }
    await this.telegram.sendMessage(
      chatId,
      single
        ? `Vakansiya: «${single.title}».\n\nIsm va familiyangizni yozing (masalan: Aziz Karimov):`
        : 'Hozircha ochiq vakansiya yo‘q, lekin ma’lumotlaringizni qoldirishingiz mumkin: yangi vakansiya ochilsa HR siz bilan bog‘lanadi.\n\nIsm va familiyangizni yozing (masalan: Aziz Karimov):',
    );
  }

  private async chooseVacancy(query: TelegramCallbackQuery, session: SessionRow, vacancyId: number) {
    const userId = String(query.from.id);
    const chatId = query.message?.chat.id ?? query.from.id;
    const vacancy = await this.db.vacancy.findFirst({
      where: { id: vacancyId, ...this.vacancyFilter(session) },
      select: { id: true, title: true },
    });
    if (!vacancy) {
      await this.telegram.answerCallbackQuery(query.id, 'Bu vakansiya endi mavjud emas.', true);
      return;
    }
    if (await this.alreadyApplied(session.companyId, vacancy.id, userId)) {
      await this.cancel(userId);
      await this.telegram.answerCallbackQuery(query.id);
      await this.telegram.sendMessage(chatId, `«${vacancy.title}» vakansiyasiga arizangiz allaqachon qabul qilingan.`);
      return;
    }
    const claimed = await this.db.telegramJoinSession.updateMany({
      where: { telegramUserId: userId, step: 'VACANCY' },
      data: { step: 'NAME', vacancyId: vacancy.id },
    });
    if (!claimed.count) {
      await this.telegram.answerCallbackQuery(query.id, 'Bu bosqich allaqachon yakunlangan.');
      return;
    }
    await this.telegram.answerCallbackQuery(query.id);
    await this.telegram.sendMessage(chatId, `Vakansiya: «${vacancy.title}».\n\nIsm va familiyangizni yozing (masalan: Aziz Karimov):`);
  }

  private async savePhone(userId: string, chatId: number, phone: string) {
    const claimed = await this.db.telegramJoinSession.updateMany({
      where: { telegramUserId: userId, step: 'PHONE' },
      data: { step: 'DOCUMENT', phone },
    });
    if (!claimed.count) return;
    await this.telegram.sendMessage(
      chatId,
      `✅ Telefon raqamingiz saqlandi: <b>${escapeHtml(phone)}</b>\n\nEndi rezyumeyingizni (CV) <b>PDF</b> yoki <b>DOCX</b> formatidagi fayl sifatida yuboring (10 MB gacha).`,
      { parseMode: 'HTML', replyMarkup: { remove_keyboard: true } },
    );
  }

  private async askPhone(chatId: number, fullName: string) {
    await this.telegram.sendMessage(
      chatId,
      `Rahmat, ${escapeHtml(fullName)}!\n\nTelefon raqamingizni yuboring: «Raqamni ulashish» tugmasini bosing yoki raqamni yozing (masalan: <code>+998901234567</code>).`,
      {
        parseMode: 'HTML',
        replyMarkup: {
          keyboard: [[{ text: 'Raqamni ulashish', request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      },
    );
  }

  private async prepareAssessment(
    userId: string,
    chatId: number,
    vacancy: { id: number; companyId: number; title: string; description: string; revision: number; assessmentQuestions: unknown; assessmentRevision: number | null; requirements: { name: string }[] },
  ) {
    let assessment;
    try {
      assessment = await this.apply.getAssessment(vacancy);
    } catch (error) {
      this.logger.warn(`Assessment unavailable for vacancy ${vacancy.id}: ${(error as Error).message}`);
    }
    if (!assessment) {
      await this.cancel(userId);
      await this.telegram.sendMessage(chatId, 'Hozir test savollarini tayyorlab bo‘lmadi. Arizangiz HR tomonidan qo‘lda ko‘rib chiqiladi.');
      return;
    }
    const stored = await this.db.telegramJoinSession.updateMany({
      where: { telegramUserId: userId, step: 'ASSESSMENT' },
      data: { assessmentQuestions: assessment as unknown as Prisma.InputJsonValue, assessmentRevision: vacancy.revision, currentQuestionIndex: 0, answers: [] },
    });
    if (!stored.count) return;
    await this.telegram.sendMessage(
      chatId,
      `📋 <b>Lavozimga mos test (10 ta savol)</b>\n\n• 5 ta Hard skill va 5 ta Soft skill savoli\n🎯 O‘tish bali: 70% (kamida 7 ta to‘g‘ri javob).\nNatijadan qat’i nazar, arizangiz qabul qilingan.`,
      { parseMode: 'HTML', replyMarkup: { inline_keyboard: [[{ text: '▶️ Testni boshlash', callback_data: 'join:quizstart' }]] } },
    );
  }

  private async answer(query: TelegramCallbackQuery, session: SessionRow, questionId: number, choice: number) {
    const userId = String(query.from.id);
    const chatId = query.message?.chat.id ?? query.from.id;
    if (session.step !== 'ASSESSMENT') {
      await this.telegram.answerCallbackQuery(query.id, 'Test yakunlangan.');
      return;
    }
    const assessment = vacancyAssessmentSchema.safeParse(session.assessmentQuestions);
    if (!assessment.success) {
      await this.telegram.answerCallbackQuery(query.id, 'Test hali tayyor emas.', true);
      return;
    }
    const questions = assessment.data.questions;
    const previous = (session.answers as Array<{ questionId: number; selectedIndex: number }> | null) ?? [];
    if (session.currentQuestionIndex !== previous.length || questions[session.currentQuestionIndex]?.id !== questionId || choice < 0 || choice > 3) {
      await this.telegram.answerCallbackQuery(query.id, 'Bu savolga allaqachon javob berdingiz.');
      return;
    }
    const answers = [...previous, { questionId, selectedIndex: choice }];

    if (answers.length < questions.length) {
      const claimed = await this.db.telegramJoinSession.updateMany({
        where: { telegramUserId: userId, step: 'ASSESSMENT', currentQuestionIndex: session.currentQuestionIndex },
        data: { currentQuestionIndex: answers.length, answers: answers as unknown as Prisma.InputJsonValue },
      });
      if (!claimed.count) {
        await this.telegram.answerCallbackQuery(query.id, 'Javob allaqachon qabul qilingan.');
        return;
      }
      await this.telegram.answerCallbackQuery(query.id, 'Javob qabul qilindi');
      await this.sendQuestion(chatId, questions, answers.length);
      return;
    }

    // The last answer ends the session; deleting it is the atomic claim.
    const finished = await this.db.telegramJoinSession.deleteMany({
      where: { telegramUserId: userId, step: 'ASSESSMENT', currentQuestionIndex: session.currentQuestionIndex },
    });
    if (!finished.count) {
      await this.telegram.answerCallbackQuery(query.id, 'Javob allaqachon qabul qilingan.');
      return;
    }
    await this.telegram.answerCallbackQuery(query.id, 'Javob qabul qilindi');
    await this.finish(session, questions, answers, chatId);
  }

  private async finish(
    session: SessionRow,
    questions: AssessmentQuestion[],
    answers: Array<{ questionId: number; selectedIndex: number }>,
    chatId: number,
  ) {
    const result = calculateAssessmentScore(questions, answers);
    if (session.applicationId) {
      await this.db.application.updateMany({
        where: { id: session.applicationId, companyId: session.companyId },
        data: { assessmentScore: result.score, assessmentResult: result as unknown as Prisma.InputJsonValue },
      });
      if (result.passed) await this.queueAlerts(session.companyId, session.applicationId);
    }
    void this.alerts?.dispatch();
    await this.telegram.sendMessage(
      chatId,
      `📊 <b>Test natijangiz: ${result.score}%</b> (${result.correctCount}/${questions.length})\n• Hard skills: ${result.hardSkillScore}%\n• Soft skills: ${result.softSkillScore}%\n\n✅ Arizangiz qabul qilindi. HR mutaxassislari uni ko‘rib chiqadi.`,
      { parseMode: 'HTML' },
    );
  }

  /** Same recipients as the vacancy-link flow: enabled admin, HR and recruiter chats. */
  private async queueAlerts(companyId: number, applicationId: number) {
    const connections = await this.db.telegramBusinessConnection.findMany({
      where: { companyId, enabled: true, screeningAlertsEnabled: true, user: { companyId, isActive: true, role: { in: ['ADMIN', 'HR', 'RECRUITER'] } } },
      select: { userChatId: true, telegramUserId: true },
    });
    const chatIds = [...new Set(connections.map((conn) => String(conn.userChatId || conn.telegramUserId)).filter((id) => id !== '0'))];
    if (chatIds.length) {
      await this.db.telegramScreeningAlert.createMany({
        data: chatIds.map((chatId) => ({ companyId, applicationId, chatId })),
        skipDuplicates: true,
      });
    }
  }

  private async sendQuestion(chatId: number, questions: AssessmentQuestion[], index: number) {
    const q = questions[index];
    if (!q) return;
    const badge = q.type === 'HARD_SKILL' ? '💡 Hard Skill' : '🤝 Soft Skill';
    const text =
      `❓ <b>Savol ${index + 1}/${questions.length}</b> [${badge}]\n\n${escapeHtml(q.question)}\n\n` +
      `<b>A)</b> ${escapeHtml(q.options[0])}\n<b>B)</b> ${escapeHtml(q.options[1])}\n<b>C)</b> ${escapeHtml(q.options[2])}\n<b>D)</b> ${escapeHtml(q.options[3])}`;
    await this.telegram.sendMessage(chatId, text, {
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: 'A', callback_data: `join:q:${q.id}:0` }, { text: 'B', callback_data: `join:q:${q.id}:1` }],
          [{ text: 'C', callback_data: `join:q:${q.id}:2` }, { text: 'D', callback_data: `join:q:${q.id}:3` }],
        ],
      },
    });
  }

  private async alreadyApplied(companyId: number, vacancyId: number, userId: string) {
    const candidate = await this.db.candidate.findUnique({
      where: { companyId_telegramUserId: { companyId, telegramUserId: userId } },
      select: { id: true },
    });
    if (!candidate) return false;
    return Boolean(await this.db.application.findUnique({ where: { vacancyId_candidateId: { vacancyId, candidateId: candidate.id } }, select: { id: true } }));
  }

  private expiry() {
    return new Date(Date.now() + SESSION_TTL_MS);
  }

  private async activeSession(userId: string) {
    const session = await this.db.telegramJoinSession.findUnique({ where: { telegramUserId: userId } });
    if (!session) return null;
    if (session.expiresAt < new Date()) {
      await this.db.telegramJoinSession.deleteMany({ where: { telegramUserId: userId } });
      return null;
    }
    return session;
  }
}

type SessionRow = NonNullable<Awaited<ReturnType<TelegramJoinService['activeSession']>>>;
