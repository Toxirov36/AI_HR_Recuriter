import { describe, expect, it, vi } from 'vitest';
import { botText } from './telegram-i18n';
import { TelegramApplyService } from './telegram-apply.service';
import { TelegramJoinService } from './telegram-join.service';
import { TelegramMyApplicationsService } from './telegram-my-applications.service';

const user = { id: 42, first_name: 'Ali' };
const chat = { id: 42, type: 'private' as const };
const callback = (data: string) => ({ id: 'cb', from: user, message: { message_id: 1, chat }, data });
const future = () => new Date(Date.now() + 60_000);
const marketing = { name: 'Marketing' };

function joinSetup(vacancies: Array<Record<string, unknown>>, sameFieldApplication: boolean) {
  const db: any = {
    telegramJoinSession: {
      findUnique: vi.fn().mockResolvedValue({ telegramUserId: '42', companyId: 3, step: 'PRIVACY', answers: [], expiresAt: future() }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    vacancy: { findMany: vi.fn().mockResolvedValue(vacancies), findFirst: vi.fn() },
    candidate: { findUnique: vi.fn().mockResolvedValue({ id: 7 }) },
    application: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(sameFieldApplication ? { id: 1 } : null),
    },
  };
  const telegram = { sendMessage: vi.fn().mockResolvedValue({ ok: true }), answerCallbackQuery: vi.fn() };
  const service = new TelegramJoinService(db, { limit: vi.fn() } as never, telegram as never, {} as never, {} as never, { enabled: true } as never);
  return { db, telegram, service };
}

describe('one application per hiring field (join flow)', () => {
  it('blocks a vacancy whose field the candidate already applied to', async () => {
    const { db, telegram, service } = joinSetup([{ id: 5, title: 'SMM Lead', fieldId: 2, field: marketing }], true);
    await service.handleCallback(callback('join:privacy:yes'));
    expect(db.application.findFirst).toHaveBeenCalledWith({ where: { companyId: 3, candidateId: 7, vacancy: { fieldId: 2 } }, select: { id: true } });
    expect(telegram.sendMessage).toHaveBeenCalledWith(42, botText('uz', 'alreadyAppliedField', { field: 'Marketing' }), expect.anything());
    expect(db.telegramJoinSession.deleteMany).toHaveBeenCalled();
  });

  it('hides blocked vacancies from the list and keeps the free ones', async () => {
    const { db, telegram, service } = joinSetup([
      { id: 5, title: 'SMM Lead', fieldId: 2, field: marketing },
      { id: 6, title: 'Backend Developer', fieldId: null, field: null },
      { id: 7, title: 'Content Manager', fieldId: 3, field: { name: 'Content' } },
    ], false);
    db.application.findFirst.mockImplementation(async ({ where }: any) => (where.vacancy.fieldId === 2 ? { id: 1 } : null));
    await service.handleCallback(callback('join:privacy:yes'));
    const buttons = telegram.sendMessage.mock.calls[0][2].replyMarkup.inline_keyboard.flat().map((b: any) => b.callback_data);
    expect(buttons).toEqual(['join:vac:6', 'join:vac:7', 'join:cancel']);
  });

  it('says so when every vacancy is blocked', async () => {
    const { telegram, service } = joinSetup([
      { id: 5, title: 'SMM Lead', fieldId: 2, field: marketing },
      { id: 6, title: 'Ads Manager', fieldId: 2, field: marketing },
    ], true);
    await service.handleCallback(callback('join:privacy:yes'));
    expect(telegram.sendMessage).toHaveBeenCalledWith(42, botText('uz', 'alreadyAppliedAll'), expect.anything());
  });

  it('does not restrict vacancies without a field', async () => {
    const { db, telegram, service } = joinSetup([{ id: 5, title: 'Backend Developer', fieldId: null, field: null }], true);
    await service.handleCallback(callback('join:privacy:yes'));
    expect(db.application.findFirst).not.toHaveBeenCalled();
    expect(db.telegramJoinSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ step: 'NAME', vacancyId: 5 }) }));
    expect(telegram.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining('Backend Developer'), expect.anything());
  });
});

describe('starting from the menu', () => {
  const picked = { id: 5, title: 'SMM Lead', fieldId: 2, field: marketing, company: { id: 3, name: 'Acme', retentionDays: 180 } };

  it('opens the consent step with the chosen vacancy preset', async () => {
    const { db, telegram, service } = joinSetup([], false);
    db.vacancy.findFirst.mockResolvedValue(picked);
    db.telegramApplySession = { deleteMany: vi.fn() };
    db.telegramJoinSession.upsert = vi.fn();
    await service.startVacancy({ message_id: 1, chat, from: user } as never, 3, 5);
    expect(db.telegramJoinSession.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ companyId: 3, step: 'PRIVACY', vacancyId: 5 }) }));
    expect(telegram.sendMessage).toHaveBeenCalledWith(42, expect.stringContaining('Acme'), expect.anything());
  });

  it('refuses a vacancy of a field already applied to, and a vacancy that is gone', async () => {
    const blocked = joinSetup([], true);
    blocked.db.vacancy.findFirst.mockResolvedValue(picked);
    blocked.db.telegramJoinSession.upsert = vi.fn();
    await blocked.service.startVacancy({ message_id: 1, chat, from: user } as never, 3, 5);
    expect(blocked.db.telegramJoinSession.upsert).not.toHaveBeenCalled();
    expect(blocked.telegram.sendMessage).toHaveBeenCalledWith(42, botText('uz', 'alreadyAppliedField', { field: 'Marketing' }), expect.anything());

    const gone = joinSetup([], false);
    gone.db.vacancy.findFirst.mockResolvedValue(null);
    await gone.service.startVacancy({ message_id: 1, chat, from: user } as never, 3, 5);
    expect(gone.telegram.sendMessage).toHaveBeenCalledWith(42, botText('uz', 'vacancyGone'));
  });
});

describe('one application per hiring field (vacancy link flow)', () => {
  it('refuses a second vacancy of the same field', async () => {
    const db: any = {
      vacancy: { findUnique: vi.fn().mockResolvedValue({ id: 5, companyId: 3, title: 'SMM Lead', publicToken: 't', fieldId: 2, field: marketing, company: { name: 'Acme', retentionDays: 180 }, requirements: [] }) },
      candidate: { findUnique: vi.fn().mockResolvedValue({ id: 7 }) },
      application: { findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn().mockResolvedValue({ id: 1 }) },
      telegramApplySession: { upsert: vi.fn() },
    };
    const telegram = { sendMessage: vi.fn().mockResolvedValue({ ok: true }), answerCallbackQuery: vi.fn() };
    const service = new TelegramApplyService(db, { config: {}, limit: vi.fn() } as never, telegram as never, {} as never);
    await service.start({ message_id: 1, chat, from: user, text: '/start apply_x' } as never, 'token');
    expect(telegram.sendMessage).toHaveBeenCalledWith(42, botText('uz', 'alreadyAppliedField', { field: 'Marketing' }), expect.anything());
    expect(db.telegramApplySession.upsert).not.toHaveBeenCalled();
  });
});

describe('my applications', () => {
  function setup(rows: Array<Record<string, unknown>>, total = rows.length, language = 'ru') {
    const db: any = { application: { findMany: vi.fn().mockResolvedValue(rows), count: vi.fn().mockResolvedValue(total) } };
    const telegram = { sendMessage: vi.fn().mockResolvedValue({ ok: true }) };
    const languages = { get: vi.fn().mockResolvedValue(language) };
    return { db, telegram, service: new TelegramMyApplicationsService(db, telegram as never, languages as never) };
  }

  it('lists the user’s applications in their language, across companies', async () => {
    const { db, telegram, service } = setup([
      { createdAt: new Date('2026-10-20T10:00:00Z'), status: 'INTERVIEW', assessmentScore: 80, company: { name: 'Acme' }, vacancy: { title: 'SMM <Lead>', field: marketing } },
      { createdAt: new Date('2026-10-01T10:00:00Z'), status: 'NEW', assessmentScore: null, company: { name: 'Beta' }, vacancy: { title: 'Backend', field: null } },
    ]);
    await service.show(42, '42');
    expect(db.application.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { candidate: { telegramUserId: '42' } } }));
    const text = telegram.sendMessage.mock.calls[0][1] as string;
    expect(text).toContain('Мои заявки');
    expect(text).toContain('1. <b>SMM &lt;Lead&gt;</b> — Acme');
    expect(text).toContain('Сфера: Marketing');
    expect(text).toContain('Статус: Интервью · Тест: 80%');
    expect(text).toContain('📅 20.10.2026');
    expect(text).toContain('2. <b>Backend</b> — Beta');
    expect(text).not.toContain('… и ещё');
  });

  it('says so when there are none, and counts the ones beyond the page', async () => {
    const empty = setup([]);
    await empty.service.show(42, '42');
    expect(empty.telegram.sendMessage).toHaveBeenCalledWith(42, botText('ru', 'myAppsEmpty'));

    const row = { createdAt: new Date(), status: 'NEW', assessmentScore: null, company: { name: 'Acme' }, vacancy: { title: 'X', field: null } };
    const many = setup([row], 13, 'uz');
    await many.service.show(42, '42');
    expect(many.telegram.sendMessage.mock.calls[0][1]).toContain('yana 12 ta ariza');
  });
});

describe('coming back to an unfinished application', () => {
  const picked = { id: 5, title: 'SMM Lead', fieldId: 2, field: marketing, company: { id: 3, name: 'Acme', retentionDays: 180 } };
  const questions = { questions: Array.from({ length: 10 }, (_, k) => ({ id: k + 1, type: k < 5 ? 'HARD_SKILL' : 'SOFT_SKILL', question: `Question number ${k + 1}`, options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: 'Because it is.' })) };

  it('asks the next test question again when the session is still alive', async () => {
    const { db, telegram, service } = joinSetup([], false);
    db.vacancy.findFirst.mockResolvedValue(picked);
    db.telegramApplySession = { deleteMany: vi.fn() };
    db.telegramJoinSession.upsert = vi.fn();
    db.telegramJoinSession.findUnique.mockResolvedValue({ telegramUserId: '42', companyId: 3, vacancyId: 5, step: 'ASSESSMENT', currentQuestionIndex: 1, answers: [{ questionId: 1, selectedIndex: 0 }], assessmentQuestions: questions, expiresAt: future() });
    await service.startVacancy({ message_id: 1, chat, from: user } as never, 3, 5);
    expect(telegram.sendMessage).toHaveBeenCalledWith(42, botText('uz', 'resumeNotice'));
    expect(telegram.sendMessage.mock.calls.some(([, text]: [number, string]) => text.includes('Question number 2'))).toBe(true);
    expect(db.telegramJoinSession.upsert).not.toHaveBeenCalled();
  });

  it('opens a fresh test session when the application exists but the test was never finished', async () => {
    const { db, telegram, service } = joinSetup([], false);
    db.vacancy.findFirst.mockResolvedValue(picked);
    db.telegramApplySession = { deleteMany: vi.fn() };
    db.telegramJoinSession.upsert = vi.fn();
    db.telegramJoinSession.findUnique.mockResolvedValue(null);
    db.telegramJoinSession.updateMany.mockResolvedValue({ count: 1 });
    db.candidate.findUnique.mockResolvedValue({ id: 7, fullName: 'Ali Valiyev', phone: '+998901234567', privacyAcceptedAt: new Date(), aiConsentAt: new Date() });
    db.application.findUnique.mockResolvedValue({ id: 11, assessmentResult: null, vacancy: { id: 5, status: 'ACTIVE', revision: 1 } });
    (service as any).apply = { getAssessment: vi.fn().mockResolvedValue(questions) };
    await service.startVacancy({ message_id: 1, chat, from: user } as never, 3, 5);
    expect(db.telegramJoinSession.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ step: 'ASSESSMENT', applicationId: 11, vacancyId: 5 }) }));
    expect(telegram.sendMessage).toHaveBeenCalledWith(42, botText('uz', 'resumeNotice'));
    expect(telegram.sendMessage).toHaveBeenCalledWith(42, botText('uz', 'quizIntroJoin'), expect.anything());
  });

  it('still refuses a vacancy whose test was already finished', async () => {
    const { db, telegram, service } = joinSetup([], false);
    db.vacancy.findFirst.mockResolvedValue(picked);
    db.telegramJoinSession.findUnique.mockResolvedValue(null);
    db.candidate.findUnique.mockResolvedValue({ id: 7, fullName: 'Ali Valiyev', phone: null, privacyAcceptedAt: new Date(), aiConsentAt: null });
    db.application.findUnique.mockResolvedValue({ id: 11, assessmentResult: { score: 80 }, vacancy: { id: 5, status: 'ACTIVE' } });
    await service.startVacancy({ message_id: 1, chat, from: user } as never, 3, 5);
    expect(telegram.sendMessage).toHaveBeenCalledWith(42, botText('uz', 'alreadyAppliedTitle', { title: 'SMM Lead' }), expect.anything());
  });
});
