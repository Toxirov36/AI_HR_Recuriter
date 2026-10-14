import { describe, expect, it, vi } from 'vitest';
import { TelegramApplyService } from './telegram-apply.service';
import { getDefaultAssessmentForVacancy } from '../ai/utils/assessment-helper';

const assessment = getDefaultAssessmentForVacancy('Backend Developer');
const vacancy = { id: 5, companyId: 3, title: 'Backend Developer', description: 'NestJS', revision: 1, status: 'ACTIVE', requirements: [{ name: 'NestJS' }] };
const callback = (data: string) => ({ id: 'cb', from: { id: 42 }, message: { message_id: 1, chat: { id: 42 } }, data });
const answers = (correct: number) => assessment.questions.map((q, i) => ({ questionId: q.id, selectedIndex: i < correct ? q.correctIndex : (q.correctIndex + 1) % 4 }));
const bot = () => ({ answerCallbackQuery: vi.fn(), sendMessage: vi.fn().mockResolvedValue({ ok: true }) });
const security = { config: { GEMINI_API_KEY: 'test', FRONTEND_ORIGIN: 'https://example.test' }, limit: vi.fn() };

describe('Telegram vacancy screening', () => {
  it('requires privacy consent, then freezes AI questions without a separate consent prompt', async () => {
    const db = {
      telegramApplySession: { findUnique: vi.fn().mockResolvedValue({ vacancyId: 5, step: 'PRIVACY', expiresAt: new Date(Date.now() + 60_000), vacancy }), updateMany: vi.fn().mockResolvedValue({ count: 1 }), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      vacancy: { updateMany: vi.fn(), findUnique: vi.fn().mockResolvedValue({ assessmentQuestions: assessment, assessmentRevision: 1 }) },
    };
    const telegram = bot();
    const gemini = { generate: vi.fn().mockResolvedValue(assessment) };
    const service = new TelegramApplyService(db as never, security as never, telegram as never, {} as never, undefined, gemini as never);
    await service.handleCallback(callback('apply:5:privacy:yes'));
    expect(db.telegramApplySession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ step: 'ASSESSMENT', assessmentQuestions: assessment, aiConsentAt: expect.any(Date) }) }));
    expect(telegram.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining('10 ta savol'), expect.any(Object));
    await service.handleCallback(callback('apply:5:privacy:no'));
    expect(db.telegramApplySession.deleteMany).toHaveBeenCalled();
  });

  it('routes AI generation failures to manual review without using generic questions', async () => {
    const db = { telegramApplySession: { findUnique: vi.fn().mockResolvedValue({ vacancyId: 5, step: 'PRIVACY', expiresAt: new Date(Date.now() + 60_000), vacancy }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    const telegram = bot();
    const gemini = { generate: vi.fn().mockRejectedValue(new Error('unavailable')) };
    const service = new TelegramApplyService(db as never, security as never, telegram as never, {} as never, undefined, gemini as never);
    await service.handleCallback(callback('apply:5:privacy:yes'));
    expect(db.telegramApplySession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ step: 'CONTACT_PHONE', assessmentRevision: null }) }));
    expect(telegram.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining('qo‘lda ko‘rib chiqiladi'));
  });

  it.each([7, 6])('keeps a %i/10 applicant in the CV flow', async (correct) => {
    const db = { telegramApplySession: {
      findUnique: vi.fn().mockResolvedValue({ vacancyId: 5, step: 'ASSESSMENT', currentQuestionIndex: 9, answers: answers(correct).slice(0, 9), assessmentQuestions: assessment, assessmentRevision: 1, expiresAt: new Date(Date.now() + 60_000), vacancy: { ...vacancy, revision: 2 } }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }), delete: vi.fn(),
    } };
    const telegram = bot();
    const service = new TelegramApplyService(db as never, security as never, telegram as never, {} as never);
    await service.handleCallback(callback(`apply:5:quiz:10:${answers(correct)[9].selectedIndex}`));
    expect(db.telegramApplySession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ step: 'CONTACT_PHONE', currentQuestionIndex: 10 }) }));
    expect(db.telegramApplySession.delete).not.toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining(`${correct * 10}%`), expect.any(Object));
  });

  it('ignores duplicate or out-of-order answer callbacks', async () => {
    const db = { telegramApplySession: { findUnique: vi.fn().mockResolvedValue({ vacancyId: 5, step: 'ASSESSMENT', currentQuestionIndex: 2, answers: answers(2).slice(0, 2), assessmentQuestions: assessment, expiresAt: new Date(Date.now() + 60_000), vacancy }), updateMany: vi.fn() } };
    const service = new TelegramApplyService(db as never, security as never, bot() as never, {} as never);
    await service.handleCallback(callback('apply:5:quiz:2:1'));
    expect(db.telegramApplySession.updateMany).not.toHaveBeenCalled();
  });

  it('accepts only one answer when two callbacks race for the same question', async () => {
    const db = { telegramApplySession: { findUnique: vi.fn().mockResolvedValue({ vacancyId: 5, step: 'ASSESSMENT', currentQuestionIndex: 0, answers: [], assessmentQuestions: assessment, expiresAt: new Date(Date.now() + 60_000), vacancy }), updateMany: vi.fn().mockResolvedValue({ count: 0 }) } };
    const telegram = bot();
    const service = new TelegramApplyService(db as never, security as never, telegram as never, {} as never);
    await service.handleCallback(callback('apply:5:quiz:1:1'));
    expect(telegram.sendMessage).not.toHaveBeenCalled();
    expect(telegram.answerCallbackQuery).toHaveBeenCalledWith('cb', 'Javob allaqachon qabul qilingan.');
  });

  it.each([[7, true], [6, false], [null, false]] as const)('stores score %s and queues HR alert only on passing score', async (correct, alertExpected) => {
    const tx = {
      candidate: { upsert: vi.fn().mockResolvedValue({ id: 7 }) },
      application: { upsert: vi.fn().mockResolvedValue({ id: 9 }) },
      resume: { create: vi.fn().mockResolvedValue({ id: 11 }) },
      candidateEvent: { create: vi.fn() },
      telegramBusinessConnection: { findMany: vi.fn().mockResolvedValue([{ userChatId: 100n, telegramUserId: 100n }, { userChatId: 100n, telegramUserId: 100n }]) },
      telegramScreeningAlert: { createMany: vi.fn() },
      telegramApplySession: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const db = { telegramApplySession: { findUnique: vi.fn().mockResolvedValue({
      companyId: 3, vacancyId: 5, step: 'DOCUMENT', privacyAcceptedAt: new Date(), aiConsentAt: new Date(), phone: '+998901234567',
      answers: correct === null ? [] : answers(correct), assessmentQuestions: correct === null ? null : assessment,
      expiresAt: new Date(Date.now() + 60_000), vacancy,
    }) }, resume: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() }, $transaction: vi.fn((fn) => fn(tx)) };
    const queue = { add: vi.fn() };
    const alerts = { dispatch: vi.fn() };
    const service = new TelegramApplyService(db as never, security as never, bot() as never, queue as never, undefined, undefined, alerts as never);
    await service.handleDocument({ message_id: 1, from: { id: 42, first_name: 'Ali' }, chat: { id: 42, type: 'private' }, date: 1,
      document: { file_id: 'f1', file_name: 'cv.pdf', mime_type: 'application/pdf', file_size: 123 } });
    expect(tx.application.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ assessmentScore: correct === null ? null : correct * 10 }) }));
    expect(tx.telegramScreeningAlert.createMany).toHaveBeenCalledTimes(alertExpected ? 1 : 0);
    if (alertExpected) expect(tx.telegramScreeningAlert.createMany).toHaveBeenCalledWith({ data: [{ companyId: 3, applicationId: 9, chatId: '100' }], skipDuplicates: true });
    expect(queue.add).toHaveBeenCalled();
  });

  it('does not create a second application or HR alert for a repeated CV update', async () => {
    const tx = { telegramApplySession: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) }, candidate: { upsert: vi.fn() }, telegramScreeningAlert: { createMany: vi.fn() } };
    const db = { telegramApplySession: { findUnique: vi.fn().mockResolvedValue({ companyId: 3, vacancyId: 5, step: 'DOCUMENT', privacyAcceptedAt: new Date(), phone: '+998901234567', answers: answers(7), assessmentQuestions: assessment, expiresAt: new Date(Date.now() + 60_000), vacancy }) }, $transaction: vi.fn((fn) => fn(tx)) };
    const telegram = bot();
    const service = new TelegramApplyService(db as never, security as never, telegram as never, {} as never);
    await service.handleDocument({ message_id: 1, from: { id: 42, first_name: 'Ali' }, chat: { id: 42, type: 'private' }, date: 1, document: { file_id: 'f1', file_name: 'cv.pdf', mime_type: 'application/pdf', file_size: 123 } });
    expect(tx.candidate.upsert).not.toHaveBeenCalled();
    expect(tx.telegramScreeningAlert.createMany).not.toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenCalledWith(42, 'Ushbu ariza avval qabul qilingan.');
  });
});
