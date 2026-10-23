import { describe, expect, it, vi } from 'vitest';
import { approvedInterview } from '../ai/utils/assessment-approval';
import { getDefaultAssessmentForVacancy } from '../ai/utils/assessment-helper';
import type { StoredInterview } from '../ai/schemas/interview.schema';
import { TelegramApplyService } from './telegram-apply.service';
import { TelegramJoinService } from './telegram-join.service';
import { botText } from './telegram-i18n';

const assessment = getDefaultAssessmentForVacancy('SMM manager');
const future = () => new Date(Date.now() + 60_000);
const user = { id: 42, first_name: 'Ali', username: 'ali' };
const chat = { id: 42, type: 'private' as const };
const callback = (data: string) => ({ id: 'cb', from: user, message: { message_id: 1, chat }, data });
const message = (text: string) => ({ message_id: 1, chat, from: user, text }) as never;
const security = { limit: vi.fn(), config: { FRONTEND_ORIGIN: 'https://hrdai.uz' } };
const answersUpTo = (count: number) => assessment.questions.slice(0, count).map((q) => ({ questionId: q.id, selectedIndex: q.correctIndex }));
const lastQuestion = assessment.questions[9];
const stored: StoredInterview = {
  turns: [{ role: 'ai', text: 'Salom!' }, { role: 'candidate', text: 'Men SMM bilan shug‘ullanaman' }],
  evaluation: { score: 80, verdict: 'recommend', reason: 'r', strengths: ['s'], weaknesses: [], risks: [], checkQuestions: [], summary: 'sum' },
  finishedAt: '2026-10-23T10:00:00Z',
};

function joinSetup(session: Record<string, unknown>, passed = true) {
  const sessionRow = { telegramUserId: '42', companyId: 3, vacancyId: 5, applicationId: 9, step: 'ASSESSMENT', currentQuestionIndex: 0, answers: [], assessmentQuestions: assessment, interviewEnabled: true, interviewFocus: 'Reels', expiresAt: future(), ...session };
  const db: any = {
    telegramJoinSession: { findUnique: vi.fn().mockResolvedValue(sessionRow), updateMany: vi.fn().mockResolvedValue({ count: 1 }), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    vacancy: { findFirst: vi.fn().mockResolvedValue({ title: 'SMM Lead', description: 'Desc', requirements: [{ name: 'Instagram' }] }) },
    application: {
      updateMany: vi.fn(),
      findFirst: vi.fn().mockResolvedValue({ assessmentResult: { passed }, assessmentScore: 100 }),
    },
    telegramBusinessConnection: { findMany: vi.fn().mockResolvedValue([{ userChatId: BigInt(77), telegramUserId: BigInt(77) }]) },
    telegramScreeningAlert: { createMany: vi.fn() },
  };
  const telegram = { sendMessage: vi.fn().mockResolvedValue({ ok: true }), answerCallbackQuery: vi.fn() };
  const interviewer = { available: true, start: vi.fn(), handleText: vi.fn(), skip: vi.fn() };
  const alerts = { dispatch: vi.fn() };
  const apply = { summarizeWrittenAnswers: vi.fn() };
  const service = new TelegramJoinService(db, security as never, telegram as never, {} as never, apply as never, { enabled: true } as never, alerts as never, undefined, interviewer as never);
  return { db, telegram, interviewer, alerts, service };
}

describe('AI interview in the company-link flow', () => {
  it('moves to the interview after the last test answer, and waits to alert HR', async () => {
    const { db, interviewer, service } = joinSetup({ currentQuestionIndex: 9, answers: answersUpTo(9) });
    await service.handleCallback(callback(`join:q:${lastQuestion.id}:${lastQuestion.correctIndex}`));
    expect(db.telegramJoinSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ step: 'INTERVIEW', interviewTurns: [], interviewTurn: 0 }) }));
    expect(db.telegramJoinSession.deleteMany).not.toHaveBeenCalled();
    expect(db.application.updateMany).toHaveBeenCalledWith({ where: { id: 9, companyId: 3 }, data: expect.objectContaining({ assessmentScore: 100 }) });
    expect(db.telegramScreeningAlert.createMany).not.toHaveBeenCalled();
    const run = interviewer.start.mock.calls[0][0];
    expect(run).toEqual(expect.objectContaining({ flow: 'join', userId: '42', skipCallback: 'join:ivskip' }));
    expect(run.ctx).toEqual(expect.objectContaining({ vacancyTitle: 'SMM Lead', requirements: ['Instagram'], focus: 'Reels', testSummary: expect.stringContaining('100%') }));
  });

  it('moves to the interview after the last written answer instead of ending the session', async () => {
    const { db, interviewer, service } = joinSetup({ step: 'WRITTEN', customQuestions: ['Nega bizni tanladingiz?'], writtenIndex: 0, writtenAnswers: [] });
    await service.handleText(message('Jamoangiz kuchli.'));
    expect(db.telegramJoinSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ step: 'INTERVIEW', writtenAnswers: ['Jamoangiz kuchli.'] }) }));
    expect(db.telegramJoinSession.deleteMany).not.toHaveBeenCalled();
    expect(db.application.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { writtenAnswers: [{ question: 'Nega bizni tanladingiz?', answer: 'Jamoangiz kuchli.' }] } }));
    expect(interviewer.start).toHaveBeenCalledTimes(1);
    expect(db.telegramScreeningAlert.createMany).not.toHaveBeenCalled();
  });

  it('alerts HR once the written questions end the flow without an interview', async () => {
    const { db, alerts, service } = joinSetup({ step: 'WRITTEN', interviewEnabled: false, customQuestions: ['Nega bizni tanladingiz?'], writtenIndex: 0, writtenAnswers: [] });
    await service.handleText(message('Jamoangiz kuchli.'));
    expect(db.telegramJoinSession.deleteMany).toHaveBeenCalled();
    expect(db.telegramScreeningAlert.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [{ companyId: 3, applicationId: 9, chatId: '77' }] }));
    expect(alerts.dispatch).toHaveBeenCalled();
  });

  it('hands the candidate’s text and the skip button to the interviewer', async () => {
    const { interviewer, telegram, service } = joinSetup({ step: 'INTERVIEW', interviewTurns: [{ role: 'ai', text: 'Salom' }], interviewTurn: 1 });
    await service.handleText(message('Men Instagram bilan ishlaganman'));
    expect(interviewer.handleText).toHaveBeenCalledWith(expect.objectContaining({ step: 'INTERVIEW' }), 'Men Instagram bilan ishlaganman', expect.objectContaining({ flow: 'join' }));
    await service.handleCallback(callback('join:ivskip'));
    expect(interviewer.skip).toHaveBeenCalledTimes(1);

    const outside = joinSetup({ step: 'DOCUMENT' });
    await outside.service.handleCallback(callback('join:ivskip'));
    expect(outside.interviewer.skip).not.toHaveBeenCalled();
    expect(outside.telegram.answerCallbackQuery).toHaveBeenCalledWith('cb', botText('uz', 'stepDone'));
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps the interview on the application, ends the session, alerts HR for a passed test and restores the menu', async () => {
    const { db, interviewer, telegram, service } = joinSetup({ step: 'INTERVIEW', interviewTurns: [], interviewTurn: 0 });
    await service.handleText(message('hello'));
    // The interviewer is a stub: run its completion callback the way the real one does at the end.
    const run = interviewer.handleText.mock.calls[0][2];
    await run.complete(stored);
    expect(db.application.updateMany).toHaveBeenCalledWith({ where: { id: 9, companyId: 3 }, data: { aiInterview: stored } });
    expect(db.telegramJoinSession.deleteMany).toHaveBeenCalledWith({ where: { telegramUserId: '42', step: 'INTERVIEW' } });
    expect(db.telegramScreeningAlert.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [{ companyId: 3, applicationId: 9, chatId: '77' }] }));
    expect(telegram.sendMessage).toHaveBeenLastCalledWith(42, botText('uz', 'menuPrompt'), expect.objectContaining({ replyMarkup: expect.objectContaining({ keyboard: expect.any(Array) }) }));
  });

  it('does not alert HR for a candidate who failed the test, and ends once even if completed twice', async () => {
    const { db, service, interviewer } = joinSetup({ step: 'INTERVIEW' }, false);
    await service.handleText(message('hello'));
    const run = interviewer.handleText.mock.calls[0][2];
    await run.complete(stored);
    expect(db.telegramScreeningAlert.createMany).not.toHaveBeenCalled();
    db.telegramJoinSession.deleteMany.mockResolvedValue({ count: 0 });
    db.application.findFirst.mockClear();
    await run.complete(stored);
    expect(db.application.findFirst).not.toHaveBeenCalled();
  });
});

describe('AI interview in the vacancy-link flow', () => {
  const vacancy = { id: 5, companyId: 3, title: 'SMM Lead', description: 'Desc', revision: 1, status: 'ACTIVE', requirements: [{ name: 'Instagram' }] };
  function applySetup(session: Record<string, unknown>) {
    const row = { telegramUserId: '42', companyId: 3, vacancyId: 5, step: 'ASSESSMENT', currentQuestionIndex: 0, answers: [], assessmentQuestions: assessment, interviewEnabled: true, interviewFocus: 'Reels', customQuestions: [], expiresAt: future(), vacancy, ...session };
    const db: any = {
      telegramApplySession: { findUnique: vi.fn().mockResolvedValue(row), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      candidate: { upsert: vi.fn().mockResolvedValue({ id: 7 }) },
      vacancy: { findFirst: vi.fn().mockResolvedValue(vacancy) },
    };
    const telegram = { sendMessage: vi.fn().mockResolvedValue({ ok: true }), answerCallbackQuery: vi.fn() };
    const interviewer = { available: true, start: vi.fn(), handleText: vi.fn(), skip: vi.fn() };
    const service = new TelegramApplyService(db, security as never, telegram as never, {} as never, undefined, undefined, undefined, undefined, interviewer as never);
    return { db, telegram, interviewer, service };
  }

  it('freezes the interview setting with the approved test', async () => {
    const { db, service } = applySetup({ step: 'PRIVACY' });
    // The vacancy approved the test and switched the interview on.
    const approved = { ...vacancy, assessmentQuestions: assessment, assessmentRevision: 1, assessmentApprovedAt: new Date(), aiInterviewEnabled: true, interviewFocus: ' Reels ' };
    db.telegramApplySession.findUnique.mockResolvedValue({ telegramUserId: '42', vacancyId: 5, step: 'PRIVACY', expiresAt: future(), vacancy: approved });
    await service.handleCallback(callback('apply:5:privacy:yes'));
    expect(db.telegramApplySession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ interviewEnabled: true, interviewFocus: 'Reels', interviewTurn: 0 }) }));
    expect(approvedInterview({ ...approved, assessmentApprovedAt: null })).toEqual({ enabled: false, focus: null });
  });

  it('moves to the interview after the last test answer and starts it', async () => {
    const { db, interviewer, telegram, service } = applySetup({ currentQuestionIndex: 9, answers: answersUpTo(9) });
    await service.handleCallback(callback(`apply:5:quiz:${lastQuestion.id}:${lastQuestion.correctIndex}`));
    expect(db.telegramApplySession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ step: 'INTERVIEW', interviewTurns: [], interviewTurn: 0 }) }));
    expect(interviewer.start).toHaveBeenCalledTimes(1);
    expect(interviewer.start.mock.calls[0][0]).toEqual(expect.objectContaining({ flow: 'apply', skipCallback: 'apply:5:ivskip' }));
    expect(telegram.sendMessage.mock.calls.some((call: unknown[]) => String(call[1]).includes('100%'))).toBe(true);
  });

  it('goes to the phone number when no interview is switched on', async () => {
    const { db, interviewer, service } = applySetup({ interviewEnabled: false, currentQuestionIndex: 9, answers: answersUpTo(9) });
    await service.handleCallback(callback(`apply:5:quiz:${lastQuestion.id}:${lastQuestion.correctIndex}`));
    expect(db.telegramApplySession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ step: 'CONTACT_PHONE' }) }));
    expect(interviewer.start).not.toHaveBeenCalled();
  });

  it('moves from the last written answer to the interview', async () => {
    const { db, interviewer, service } = applySetup({ step: 'WRITTEN', customQuestions: ['Nega bizni tanladingiz?'], writtenIndex: 0, writtenAnswers: [] });
    await service.handleText(message('Jamoangiz kuchli.'));
    expect(db.telegramApplySession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ step: 'INTERVIEW', interviewTurns: [] }) }));
    expect(interviewer.start).toHaveBeenCalledTimes(1);
  });

  it('routes text and the skip button to the interviewer, and asks for the phone when it is over', async () => {
    const { db, interviewer, telegram, service } = applySetup({ step: 'INTERVIEW', interviewTurns: [{ role: 'ai', text: 'Salom' }], interviewTurn: 1 });
    expect(await service.handleText(message('Men SMM bilan ishlaganman'))).toBe(true);
    expect(interviewer.handleText).toHaveBeenCalledWith(expect.objectContaining({ step: 'INTERVIEW' }), 'Men SMM bilan ishlaganman', expect.objectContaining({ flow: 'apply' }));
    await service.handleCallback(callback('apply:5:ivskip'));
    expect(interviewer.skip).toHaveBeenCalledTimes(1);

    await interviewer.handleText.mock.calls[0][2].complete(stored);
    expect(db.telegramApplySession.updateMany).toHaveBeenLastCalledWith({ where: { telegramUserId: '42', step: 'INTERVIEW' }, data: { step: 'CONTACT_PHONE' } });
    expect(telegram.sendMessage).toHaveBeenLastCalledWith(42, botText('uz', 'writtenDoneAskPhone'), expect.anything());
  });

  it('keeps the interview result on the application when the CV is submitted', async () => {
    const tx = {
      candidate: { upsert: vi.fn().mockResolvedValue({ id: 7 }) },
      application: { upsert: vi.fn().mockResolvedValue({ id: 9 }) },
      resume: { create: vi.fn().mockResolvedValue({ id: 11 }) },
      candidateEvent: { create: vi.fn() },
      telegramBusinessConnection: { findMany: vi.fn().mockResolvedValue([]) },
      telegramScreeningAlert: { createMany: vi.fn() },
      telegramApplySession: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const db: any = {
      telegramApplySession: { findUnique: vi.fn().mockResolvedValue({ companyId: 3, vacancyId: 5, step: 'DOCUMENT', privacyAcceptedAt: new Date(), aiConsentAt: new Date(), phone: '+998901234567', answers: answersUpTo(10), assessmentQuestions: assessment, interviewResult: stored, expiresAt: future(), vacancy }) },
      resume: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
      $transaction: vi.fn((fn: any) => fn(tx)),
    };
    const telegram = { sendMessage: vi.fn().mockResolvedValue({ ok: true }), answerCallbackQuery: vi.fn() };
    const service = new TelegramApplyService(db, security as never, telegram as never, { add: vi.fn() } as never, undefined, undefined, { dispatch: vi.fn() } as never);
    await service.handleDocument({ message_id: 1, from: { id: 42, first_name: 'Ali' }, chat, date: 1, document: { file_id: 'f1', file_name: 'cv.pdf', mime_type: 'application/pdf', file_size: 123 } });
    expect(tx.application.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ aiInterview: stored }), update: expect.objectContaining({ aiInterview: stored }) }));
  });
});
