import { describe, expect, it, vi } from 'vitest';
import { parseFullName, parsePhone, TelegramJoinService } from './telegram-join.service';
import { getDefaultAssessmentForVacancy } from '../ai/utils/assessment-helper';

const assessment = getDefaultAssessmentForVacancy('SMM manager');
const future = () => new Date(Date.now() + 60_000);
const user = { id: 42, first_name: 'Ali', username: 'ali' };
const chat = { id: 42, type: 'private' as const };
const callback = (data: string) => ({ id: 'cb', from: user, message: { message_id: 1, chat }, data });
const base = { telegramUserId: '42', companyId: 3, vacancyId: null, fullName: null, phone: null, privacyAcceptedAt: null, aiConsentAt: null, applicationId: null, currentQuestionIndex: 0, answers: [], assessmentQuestions: null, assessmentRevision: null, expiresAt: future() };

function setup(session: Record<string, unknown> | null, extra: Record<string, unknown> = {}) {
  const db: any = {
    telegramJoinSession: {
      findUnique: vi.fn().mockResolvedValue(session ? { ...base, ...session } : null),
      upsert: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    telegramApplySession: { deleteMany: vi.fn() },
    company: { findFirst: vi.fn().mockResolvedValue({ id: 3, name: 'Acme', retentionDays: 180 }) },
    vacancy: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    candidate: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ id: 7 }) },
    application: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ id: 9 }), updateMany: vi.fn() },
    resume: { create: vi.fn().mockResolvedValue({ id: 11 }), update: vi.fn() },
    candidateEvent: { create: vi.fn() },
    telegramBusinessConnection: { findMany: vi.fn().mockResolvedValue([]) },
    telegramScreeningAlert: { createMany: vi.fn() },
    $transaction: vi.fn((cb: any) => cb(db)),
    ...extra,
  };
  const telegram = { sendMessage: vi.fn().mockResolvedValue({ ok: true }), answerCallbackQuery: vi.fn() };
  const queue = { add: vi.fn().mockResolvedValue(undefined) };
  const apply = { getAssessment: vi.fn().mockResolvedValue(assessment) };
  const security = { limit: vi.fn() };
  const alerts = { dispatch: vi.fn() };
  const service = new TelegramJoinService(db, security as never, telegram as never, queue as never, apply as never, { enabled: true } as never, alerts as never);
  return { db, telegram, queue, apply, security, service };
}

describe('join intake helpers', () => {
  it('accepts a full name with letters only', () => {
    expect(parseFullName('  Aziz   Karimov ')).toBe('Aziz Karimov');
    expect(parseFullName('Ғулом Абдуллоев')).toBe('Ғулом Абдуллоев');
    expect(parseFullName("O'tkir Ibragimov")).toBe("O'tkir Ibragimov");
    for (const bad of ['Aziz', 'A', '12345 678', 'Aziz <b>', '', 'x'.repeat(90)]) expect(parseFullName(bad)).toBeNull();
  });

  it('normalizes phone numbers and adds a plus to shared contacts', () => {
    expect(parsePhone('+998 90 123-45-67')).toBe('+998901234567');
    expect(parsePhone('998901234567', true)).toBe('+998901234567');
    expect(parsePhone('12345')).toBeNull();
    expect(parsePhone('call me')).toBeNull();
  });
});

describe('Telegram join flow', () => {
  it('starts from a company link, clears the other flow and asks for consent', async () => {
    const { db, telegram, service } = setup(null);
    await service.start({ message_id: 1, chat, from: user, text: '/start join_x' } as never, 'token');
    expect(db.telegramApplySession.deleteMany).toHaveBeenCalledWith({ where: { telegramUserId: '42' } });
    expect(db.telegramJoinSession.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ step: 'PRIVACY', companyId: 3 }) }));
    expect(telegram.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining('Acme'), expect.objectContaining({ replyMarkup: expect.anything() }));
  });

  it('rejects an unknown or inactive company link', async () => {
    const { db, telegram, service } = setup(null);
    db.company.findFirst.mockResolvedValue(null);
    await service.start({ message_id: 1, chat, from: user, text: '/start join_x' } as never, 'token');
    expect(db.telegramJoinSession.upsert).not.toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining('yaroqsiz'));
  });

  it('offers the open vacancies straight after consent', async () => {
    const { db, telegram, service } = setup({ step: 'PRIVACY' });
    db.vacancy.findMany.mockResolvedValue([{ id: 5, title: 'SMM Lead' }, { id: 6, title: 'Backend Developer' }]);
    expect(await service.handleCallback(callback('join:privacy:yes'))).toBe(true);
    expect(db.telegramJoinSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { telegramUserId: '42', step: 'PRIVACY' }, data: expect.objectContaining({ step: 'VACANCY', vacancyId: null }) }));
    const markup = telegram.sendMessage.mock.calls[0][2].replyMarkup.inline_keyboard.flat().map((b: any) => b.callback_data);
    expect(markup).toEqual(['join:vac:5', 'join:vac:6', 'join:cancel']);
  });

  it('skips the vacancy step when there is exactly one, and warns when there is none', async () => {
    const one = setup({ step: 'PRIVACY' });
    one.db.vacancy.findMany.mockResolvedValue([{ id: 5, title: 'SMM Lead' }]);
    await one.service.handleCallback(callback('join:privacy:yes'));
    expect(one.db.telegramJoinSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ step: 'NAME', vacancyId: 5 }) }));

    const none = setup({ step: 'PRIVACY' });
    await none.service.handleCallback(callback('join:privacy:yes'));
    expect(none.db.telegramJoinSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ step: 'NAME', vacancyId: null }) }));
    expect(none.telegram.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining('ochiq vakansiya yo‘q'), expect.anything());
  });

  it('refuses a vacancy the candidate already applied to', async () => {
    const { db, telegram, service } = setup({ step: 'PRIVACY' });
    db.vacancy.findMany.mockResolvedValue([{ id: 5, title: 'SMM Lead' }]);
    db.candidate.findUnique.mockResolvedValue({ id: 7 });
    db.application.findUnique.mockResolvedValue({ id: 1 });
    await service.handleCallback(callback('join:privacy:yes'));
    expect(telegram.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining('allaqachon'));
    expect(db.telegramJoinSession.deleteMany).toHaveBeenCalled();
  });

  it('ignores buttons from a finished step and expired sessions', async () => {
    const stale = setup({ step: 'NAME' });
    stale.db.telegramJoinSession.updateMany.mockResolvedValue({ count: 0 });
    await stale.service.handleCallback(callback('join:privacy:yes'));
    expect(stale.telegram.answerCallbackQuery).toHaveBeenCalledWith('cb', 'Bu bosqich allaqachon yakunlangan.');

    const expired = setup({ step: 'VACANCY', expiresAt: new Date(Date.now() - 1000) });
    expect(await expired.service.handleText({ message_id: 1, chat, from: user, text: 'hello' } as never)).toBe(false);
    expect(expired.db.telegramJoinSession.deleteMany).toHaveBeenCalled();
  });

  it('lets the candidate cancel at any step before the CV, without saving anything', async () => {
    const byButton = setup({ step: 'NAME' });
    expect(await byButton.service.handleCallback(callback('join:cancel'))).toBe(true);
    expect(byButton.db.telegramJoinSession.deleteMany).toHaveBeenCalled();
    expect(byButton.telegram.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining('bekor qilindi'), expect.objectContaining({ replyMarkup: { remove_keyboard: true } }));

    const byCommand = setup({ step: 'PHONE', fullName: 'Aziz Karimov' });
    expect(await byCommand.service.handleText({ message_id: 1, chat, from: user, text: '/cancel' } as never)).toBe(true);
    expect(byCommand.db.telegramJoinSession.deleteMany).toHaveBeenCalled();

    const byKeyboard = setup({ step: 'DOCUMENT', fullName: 'Aziz Karimov', phone: '+998901234567' });
    await byKeyboard.service.handleText({ message_id: 2, chat, from: user, text: '✖️ Bekor qilish' } as never);
    expect(byKeyboard.db.telegramJoinSession.deleteMany).toHaveBeenCalled();
  });

  it('does not cancel once the CV is submitted and the test has started', async () => {
    const { db, telegram, service } = setup({ step: 'ASSESSMENT', applicationId: 9 });
    await service.handleCallback(callback('join:cancel'));
    expect(db.telegramJoinSession.deleteMany).not.toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining('test boshlangan'));
  });

  it('goes back: name -> vacancy list, phone -> name, CV -> phone', async () => {
    const toList = setup({ step: 'NAME', vacancyId: 5 });
    toList.db.vacancy.findMany.mockResolvedValue([{ id: 5, title: 'SMM Lead' }, { id: 6, title: 'Backend Developer' }]);
    await toList.service.handleCallback(callback('join:back:vacancy'));
    expect(toList.db.telegramJoinSession.updateMany).toHaveBeenCalledWith({ where: { telegramUserId: '42', step: 'NAME' }, data: { step: 'VACANCY', vacancyId: null } });
    expect(toList.telegram.sendMessage.mock.calls[0][2].replyMarkup.inline_keyboard.flat().map((b: any) => b.callback_data)).toEqual(['join:vac:5', 'join:vac:6', 'join:cancel']);

    const toName = setup({ step: 'PHONE', fullName: 'Aziz Karimov' });
    await toName.service.handleText({ message_id: 1, chat, from: user, text: '⬅️ Orqaga' } as never);
    expect(toName.db.telegramJoinSession.updateMany).toHaveBeenCalledWith({ where: { telegramUserId: '42', step: 'PHONE' }, data: { step: 'NAME', fullName: null } });

    const toPhone = setup({ step: 'DOCUMENT', fullName: 'Aziz Karimov', phone: '+998901234567' });
    await toPhone.service.handleText({ message_id: 2, chat, from: user, text: '⬅️ Orqaga' } as never);
    expect(toPhone.db.telegramJoinSession.updateMany).toHaveBeenCalledWith({ where: { telegramUserId: '42', step: 'DOCUMENT' }, data: { step: 'PHONE', phone: null } });
    expect(toPhone.telegram.sendMessage.mock.calls[0][1]).toContain('Telefon raqamingizni');
  });

  it('collects name, then phone, then asks for the CV', async () => {
    const name = setup({ step: 'NAME' });
    await name.service.handleText({ message_id: 1, chat, from: user, text: 'x' } as never);
    expect(name.db.telegramJoinSession.updateMany).not.toHaveBeenCalled();
    await name.service.handleText({ message_id: 2, chat, from: user, text: 'Aziz Karimov' } as never);
    expect(name.db.telegramJoinSession.updateMany).toHaveBeenCalledWith({ where: { telegramUserId: '42', step: 'NAME' }, data: { step: 'PHONE', fullName: 'Aziz Karimov' } });
    const keyboard = name.telegram.sendMessage.mock.calls.at(-1)![2].replyMarkup.keyboard.flat();
    expect(keyboard[0].request_contact).toBe(true);

    const phone = setup({ step: 'PHONE', fullName: 'Aziz Karimov' });
    await phone.service.handleText({ message_id: 3, chat, from: user, text: 'nope' } as never);
    expect(phone.db.telegramJoinSession.updateMany).not.toHaveBeenCalled();
    await phone.service.handleContact({ message_id: 4, chat, from: user, contact: { phone_number: '998901234567', first_name: 'Ali' } } as never);
    expect(phone.db.telegramJoinSession.updateMany).toHaveBeenCalledWith({ where: { telegramUserId: '42', step: 'PHONE' }, data: { step: 'DOCUMENT', phone: '+998901234567' } });
  });

  const document = { file_id: 'f1', file_unique_id: 'u1', file_name: 'cv.pdf', mime_type: 'application/pdf', file_size: 2048 };

  it('creates the candidate, application and resume from the CV and starts the test', async () => {
    const { db, queue, apply, telegram, service } = setup({ step: 'DOCUMENT', vacancyId: 5, fullName: 'Aziz Karimov', phone: '+998901234567', privacyAcceptedAt: new Date(), aiConsentAt: new Date() });
    db.vacancy.findFirst.mockResolvedValue({ id: 5, companyId: 3, title: 'SMM Lead', description: 'd', revision: 1, assessmentQuestions: null, assessmentRevision: null, requirements: [] });
    expect(await service.handleDocument({ message_id: 1, chat, from: user, document } as never)).toBe(true);

    expect(db.candidate.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ fullName: 'Aziz Karimov', phone: '+998901234567', source: 'TELEGRAM' }) }));
    expect(db.application.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ vacancyId: 5, candidateId: 7, status: 'NEW' }) }));
    expect(queue.add).toHaveBeenCalledWith({ companyId: 3, candidateId: 7, resumeId: 11, fileId: 'f1', applicationId: 9 });
    expect(apply.getAssessment).toHaveBeenCalled();
    expect(db.telegramJoinSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ assessmentRevision: 1, currentQuestionIndex: 0 }) }));
    const last = telegram.sendMessage.mock.calls.at(-1)!;
    expect(last[2].replyMarkup.inline_keyboard[0][0].callback_data).toBe('join:quizstart');
  });

  it('keeps the CV for the talent pool when no vacancy was chosen', async () => {
    const { db, queue, apply, telegram, service } = setup({ step: 'DOCUMENT', vacancyId: null, fullName: 'Aziz Karimov', phone: '+998901234567', privacyAcceptedAt: new Date() });
    await service.handleDocument({ message_id: 1, chat, from: user, document } as never);
    expect(db.application.upsert).not.toHaveBeenCalled();
    expect(apply.getAssessment).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith({ companyId: 3, candidateId: 7, resumeId: 11, fileId: 'f1' });
    expect(telegram.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining('ochiq vakansiya yo‘q'), expect.anything());
  });

  it('rejects non-CV files and files sent before the CV step', async () => {
    const wrongFile = setup({ step: 'DOCUMENT', fullName: 'A B', privacyAcceptedAt: new Date() });
    await wrongFile.service.handleDocument({ message_id: 1, chat, from: user, document: { ...document, file_name: 'x.png', mime_type: 'image/png' } } as never);
    expect(wrongFile.db.$transaction).not.toHaveBeenCalled();
    const early = setup({ step: 'PHONE' });
    expect(await early.service.handleDocument({ message_id: 1, chat, from: user, document } as never)).toBe(true);
    expect(early.db.$transaction).not.toHaveBeenCalled();
  });

  it('does not process the same CV twice', async () => {
    const { db, queue, service } = setup({ step: 'DOCUMENT', vacancyId: null, fullName: 'Aziz Karimov', privacyAcceptedAt: new Date() });
    db.telegramJoinSession.deleteMany.mockResolvedValue({ count: 0 });
    await service.handleDocument({ message_id: 1, chat, from: user, document } as never);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('scores the test, saves it on the application and alerts HR when it is passed', async () => {
    const answers = assessment.questions.slice(0, 9).map((q) => ({ questionId: q.id, selectedIndex: q.correctIndex }));
    const last = assessment.questions[9];
    const { db, telegram, service } = setup({ step: 'ASSESSMENT', applicationId: 9, vacancyId: 5, assessmentQuestions: assessment, currentQuestionIndex: 9, answers });
    db.telegramBusinessConnection.findMany.mockResolvedValue([{ userChatId: BigInt(77), telegramUserId: BigInt(77) }]);
    await service.handleCallback(callback(`join:q:${last.id}:${last.correctIndex}`));

    expect(db.application.updateMany).toHaveBeenCalledWith({ where: { id: 9, companyId: 3 }, data: expect.objectContaining({ assessmentScore: 100 }) });
    expect(db.telegramScreeningAlert.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [{ companyId: 3, applicationId: 9, chatId: '77' }] }));
    expect(telegram.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining('100%'), { parseMode: 'HTML' });
  });

  it('ignores a duplicate or out-of-order answer', async () => {
    const { db, service } = setup({ step: 'ASSESSMENT', assessmentQuestions: assessment, currentQuestionIndex: 2, answers: [{ questionId: 1, selectedIndex: 0 }, { questionId: 2, selectedIndex: 0 }] });
    await service.handleCallback(callback('join:q:1:0'));
    expect(db.telegramJoinSession.updateMany).not.toHaveBeenCalled();
    expect(db.application.updateMany).not.toHaveBeenCalled();
  });
});
