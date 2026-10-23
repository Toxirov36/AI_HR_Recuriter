import { describe, expect, it, vi } from 'vitest';
import {
  combinedScore,
  interviewEvaluationSchema,
  MAX_INTERVIEW_ANSWERS,
  normalizeEvaluation,
  recommendationOf,
  storedInterviewOf,
  type InterviewTurn,
} from '../ai/schemas/interview.schema';
import { TelegramAiInterviewService } from './telegram-ai-interview.service';
import { botText } from './telegram-i18n';

const evaluation = { score: 82, verdict: 'recommend', reason: 'Yaxshi', strengths: ['A'], weaknesses: ['B'], risks: ['C'], checkQuestions: ['Q?'], summary: 'S' };
const ctx = { vacancyTitle: 'SMM Lead', vacancyDescription: 'Desc', requirements: ['Instagram'], focus: 'Reels', testSummary: 'Test 80%' };
const tr = (key: Parameters<typeof botText>[1], params?: Record<string, string | number>) => botText('uz', key, params);

function setup(generate: ReturnType<typeof vi.fn>, claims: Array<number> = []) {
  const updateMany = vi.fn(async () => ({ count: claims.length ? (claims.shift() as number) : 1 }));
  const db: any = { telegramJoinSession: { updateMany }, telegramApplySession: { updateMany: vi.fn(async () => ({ count: 1 })) } };
  const telegram = { sendMessage: vi.fn().mockResolvedValue({ ok: true }), sendChatAction: vi.fn() };
  const security = { limit: vi.fn(), config: { DEEPSEEK_API_KEY: 'k', AI_PROVIDER: 'auto', GEMINI_API_KEY: '' } };
  const service = new TelegramAiInterviewService(db, security as never, telegram as never, { generate } as never);
  const complete = vi.fn().mockResolvedValue(undefined);
  const run = { flow: 'join' as const, userId: '42', chatId: 42, lang: 'uz' as const, tr, ctx, skipCallback: 'join:ivskip', complete };
  return { service, db, updateMany, telegram, security, complete, run };
}

const session = (turns: InterviewTurn[], result: unknown = null) => ({ telegramUserId: '42', interviewTurns: turns, interviewResult: result });
const ai = (text: string): InterviewTurn => ({ role: 'ai', text });
const me = (text: string): InterviewTurn => ({ role: 'candidate', text });

describe('interview scoring helpers', () => {
  it('clamps, defaults and trims whatever the model returns', () => {
    const result = normalizeEvaluation({ ...evaluation, score: 140.6, verdict: 'HIRE NOW', strengths: ['  a  ', '', 'b', 'c', 'd', 'e'], reason: 'x'.repeat(900) });
    expect(result.score).toBe(100);
    expect(result.verdict).toBe('consider');
    expect(result.strengths).toEqual(['a', 'b', 'c', 'd']);
    expect(result.reason).toHaveLength(500);
    expect(normalizeEvaluation({ ...evaluation, score: -5, verdict: 'Reject' }).verdict).toBe('reject');
    expect(normalizeEvaluation({ ...evaluation, score: Number.NaN }).score).toBe(0);
  });

  it('weights the test 40% and the interview 60%, and falls back to the one that exists', () => {
    expect(combinedScore(80, 60)).toBe(68);
    expect(combinedScore(null, 70)).toBe(70);
    expect(combinedScore(90, undefined)).toBe(90);
    expect(combinedScore(null, null)).toBeNull();
  });

  it('turns green only on a recommended interview with a good total, and red on rejection or a low total', () => {
    const rec = normalizeEvaluation(evaluation as never);
    expect(recommendationOf(rec, 75)).toBe('HIRE');
    expect(recommendationOf(rec, 65)).toBe('MAYBE');
    expect(recommendationOf(rec, 50)).toBe('NO');
    expect(recommendationOf({ ...rec, verdict: 'reject' }, 90)).toBe('NO');
    expect(recommendationOf(null, 90)).toBe('MAYBE');
  });

  it('reads a stored interview back and rejects malformed JSON', () => {
    const stored = { turns: [ai('Salom')], evaluation: normalizeEvaluation(evaluation as never), finishedAt: '2026-10-23T10:00:00Z' };
    expect(storedInterviewOf(stored)?.turns).toHaveLength(1);
    expect(storedInterviewOf({ turns: 'x' })).toBeNull();
    expect(interviewEvaluationSchema.safeParse({ score: 1 }).success).toBe(false);
  });
});

describe('AI interview flow', () => {
  it('explains, asks the first question and keeps it as turn 1', async () => {
    const { service, updateMany, telegram, run } = setup(vi.fn().mockResolvedValue({ message: 'Salom! Qaysi loyihada ishlagansiz?', done: false }));
    await service.start(run);
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('Oxirgi bosqich');
    expect(telegram.sendChatAction).toHaveBeenCalledWith(42, 'typing');
    expect(updateMany).toHaveBeenCalledWith({
      where: { telegramUserId: '42', step: 'INTERVIEW', interviewTurn: 0 },
      data: { interviewTurns: [ai('Salom! Qaysi loyihada ishlagansiz?')], interviewTurn: 1 },
    });
    const question = telegram.sendMessage.mock.calls[1];
    expect(question[1]).toBe('Salom! Qaysi loyihada ishlagansiz?');
    expect(JSON.stringify(question[2])).toContain('join:ivskip');
  });

  it('skips the stage quietly when the AI cannot start it', async () => {
    const { service, complete, run } = setup(vi.fn().mockRejectedValue(new Error('down')));
    await service.start(run);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ turns: [], evaluation: null, skipped: true }));
  });

  it('records an answer and sends the AI’s next question', async () => {
    const generate = vi.fn().mockResolvedValue({ message: 'Qaysi vositalar bilan?', done: false });
    const { service, updateMany, telegram, run } = setup(generate);
    await service.handleText(session([ai('Qaysi loyiha?')]), 'Instagram uchun reklama qildim', run);
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { telegramUserId: '42', step: 'INTERVIEW', interviewTurn: 1 },
      data: { interviewTurns: [ai('Qaysi loyiha?'), me('Instagram uchun reklama qildim')], interviewTurn: 2 },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { telegramUserId: '42', step: 'INTERVIEW', interviewTurn: 2 } }));
    expect(telegram.sendMessage).toHaveBeenCalledWith(42, 'Qaysi vositalar bilan?', expect.anything());
    // The transcript sent to the model is data, with the vacancy and HR's focus.
    expect(generate.mock.calls[0][2]).toEqual(expect.objectContaining({ focus: 'Reels', candidateAnswers: 1, vacancy: expect.objectContaining({ title: 'SMM Lead' }) }));
  });

  it('asks to wait while an answer is being processed, and rejects text that is too short or long', async () => {
    const { service, updateMany, telegram, run } = setup(vi.fn());
    await service.handleText(session([ai('Q'), me('A')]), 'again', run);
    expect(telegram.sendMessage).toHaveBeenLastCalledWith(42, tr('aiInterviewBusy'));
    await service.handleText(session([ai('Q')]), 'x', run);
    expect(telegram.sendMessage).toHaveBeenLastCalledWith(42, tr('aiInterviewInvalid'));
    await service.handleText(session([ai('Q')]), 'y'.repeat(1501), run);
    expect(telegram.sendMessage).toHaveBeenLastCalledWith(42, tr('aiInterviewInvalid'));
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does nothing when another message already claimed the turn', async () => {
    const generate = vi.fn();
    const { service, telegram, run } = setup(generate, [0]);
    await service.handleText(session([ai('Q')]), 'my answer', run);
    expect(generate).not.toHaveBeenCalled();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('ends after the last allowed answer, evaluates once and hands the result on', async () => {
    const generate = vi.fn().mockResolvedValue(evaluation);
    const { service, complete, updateMany, telegram, run } = setup(generate);
    const turns: InterviewTurn[] = [];
    for (let i = 0; i < MAX_INTERVIEW_ANSWERS - 1; i += 1) turns.push(ai(`Q${i}`), me(`A${i}`));
    turns.push(ai('Q-last'));
    await service.handleText(session(turns), 'last answer', run);
    expect(generate).toHaveBeenCalledTimes(1); // only the evaluation, no further question
    expect(generate.mock.calls[0][1]).toBe('Evaluate the interview.');
    const finalWrite = updateMany.mock.calls.at(-1) as any;
    expect(finalWrite[0].data.interviewResult.evaluation).toEqual(expect.objectContaining({ score: 82, verdict: 'recommend' }));
    expect(telegram.sendMessage).toHaveBeenLastCalledWith(42, tr('aiInterviewDone'));
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ evaluation: expect.objectContaining({ score: 82 }) }));
  });

  it('wraps up when the AI says it is done, sending its closing line first', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ message: 'Rahmat, hammasi tushunarli.', done: true })
      .mockResolvedValueOnce(evaluation);
    const { service, complete, telegram, run } = setup(generate);
    await service.handleText(session([ai('Q')]), 'answer', run);
    expect(telegram.sendMessage).toHaveBeenNthCalledWith(1, 42, 'Rahmat, hammasi tushunarli.');
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ evaluation: expect.objectContaining({ score: 82 }) }));
  });

  it('evaluates what exists when the AI fails mid-interview, and stores no evaluation if that fails too', async () => {
    const { service, complete, run } = setup(vi.fn().mockRejectedValue(new Error('boom')));
    await service.handleText(session([ai('Q')]), 'answer', run);
    const stored = complete.mock.calls[0][0];
    expect(stored.evaluation).toBeNull();
    expect(stored.turns).toEqual([ai('Q'), me('answer')]);
  });

  it('keeps the partial transcript and evaluates it when the candidate skips', async () => {
    const { service, complete, telegram, run } = setup(vi.fn().mockResolvedValue(evaluation));
    await service.skip(session([ai('Q'), me('A'), ai('Q2')]), run);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ skipped: true, evaluation: expect.objectContaining({ score: 82 }) }));
    expect(telegram.sendMessage).toHaveBeenLastCalledWith(42, tr('aiInterviewDone'));
  });

  it('says it was skipped when nothing was answered, without calling the AI for an evaluation', async () => {
    const generate = vi.fn();
    const { service, complete, telegram, run } = setup(generate);
    await service.skip(session([ai('Q')]), run);
    expect(generate).not.toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenLastCalledWith(42, tr('aiInterviewSkipped'));
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ evaluation: null, skipped: true }));
  });

  it('finishes the flow again from a saved result instead of asking more questions', async () => {
    const stored = { turns: [ai('Q'), me('A')], evaluation: null, finishedAt: '2026-10-23T10:00:00Z' };
    const { service, complete, updateMany, run } = setup(vi.fn());
    await service.handleText(session([ai('Q'), me('A')], stored), 'late message', run);
    expect(complete).toHaveBeenCalledWith(stored);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('writes to the vacancy-link table for the apply flow', async () => {
    const { service, db, run } = setup(vi.fn().mockResolvedValue({ message: 'Salom', done: false }));
    await service.start({ ...run, flow: 'apply' });
    expect(db.telegramApplySession.updateMany).toHaveBeenCalled();
    expect(db.telegramJoinSession.updateMany).not.toHaveBeenCalled();
  });

  it('is available only with a text AI provider', () => {
    const { service } = setup(vi.fn());
    expect(service.available).toBe(true);
    const off = new TelegramAiInterviewService({} as never, { config: { AI_PROVIDER: 'auto', DEEPSEEK_API_KEY: '', GEMINI_API_KEY: '' } } as never, {} as never, { generate: vi.fn() } as never);
    expect(off.available).toBe(false);
  });
});
