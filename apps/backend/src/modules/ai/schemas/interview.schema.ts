import { z } from 'zod';

/** Candidate answers the AI interviewer takes before it must wrap up. */
export const MAX_INTERVIEW_ANSWERS = 6;
export const MAX_INTERVIEW_ANSWER_CHARS = 1500;

export type InterviewTurn = { role: 'ai' | 'candidate'; text: string };

/** What the model returns for the next step of the conversation. */
export const interviewTurnSchema = z.object({
  message: z.string().trim().min(2).max(700),
  done: z.boolean(),
});

/**
 * What the model returns when it evaluates the finished interview. Kept permissive on purpose: the values are
 * normalised by `normalizeEvaluation`, so a slightly off answer is repaired instead of discarded.
 */
export const interviewEvaluationSchema = z.object({
  score: z.number(),
  verdict: z.string(),
  reason: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  risks: z.array(z.string()),
  checkQuestions: z.array(z.string()),
  summary: z.string(),
});

export type InterviewVerdict = 'recommend' | 'consider' | 'reject';
export type InterviewEvaluation = {
  score: number;
  verdict: InterviewVerdict;
  reason: string;
  strengths: string[];
  weaknesses: string[];
  risks: string[];
  checkQuestions: string[];
  summary: string;
};

const clip = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const list = (value: unknown, items: number, max: number) =>
  (Array.isArray(value) ? value : []).map((item) => clip(item, max)).filter(Boolean).slice(0, items);

/** Clamps the score, defaults the verdict and trims the text, so whatever reaches HR is bounded and well-formed. */
export function normalizeEvaluation(raw: z.infer<typeof interviewEvaluationSchema>): InterviewEvaluation {
  const score = Number.isFinite(raw.score) ? Math.min(100, Math.max(0, Math.round(raw.score))) : 0;
  const verdict = String(raw.verdict).toLowerCase();
  return {
    score,
    verdict: verdict === 'recommend' || verdict === 'reject' ? verdict : 'consider',
    reason: clip(raw.reason, 500),
    strengths: list(raw.strengths, 4, 200),
    weaknesses: list(raw.weaknesses, 4, 200),
    risks: list(raw.risks, 4, 200),
    checkQuestions: list(raw.checkQuestions, 4, 250),
    summary: clip(raw.summary, 700),
  };
}

/** What is stored on the application (and the session until the application exists). */
export type StoredInterview = { turns: InterviewTurn[]; evaluation: InterviewEvaluation | null; finishedAt: string; skipped?: boolean };

const storedSchema = z.object({
  turns: z.array(z.object({ role: z.enum(['ai', 'candidate']), text: z.string() })),
  evaluation: interviewEvaluationSchema.extend({ verdict: z.enum(['recommend', 'consider', 'reject']) }).nullable(),
  finishedAt: z.string(),
  skipped: z.boolean().optional(),
});

export function storedInterviewOf(value: unknown): StoredInterview | null {
  const parsed = storedSchema.safeParse(value);
  return parsed.success ? (parsed.data as StoredInterview) : null;
}

export function interviewTurnsOf(value: unknown): InterviewTurn[] {
  const parsed = z.array(z.object({ role: z.enum(['ai', 'candidate']), text: z.string() })).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export const candidateAnswersIn = (turns: InterviewTurn[]) => turns.filter((turn) => turn.role === 'candidate').length;

/** 40% test, 60% interview; with only one of them it is that one. */
export function combinedScore(testScore: number | null | undefined, interviewScore: number | null | undefined): number | null {
  const hasTest = typeof testScore === 'number';
  const hasInterview = typeof interviewScore === 'number';
  if (hasTest && hasInterview) return Math.round(0.4 * testScore + 0.6 * interviewScore);
  if (hasInterview) return interviewScore;
  return hasTest ? testScore : null;
}

export type Recommendation = 'HIRE' | 'MAYBE' | 'NO';

/** The traffic light on the HR card: only an interview verdict can make it green or red. */
export function recommendationOf(evaluation: InterviewEvaluation | null, combined: number | null): Recommendation {
  if (!evaluation || combined === null) return 'MAYBE';
  if (evaluation.verdict === 'reject' || combined < 55) return 'NO';
  if (evaluation.verdict === 'recommend' && combined >= 70) return 'HIRE';
  return 'MAYBE';
}
