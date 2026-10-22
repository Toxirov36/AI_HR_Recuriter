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
import { TelegramLanguageService } from './telegram-language.service';
import { botText, DEFAULT_BOT_LANG, matchesAnyLang, type BotMessageKey } from './telegram-i18n';
import { mainMenuKeyboard } from './telegram-menu';
import type { TelegramCallbackQuery, TelegramDirectMessage } from './types/telegram.types';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CV_BYTES = 10 * 1024 * 1024;
const MAX_VACANCY_BUTTONS = 10;
type Tr = (key: BotMessageKey, params?: Record<string, string | number>) => string;
/** Steps before the CV is submitted: the candidate can still leave without leaving a trace. */
const CANCELLABLE_STEPS = ['PRIVACY', 'FIELD', 'VACANCY', 'NAME', 'PHONE', 'DOCUMENT'];
const navButtons = (tr: Tr, back?: string) => [...(back ? [{ text: tr('btnBack'), callback_data: back }] : []), { text: tr('btnCancel'), callback_data: 'join:cancel' }];
const navKeyboard = (tr: Tr, ...rows: Array<Array<{ text: string; request_contact?: boolean }>>) => ({
  keyboard: [...rows, [{ text: tr('btnBack') }, { text: tr('btnCancel') }]],
  resize_keyboard: true,
});
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
    @Optional() @Inject(TelegramLanguageService) private languages?: TelegramLanguageService,
  ) {}

  /** Translator for the user's chosen bot language (Uzbek when none is stored). */
  private async tr(userId: string): Promise<Tr> {
    const lang = (await this.languages?.get(userId)) ?? DEFAULT_BOT_LANG;
    return (key, params) => botText(lang, key, params);
  }

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
    const tr = await this.tr(userId);

    const company = await this.db.company.findFirst({
      where: { publicToken: token, isActive: true },
      select: { id: true, name: true, retentionDays: true },
    });
    if (!company) {
      await this.telegram.sendMessage(message.chat.id, tr('joinInvalidLink'));
      return;
    }
    await this.languages?.setCompany(userId, company.id);
    await this.begin(message, company, null, tr);
  }

  /** Starts the application for one vacancy picked from the bot menu (Sohalar). */
  async startVacancy(message: TelegramDirectMessage, companyId: number, vacancyId: number) {
    if (!message.from || message.chat.type !== 'private') return;
    const userId = String(message.from.id);
    const tr = await this.tr(userId);
    const vacancy = await this.db.vacancy.findFirst({
      where: { id: vacancyId, companyId, status: 'ACTIVE', company: { isActive: true } },
      select: { id: true, title: true, fieldId: true, field: { select: { name: true } }, company: { select: { id: true, name: true, retentionDays: true } } },
    });
    if (!vacancy) {
      await this.telegram.sendMessage(message.chat.id, tr('vacancyGone'));
      return;
    }
    const blocked = await this.blockedReason(companyId, vacancy, userId);
    if (blocked) {
      await this.telegram.sendMessage(message.chat.id, this.blockedText(blocked, vacancy, tr), { replyMarkup: { inline_keyboard: [[{ text: tr('myAppsButton'), callback_data: 'my:apps' }]] } });
      return;
    }
    await this.begin(message, vacancy.company, vacancy.id, tr);
  }

  private async begin(message: TelegramDirectMessage, company: { id: number; name: string; retentionDays: number }, presetVacancyId: number | null, tr: Tr) {
    const userId = String(message.from!.id);
    if (this.storage && !this.storage.enabled) {
      await this.telegram.sendMessage(message.chat.id, tr('joinStorageOff'));
      return;
    }

    await this.db.telegramApplySession.deleteMany({ where: { telegramUserId: userId } });
    await this.db.telegramJoinSession.upsert({
      where: { telegramUserId: userId },
      create: { telegramUserId: userId, companyId: company.id, step: 'PRIVACY', vacancyId: presetVacancyId, answers: [], expiresAt: this.expiry() },
      update: {
        companyId: company.id,
        step: 'PRIVACY',
        vacancyId: presetVacancyId,
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
      tr('joinConsent', { company: company.name, days: company.retentionDays }),
      {
        replyMarkup: {
          inline_keyboard: [[
            { text: tr('agree'), callback_data: 'join:privacy:yes' },
            { text: tr('decline'), callback_data: 'join:privacy:no' },
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
    const tr = await this.tr(userId);

    const session = await this.activeSession(userId);
    if (!session) {
      await this.telegram.answerCallbackQuery(query.id, tr('joinSessionExpired'), true);
      return true;
    }
    const stale = () => this.telegram.answerCallbackQuery(query.id, tr('stepDone'));

    if (data === 'join:cancel') {
      await this.telegram.answerCallbackQuery(query.id);
      await this.cancelFlow(chatId, userId, session.step, tr);
      return true;
    }

    if (data === 'join:back:vacancy') {
      const reset = await this.db.telegramJoinSession.updateMany({
        where: { telegramUserId: userId, step: 'NAME' },
        data: { step: 'VACANCY', vacancyId: null },
      });
      if (!reset.count) {
        await stale();
        return true;
      }
      await this.telegram.answerCallbackQuery(query.id);
      await this.sendVacancyList(chatId, session.companyId, userId, tr);
      return true;
    }

    if (data === 'join:privacy:no') {
      const removed = await this.db.telegramJoinSession.deleteMany({ where: { telegramUserId: userId, step: 'PRIVACY' } });
      if (!removed.count) {
        await stale();
        return true;
      }
      await this.telegram.answerCallbackQuery(query.id, tr('applyCancelled'));
      await this.telegram.sendMessage(chatId, tr('noConsent'));
      return true;
    }

    if (data === 'join:privacy:yes') {
      await this.offerVacancies(query, session, tr);
      return true;
    }

    const vacancyMatch = data.match(/^join:vac:(\d+)$/);
    if (vacancyMatch) {
      if (session.step !== 'VACANCY') {
        await stale();
        return true;
      }
      await this.chooseVacancy(query, session, Number(vacancyMatch[1]), tr);
      return true;
    }

    if (data === 'join:quizstart') {
      if (session.step !== 'ASSESSMENT') {
        await this.telegram.answerCallbackQuery(query.id, tr('quizInactive'));
        return true;
      }
      const assessment = vacancyAssessmentSchema.safeParse(session.assessmentQuestions);
      if (!assessment.success) {
        await this.telegram.answerCallbackQuery(query.id, tr('quizNotReadyLater'), true);
        return true;
      }
      await this.telegram.answerCallbackQuery(query.id, tr('quizStarted'));
      await this.sendQuestion(chatId, assessment.data.questions, session.currentQuestionIndex, tr);
      return true;
    }

    const answerMatch = data.match(/^join:q:(\d+):(\d+)$/);
    if (answerMatch) {
      await this.answer(query, session, Number(answerMatch[1]), Number(answerMatch[2]), tr);
      return true;
    }

    await this.telegram.answerCallbackQuery(query.id, tr('buttonStale'), true);
    return true;
  }

  async handleText(message: TelegramDirectMessage): Promise<boolean> {
    if (!message.from || message.chat.type !== 'private' || !message.text) return false;
    const session = await this.activeSession(String(message.from.id));
    if (!session) return false;
    const chatId = message.chat.id;
    const userId = String(message.from.id);
    const text = message.text.trim();
    const tr = await this.tr(userId);

    if (matchesAnyLang(text, 'btnCancel') || /^\/cancel(@\w+)?$/i.test(text)) {
      await this.cancelFlow(chatId, userId, session.step, tr);
      return true;
    }
    if (matchesAnyLang(text, 'btnBack') && session.step === 'PHONE') {
      const reset = await this.db.telegramJoinSession.updateMany({ where: { telegramUserId: userId, step: 'PHONE' }, data: { step: 'NAME', fullName: null } });
      if (reset.count) await this.telegram.sendMessage(chatId, `${tr('namePrompt')}\n\n${tr('cancelHint')}`, { replyMarkup: { remove_keyboard: true } });
      return true;
    }
    if (matchesAnyLang(text, 'btnBack') && session.step === 'DOCUMENT') {
      const reset = await this.db.telegramJoinSession.updateMany({ where: { telegramUserId: userId, step: 'DOCUMENT' }, data: { step: 'PHONE', phone: null } });
      if (reset.count) await this.askPhone(chatId, session.fullName ?? '', tr);
      return true;
    }

    switch (session.step) {
      case 'NAME': {
        const fullName = parseFullName(message.text);
        if (!fullName) {
          await this.telegram.sendMessage(chatId, tr('nameInvalid'));
          return true;
        }
        const claimed = await this.db.telegramJoinSession.updateMany({
          where: { telegramUserId: userId, step: 'NAME' },
          data: { step: 'PHONE', fullName },
        });
        if (claimed.count) await this.askPhone(chatId, fullName, tr);
        return true;
      }
      case 'PHONE': {
        const phone = parsePhone(message.text);
        if (!phone) {
          await this.telegram.sendMessage(
            chatId,
            tr('phoneInvalidJoin'),
            { parseMode: 'HTML' },
          );
          return true;
        }
        await this.savePhone(userId, chatId, phone, tr);
        return true;
      }
      case 'ASSESSMENT':
        await this.telegram.sendMessage(chatId, tr('useQuizButtons'));
        return true;
      case 'DOCUMENT':
        await this.telegram.sendMessage(chatId, tr('sendCv'), { parseMode: 'HTML' });
        return true;
      default:
        await this.telegram.sendMessage(chatId, tr('pickButton'));
        return true;
    }
  }

  async handleContact(message: TelegramDirectMessage): Promise<boolean> {
    if (!message.from || message.chat.type !== 'private' || !message.contact) return false;
    const session = await this.activeSession(String(message.from.id));
    if (!session) return false;
    if (session.step !== 'PHONE') return false;
    const tr = await this.tr(String(message.from.id));
    const phone = parsePhone(message.contact.phone_number, true);
    if (!phone) {
      await this.telegram.sendMessage(message.chat.id, tr('contactInvalid'));
      return true;
    }
    await this.savePhone(String(message.from.id), message.chat.id, phone, tr);
    return true;
  }

  async handleDocument(message: TelegramDirectMessage): Promise<boolean> {
    if (!message.from || !message.document || message.chat.type !== 'private') return false;
    const userId = String(message.from.id);
    const session = await this.activeSession(userId);
    if (!session) return false;
    const chatId = message.chat.id;
    const tr = await this.tr(userId);

    if (session.step !== 'DOCUMENT' || !session.privacyAcceptedAt || !session.fullName) {
      await this.telegram.sendMessage(chatId, tr('cvPrecondition'));
      return true;
    }

    const document = message.document;
    const fileName = document.file_name?.trim().slice(0, 180) ?? '';
    const mime = document.mime_type?.toLowerCase() ?? '';
    if (!/\.(pdf|docx)$/i.test(fileName) || !CV_MIME_TYPES.includes(mime) || (document.file_size ?? 0) > MAX_CV_BYTES) {
      await this.telegram.sendMessage(chatId, tr('cvInvalid'));
      return true;
    }
    await this.security.limit(`telegram-join:${userId}`, 5, 3600);

    const vacancy = session.vacancyId
      ? await this.db.vacancy.findFirst({
          where: { id: session.vacancyId, companyId: session.companyId, status: 'ACTIVE', company: { isActive: true } },
          include: { requirements: { select: { name: true } }, field: { select: { name: true } } },
        })
      : null;
    if (session.vacancyId && !vacancy) {
      await this.cancel(userId);
      await this.telegram.sendMessage(chatId, tr('vacancyStopped'));
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
          if (vacancy.fieldId != null) {
            const sameField = await tx.application.findFirst({
              where: { companyId: session.companyId, candidateId: candidate.id, vacancyId: { not: vacancy.id }, vacancy: { fieldId: vacancy.fieldId } },
              select: { id: true },
            });
            if (sameField) throw new Error('FIELD_ALREADY_APPLIED');
          }
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
        await this.telegram.sendMessage(chatId, tr('alreadySubmitted'));
        return true;
      }
      if ((error as Error).message === 'FIELD_ALREADY_APPLIED') {
        await this.telegram.sendMessage(chatId, this.blockedText('field', vacancy!, tr), { replyMarkup: { inline_keyboard: [[{ text: tr('myAppsButton'), callback_data: 'my:apps' }]] } });
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
        tr('noVacancyDone'),
        { parseMode: 'HTML' },
      );
      return true;
    }

    await this.telegram.sendMessage(chatId, tr('cvAcceptedQuiz'), { parseMode: 'HTML', replyMarkup: mainMenuKeyboard(tr) });
    await this.prepareAssessment(userId, chatId, vacancy, tr);
    return true;
  }

  // --- steps ---

  private vacancyFilter(session: { companyId: number }) {
    return { companyId: session.companyId, status: 'ACTIVE' as const, company: { isActive: true } };
  }

  /** After consent: list the company's open vacancies (one is picked automatically, none keeps the contact details). */
  private async offerVacancies(query: TelegramCallbackQuery, session: SessionRow, tr: Tr) {
    const userId = String(query.from.id);
    const chatId = query.message?.chat.id ?? query.from.id;
    const vacancies = await this.db.vacancy.findMany({
      where: { ...this.vacancyFilter(session), ...(session.vacancyId ? { id: session.vacancyId } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_VACANCY_BUTTONS,
      select: { id: true, title: true, fieldId: true, field: { select: { name: true } } },
    });
    const available = [];
    let firstBlock: ReturnType<TelegramJoinService['blockedText']> | null = null;
    for (const vacancy of vacancies) {
      const reason = await this.blockedReason(session.companyId, vacancy, userId);
      if (!reason) available.push(vacancy);
      else firstBlock ??= this.blockedText(reason, vacancy, tr);
    }
    if (vacancies.length && !available.length) {
      await this.cancel(userId);
      await this.telegram.answerCallbackQuery(query.id);
      await this.telegram.sendMessage(chatId, vacancies.length === 1 ? firstBlock! : tr('alreadyAppliedAll'), { replyMarkup: { inline_keyboard: [[{ text: tr('myAppsButton'), callback_data: 'my:apps' }]] } });
      return;
    }
    const single = available.length === 1 ? available[0] : null;
    const claimed = await this.db.telegramJoinSession.updateMany({
      where: { telegramUserId: userId, step: 'PRIVACY' },
      data: {
        step: available.length > 1 ? 'VACANCY' : 'NAME',
        privacyAcceptedAt: new Date(),
        aiConsentAt: new Date(),
        vacancyId: single?.id ?? null,
      },
    });
    if (!claimed.count) {
      await this.telegram.answerCallbackQuery(query.id, tr('stepDone'));
      return;
    }
    await this.telegram.answerCallbackQuery(query.id);

    if (available.length > 1) {
      await this.sendVacancyChoices(chatId, available, tr);
      return;
    }
    await this.telegram.sendMessage(
      chatId,
      single
        ? tr('vacancyIntro', { title: single.title, prompt: tr('namePrompt') })
        : tr('noOpenVacancy', { prompt: tr('namePrompt') }),
      { replyMarkup: { inline_keyboard: [navButtons(tr)] } },
    );
  }

  private async sendVacancyChoices(chatId: number, vacancies: Array<{ id: number; title: string }>, tr: Tr) {
    await this.telegram.sendMessage(chatId, tr('whichVacancy'), {
      replyMarkup: {
        inline_keyboard: [...vacancies.map((vacancy) => [{ text: vacancy.title.slice(0, 60), callback_data: `join:vac:${vacancy.id}` }]), navButtons(tr)],
      },
    });
  }

  private async sendVacancyList(chatId: number, companyId: number, userId: string, tr: Tr) {
    const vacancies = await this.db.vacancy.findMany({
      where: this.vacancyFilter({ companyId }),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_VACANCY_BUTTONS,
      select: { id: true, title: true, fieldId: true },
    });
    const available = [];
    for (const vacancy of vacancies) if (!(await this.blockedReason(companyId, vacancy, userId))) available.push(vacancy);
    await this.sendVacancyChoices(chatId, available, tr);
  }

  /** Drops an unfinished application on the candidate's request; nothing is saved before the CV is submitted. */
  private async cancelFlow(chatId: number, userId: string, step: string, tr: Tr) {
    if (!CANCELLABLE_STEPS.includes(step)) {
      await this.telegram.sendMessage(chatId, tr('cannotCancel'));
      return;
    }
    await this.db.telegramJoinSession.deleteMany({ where: { telegramUserId: userId, step: { in: CANCELLABLE_STEPS as never } } });
    await this.telegram.sendMessage(chatId, tr('cancelledFull'), { replyMarkup: mainMenuKeyboard(tr) });
  }

  private async chooseVacancy(query: TelegramCallbackQuery, session: SessionRow, vacancyId: number, tr: Tr) {
    const userId = String(query.from.id);
    const chatId = query.message?.chat.id ?? query.from.id;
    const vacancy = await this.db.vacancy.findFirst({
      where: { id: vacancyId, ...this.vacancyFilter(session) },
      select: { id: true, title: true, fieldId: true, field: { select: { name: true } } },
    });
    if (!vacancy) {
      await this.telegram.answerCallbackQuery(query.id, tr('vacancyGone'), true);
      return;
    }
    const blocked = await this.blockedReason(session.companyId, vacancy, userId);
    if (blocked) {
      await this.cancel(userId);
      await this.telegram.answerCallbackQuery(query.id);
      await this.telegram.sendMessage(chatId, this.blockedText(blocked, vacancy, tr), { replyMarkup: { inline_keyboard: [[{ text: tr('myAppsButton'), callback_data: 'my:apps' }]] } });
      return;
    }
    const claimed = await this.db.telegramJoinSession.updateMany({
      where: { telegramUserId: userId, step: 'VACANCY' },
      data: { step: 'NAME', vacancyId: vacancy.id },
    });
    if (!claimed.count) {
      await this.telegram.answerCallbackQuery(query.id, tr('stepDone'));
      return;
    }
    await this.telegram.answerCallbackQuery(query.id);
    await this.telegram.sendMessage(chatId, tr('vacancyIntro', { title: vacancy.title, prompt: tr('namePrompt') }), {
      replyMarkup: { inline_keyboard: [navButtons(tr, 'join:back:vacancy')] },
    });
  }

  private async savePhone(userId: string, chatId: number, phone: string, tr: Tr) {
    const claimed = await this.db.telegramJoinSession.updateMany({
      where: { telegramUserId: userId, step: 'PHONE' },
      data: { step: 'DOCUMENT', phone },
    });
    if (!claimed.count) return;
    await this.telegram.sendMessage(
      chatId,
      tr('joinPhoneSaved', { phone: escapeHtml(phone) }),
      { parseMode: 'HTML', replyMarkup: navKeyboard(tr) },
    );
  }

  private async askPhone(chatId: number, fullName: string, tr: Tr) {
    await this.telegram.sendMessage(
      chatId,
      tr('askPhone', { name: escapeHtml(fullName) }),
      { parseMode: 'HTML', replyMarkup: navKeyboard(tr, [{ text: tr('shareNumber'), request_contact: true }]) },
    );
  }

  private async prepareAssessment(
    userId: string,
    chatId: number,
    vacancy: { id: number; revision: number; assessmentQuestions: unknown; assessmentRevision: number | null; assessmentApprovedAt: Date | null },
    tr: Tr,
  ) {
    let assessment;
    try {
      assessment = await this.apply.getAssessment(vacancy);
    } catch (error) {
      this.logger.warn(`Assessment unavailable for vacancy ${vacancy.id}: ${(error as Error).message}`);
    }
    if (!assessment) {
      await this.cancel(userId);
      await this.telegram.sendMessage(chatId, tr('joinNoApprovedTest'));
      return;
    }
    const stored = await this.db.telegramJoinSession.updateMany({
      where: { telegramUserId: userId, step: 'ASSESSMENT' },
      data: { assessmentQuestions: assessment as unknown as Prisma.InputJsonValue, assessmentRevision: vacancy.revision, currentQuestionIndex: 0, answers: [] },
    });
    if (!stored.count) return;
    await this.telegram.sendMessage(
      chatId,
      tr('quizIntroJoin'),
      { parseMode: 'HTML', replyMarkup: { inline_keyboard: [[{ text: tr('startQuiz'), callback_data: 'join:quizstart' }]] } },
    );
  }

  private async answer(query: TelegramCallbackQuery, session: SessionRow, questionId: number, choice: number, tr: Tr) {
    const userId = String(query.from.id);
    const chatId = query.message?.chat.id ?? query.from.id;
    if (session.step !== 'ASSESSMENT') {
      await this.telegram.answerCallbackQuery(query.id, tr('quizFinished'));
      return;
    }
    const assessment = vacancyAssessmentSchema.safeParse(session.assessmentQuestions);
    if (!assessment.success) {
      await this.telegram.answerCallbackQuery(query.id, tr('quizNotReady'), true);
      return;
    }
    const questions = assessment.data.questions;
    const previous = (session.answers as Array<{ questionId: number; selectedIndex: number }> | null) ?? [];
    if (session.currentQuestionIndex !== previous.length || questions[session.currentQuestionIndex]?.id !== questionId || choice < 0 || choice > 3) {
      await this.telegram.answerCallbackQuery(query.id, tr('alreadyAnswered'));
      return;
    }
    const answers = [...previous, { questionId, selectedIndex: choice }];

    if (answers.length < questions.length) {
      const claimed = await this.db.telegramJoinSession.updateMany({
        where: { telegramUserId: userId, step: 'ASSESSMENT', currentQuestionIndex: session.currentQuestionIndex },
        data: { currentQuestionIndex: answers.length, answers: answers as unknown as Prisma.InputJsonValue },
      });
      if (!claimed.count) {
        await this.telegram.answerCallbackQuery(query.id, tr('answerClaimed'));
        return;
      }
      await this.telegram.answerCallbackQuery(query.id, tr('answerAccepted'));
      await this.sendQuestion(chatId, questions, answers.length, tr);
      return;
    }

    // The last answer ends the session; deleting it is the atomic claim.
    const finished = await this.db.telegramJoinSession.deleteMany({
      where: { telegramUserId: userId, step: 'ASSESSMENT', currentQuestionIndex: session.currentQuestionIndex },
    });
    if (!finished.count) {
      await this.telegram.answerCallbackQuery(query.id, tr('answerClaimed'));
      return;
    }
    await this.telegram.answerCallbackQuery(query.id, tr('answerAccepted'));
    await this.finish(session, questions, answers, chatId, tr);
  }

  private async finish(
    session: SessionRow,
    questions: AssessmentQuestion[],
    answers: Array<{ questionId: number; selectedIndex: number }>,
    chatId: number,
    tr: Tr,
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
      tr('joinFinish', { score: result.score, correct: result.correctCount, total: questions.length, hard: result.hardSkillScore, soft: result.softSkillScore }),
      { parseMode: 'HTML', replyMarkup: { inline_keyboard: [[{ text: tr('myAppsButton'), callback_data: 'my:apps' }]] } },
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

  private async sendQuestion(chatId: number, questions: AssessmentQuestion[], index: number, tr: Tr) {
    const q = questions[index];
    if (!q) return;
    const badge = q.type === 'HARD_SKILL' ? '💡 Hard Skill' : '🤝 Soft Skill';
    const text =
      `${tr('question', { n: index + 1, total: questions.length, badge })}\n\n${escapeHtml(q.question)}\n\n` +
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

  /** One application per vacancy, and one per hiring field of a company (vacancies without a field only per vacancy). */
  private async blockedReason(companyId: number, vacancy: { id: number; fieldId?: number | null }, userId: string): Promise<'vacancy' | 'field' | null> {
    if (await this.alreadyApplied(companyId, vacancy.id, userId)) return 'vacancy';
    if (vacancy.fieldId == null) return null;
    const candidate = await this.db.candidate.findUnique({ where: { companyId_telegramUserId: { companyId, telegramUserId: userId } }, select: { id: true } });
    if (!candidate) return null;
    const found = await this.db.application.findFirst({ where: { companyId, candidateId: candidate.id, vacancy: { fieldId: vacancy.fieldId } }, select: { id: true } });
    return found ? 'field' : null;
  }

  private blockedText(reason: 'vacancy' | 'field', vacancy: { title: string; field?: { name: string } | null }, tr: Tr) {
    return reason === 'field' ? tr('alreadyAppliedField', { field: vacancy.field?.name ?? vacancy.title }) : tr('alreadyAppliedTitle', { title: vacancy.title });
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
