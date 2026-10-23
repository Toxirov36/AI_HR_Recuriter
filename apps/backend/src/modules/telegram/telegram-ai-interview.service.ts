import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { textAiProvider } from '../../config/app.config';
import { Database } from '../../database/prisma.service';
import { Security } from '../../common/utils/security';
import { GeminiProvider } from '../ai/providers/gemini.provider';
import { evaluatorInstructions, interviewerInstructions } from '../ai/prompts/interview.prompt';
import {
  candidateAnswersIn,
  interviewEvaluationSchema,
  interviewTurnSchema,
  interviewTurnsOf,
  MAX_INTERVIEW_ANSWER_CHARS,
  MAX_INTERVIEW_ANSWERS,
  normalizeEvaluation,
  storedInterviewOf,
  type InterviewEvaluation,
  type InterviewTurn,
  type StoredInterview,
} from '../ai/schemas/interview.schema';
import { TelegramApiService } from './telegram-api.service';
import type { BotLang, BotMessageKey } from './telegram-i18n';

export type InterviewFlow = 'join' | 'apply';
type Tr = (key: BotMessageKey, params?: Record<string, string | number>) => string;

export type InterviewContext = {
  vacancyTitle: string;
  vacancyDescription?: string | null;
  requirements: string[];
  focus?: string | null;
  /** One line about the multiple-choice test, if the candidate took it. */
  testSummary?: string | null;
};

export type InterviewSession = {
  telegramUserId: string;
  interviewTurns: unknown;
  interviewResult: unknown;
};

export type InterviewRun = {
  flow: InterviewFlow;
  userId: string;
  chatId: number;
  lang: BotLang;
  tr: Tr;
  ctx: InterviewContext;
  /** Callback data of the "skip" button; differs per flow. */
  skipCallback: string;
  /** Moves the flow on once the interview is over (the stored result is already saved on the session). */
  complete: (stored: StoredInterview) => Promise<void>;
};

type SessionTable = { updateMany(args: { where: object; data: object }): Promise<{ count: number }> };

const LANGUAGE_NAMES: Record<BotLang, string> = { uz: 'Uzbek (Latin script)', ru: 'Russian', tg: 'Tajik (Cyrillic script)' };

/**
 * The AI chat interview of the candidate bot. Both candidate flows (company link and vacancy link) use it: it
 * keeps the transcript on the session, takes at most MAX_INTERVIEW_ANSWERS answers, then evaluates once and hands
 * the result back through `complete`. Every state change is an atomic claim on `interviewTurn`, so a double tap
 * or two quick messages cannot process the same turn twice.
 */
@Injectable()
export class TelegramAiInterviewService {
  private readonly logger = new Logger(TelegramAiInterviewService.name);
  private readonly gemini: GeminiProvider;

  constructor(
    @Inject(Database) private db: Database,
    @Inject(Security) private security: Security,
    @Inject(TelegramApiService) private telegram: TelegramApiService,
    @Optional() @Inject(GeminiProvider) gemini?: GeminiProvider,
  ) {
    this.gemini = gemini ?? new GeminiProvider(security);
  }

  /** The interview needs a text AI provider; without one the stage is skipped. */
  get available() {
    return Boolean(textAiProvider(this.security.config));
  }

  private table(flow: InterviewFlow): SessionTable {
    return (flow === 'join' ? this.db.telegramJoinSession : this.db.telegramApplySession) as unknown as SessionTable;
  }

  private claim(run: InterviewRun, fromTurn: number, data: object) {
    return this.table(run.flow)
      .updateMany({ where: { telegramUserId: run.userId, step: 'INTERVIEW', interviewTurn: fromTurn }, data })
      .then((result) => result.count > 0);
  }

  private skipButton(run: InterviewRun) {
    return { inline_keyboard: [[{ text: run.tr('aiInterviewSkip'), callback_data: run.skipCallback }]] };
  }

  private async typing(run: InterviewRun) {
    await this.telegram.sendChatAction(run.chatId, 'typing');
  }

  /** Called right after the session was moved to the INTERVIEW step: explains, then asks the first question. */
  async start(run: InterviewRun) {
    await this.telegram.sendMessage(run.chatId, run.tr('aiInterviewIntro', { max: MAX_INTERVIEW_ANSWERS }), { parseMode: 'HTML' });
    await this.typing(run);
    const first = await this.nextTurn(run, []);
    if (!first) {
      await this.finish(run, [], 0, true);
      return;
    }
    const turns: InterviewTurn[] = [{ role: 'ai', text: first.message }];
    if (!(await this.claim(run, 0, { interviewTurns: turns, interviewTurn: turns.length }))) return;
    await this.telegram.sendMessage(run.chatId, first.message, { replyMarkup: this.skipButton(run) });
  }

  /** The candidate wrote something while the interview step is active. */
  async handleText(session: InterviewSession, text: string, run: InterviewRun) {
    const stored = storedInterviewOf(session.interviewResult);
    if (stored) {
      await run.complete(stored);
      return;
    }
    const turns = interviewTurnsOf(session.interviewTurns);
    // Nothing to answer yet, or the previous answer is still being processed.
    if (!turns.length || turns[turns.length - 1].role === 'candidate') {
      await this.telegram.sendMessage(run.chatId, run.tr('aiInterviewBusy'));
      return;
    }
    if (text.length < 2 || text.length > MAX_INTERVIEW_ANSWER_CHARS) {
      await this.telegram.sendMessage(run.chatId, run.tr('aiInterviewInvalid'));
      return;
    }
    const withAnswer: InterviewTurn[] = [...turns, { role: 'candidate', text }];
    if (!(await this.claim(run, turns.length, { interviewTurns: withAnswer, interviewTurn: withAnswer.length }))) return;

    if (candidateAnswersIn(withAnswer) >= MAX_INTERVIEW_ANSWERS) {
      await this.finish(run, withAnswer, withAnswer.length, false);
      return;
    }
    await this.typing(run);
    const next = await this.nextTurn(run, withAnswer);
    if (!next) {
      // The AI failed in the middle: evaluate what there is.
      await this.finish(run, withAnswer, withAnswer.length, false);
      return;
    }
    const withReply: InterviewTurn[] = [...withAnswer, { role: 'ai', text: next.message }];
    if (next.done) {
      if (!(await this.claim(run, withAnswer.length, { interviewTurns: withReply, interviewTurn: withReply.length }))) return;
      await this.telegram.sendMessage(run.chatId, next.message);
      await this.finish(run, withReply, withReply.length, false);
      return;
    }
    if (!(await this.claim(run, withAnswer.length, { interviewTurns: withReply, interviewTurn: withReply.length }))) return;
    await this.telegram.sendMessage(run.chatId, next.message, { replyMarkup: this.skipButton(run) });
  }

  /** The candidate pressed "skip": what was said so far is kept and evaluated. */
  async skip(session: InterviewSession, run: InterviewRun) {
    const stored = storedInterviewOf(session.interviewResult);
    if (stored) {
      await run.complete(stored);
      return;
    }
    const turns = interviewTurnsOf(session.interviewTurns);
    if (turns.length && turns[turns.length - 1].role === 'candidate') {
      await this.telegram.sendMessage(run.chatId, run.tr('aiInterviewBusy'));
      return;
    }
    await this.finish(run, turns, turns.length, true);
  }

  /** Evaluates once, saves the result on the session as the atomic claim, then lets the flow move on. */
  private async finish(run: InterviewRun, turns: InterviewTurn[], fromTurn: number, skipped: boolean) {
    let evaluation: InterviewEvaluation | null = null;
    if (candidateAnswersIn(turns) > 0) {
      await this.typing(run);
      evaluation = await this.evaluate(run, turns);
    }
    const stored: StoredInterview = { turns, evaluation, finishedAt: new Date().toISOString(), ...(skipped ? { skipped: true } : {}) };
    if (!(await this.claim(run, fromTurn, { interviewResult: stored as object, interviewTurn: fromTurn + 1 }))) return;
    await this.telegram.sendMessage(run.chatId, run.tr(skipped && !candidateAnswersIn(turns) ? 'aiInterviewSkipped' : 'aiInterviewDone'));
    await run.complete(stored);
  }

  private async nextTurn(run: InterviewRun, turns: InterviewTurn[]): Promise<{ message: string; done: boolean } | null> {
    try {
      await this.security.limit(`telegram-ai-interview:${run.userId}`, 40, 3600);
      return await this.gemini.generate(
        interviewTurnSchema,
        turns.length ? 'Reply to the candidate and ask the next question, or finish.' : 'Greet the candidate and ask the first question.',
        { ...this.context(run.ctx), transcript: turns, candidateAnswers: candidateAnswersIn(turns), maxAnswers: MAX_INTERVIEW_ANSWERS },
        interviewerInstructions(LANGUAGE_NAMES[run.lang]),
      );
    } catch (error) {
      this.logger.warn(`AI interview turn failed: ${(error as Error).message}`);
      return null;
    }
  }

  private async evaluate(run: InterviewRun, turns: InterviewTurn[]): Promise<InterviewEvaluation | null> {
    try {
      const raw = await this.gemini.generate(
        interviewEvaluationSchema,
        'Evaluate the interview.',
        { ...this.context(run.ctx), transcript: turns },
        evaluatorInstructions,
      );
      return normalizeEvaluation(raw);
    } catch (error) {
      this.logger.warn(`AI interview evaluation failed: ${(error as Error).message}`);
      return null;
    }
  }

  private context(ctx: InterviewContext) {
    return {
      vacancy: { title: ctx.vacancyTitle, description: (ctx.vacancyDescription ?? '').slice(0, 1500), requirements: ctx.requirements.slice(0, 20) },
      focus: ctx.focus ?? null,
      test: ctx.testSummary ?? null,
    };
  }

  /** Text of the interview for HR: question and answer lines. */
  static transcriptText(stored: StoredInterview, names: { ai: string; candidate: string }): string {
    return stored.turns.map((turn) => `${turn.role === 'ai' ? names.ai : names.candidate}: ${turn.text}`).join('\n\n');
  }
}
