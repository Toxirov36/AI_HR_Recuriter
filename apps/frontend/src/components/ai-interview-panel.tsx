import { Mic } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui';
import type { AiInterview } from '../types';

/** 40% test, 60% interview, like the backend; with only one of them it is that one. */
export function combinedScore(testScore: number | null | undefined, interviewScore: number | null | undefined): number | null {
  const hasTest = typeof testScore === 'number';
  const hasInterview = typeof interviewScore === 'number';
  if (hasTest && hasInterview) return Math.round(0.4 * testScore + 0.6 * interviewScore);
  if (hasInterview) return interviewScore;
  return hasTest ? testScore : null;
}

type Light = 'HIRE' | 'MAYBE' | 'NO';

/** The traffic light: green only for a recommended interview with a good total, red for a rejection or a low total. */
export function recommendationLight(evaluation: NonNullable<AiInterview['evaluation']> | null, combined: number | null): Light {
  if (!evaluation || combined === null) return 'MAYBE';
  if (evaluation.verdict === 'reject' || combined < 55) return 'NO';
  if (evaluation.verdict === 'recommend' && combined >= 70) return 'HIRE';
  return 'MAYBE';
}

const LIGHT_STYLE: Record<Light, string> = {
  HIRE: 'border-emerald-300 bg-emerald-100 text-emerald-800',
  MAYBE: 'border-amber-300 bg-amber-100 text-amber-900',
  NO: 'border-rose-300 bg-rose-100 text-rose-800',
};

function List({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className={`mb-1 text-xs font-semibold uppercase tracking-wide ${tone}`}>{title}</h4>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** The AI chat interview of a Telegram candidate: verdict, scores, what to check, and the transcript. */
export function AiInterviewPanel({ interview, testScore, candidateName }: { interview: AiInterview; testScore?: number | null; candidateName: string }) {
  const { t } = useTranslation();
  const evaluation = interview.evaluation;
  const combined = combinedScore(testScore, evaluation?.score);
  const light = recommendationLight(evaluation, combined);
  const verdictLabel = {
    HIRE: t('applications.aiInterviewVerdictRecommend', 'Recommended'),
    MAYBE: t('applications.aiInterviewVerdictConsider', 'Needs a closer look'),
    NO: t('applications.aiInterviewVerdictReject', 'Not recommended'),
  }[light];

  return (
    <Accordion type="single" collapsible className="panel mb-4 border-slate-200">
      <AccordionItem value="ai-interview" className="border-b-0">
        <AccordionTrigger className="px-5 py-4 hover:no-underline sm:px-6">
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 pr-3 text-left">
            <div className="flex items-center gap-2.5">
              <Mic size={18} className="shrink-0 text-[#1a5d4c]" aria-hidden="true" />
              <div>
                <h2 className="text-base font-bold leading-tight text-slate-900">{t('applications.aiInterviewTitle', 'AI interview')}</h2>
                <p className="mt-0.5 text-xs font-normal text-slate-500">{t('applications.aiInterviewSubtitle')}</p>
              </div>
            </div>
            {evaluation && (
              <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${LIGHT_STYLE[light]}`}>
                {verdictLabel}
                {combined !== null ? ` · ${combined}%` : ''}
              </span>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="space-y-5 px-5 pb-5 pt-1 sm:px-6">
          {evaluation ? (
            <>
              <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <span className="block text-[10px] font-semibold uppercase text-slate-400">{t('applications.aiInterviewTest', 'Test score')}</span>
                  <strong className="text-base text-slate-800">{typeof testScore === 'number' ? `${testScore}%` : '–'}</strong>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <span className="block text-[10px] font-semibold uppercase text-slate-400">{t('applications.aiInterviewScore', 'Interview score')}</span>
                  <strong className="text-base text-slate-800">{evaluation.score}%</strong>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <span className="block text-[10px] font-semibold uppercase text-slate-400">{t('applications.aiInterviewTotal', 'Overall score')}</span>
                  <strong className="text-base text-emerald-800">{combined !== null ? `${combined}%` : '–'}</strong>
                  <span className="ml-1.5 text-[10px] text-slate-400">{t('applications.aiInterviewTotalHint')}</span>
                </div>
              </div>
              {evaluation.summary && <p className="text-sm text-slate-800">{evaluation.summary}</p>}
              {evaluation.reason && (
                <p className="text-sm text-slate-700">
                  <b>{t('applications.aiInterviewReason', 'Reason')}:</b> {evaluation.reason}
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <List title={t('applications.aiInterviewStrengths', 'Strengths')} items={evaluation.strengths} tone="text-emerald-700" />
                <List title={t('applications.aiInterviewWeaknesses', 'Weaknesses')} items={evaluation.weaknesses} tone="text-amber-700" />
                <List title={t('applications.aiInterviewRisks', 'Risks')} items={evaluation.risks} tone="text-rose-700" />
                <List title={t('applications.aiInterviewCheck', 'Check in person')} items={evaluation.checkQuestions} tone="text-slate-600" />
              </div>
              <p className="text-xs text-slate-500">{t('applications.aiInterviewDisclaimer')}</p>
            </>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {t('applications.aiInterviewNotEvaluated', 'The interview was not evaluated.')}
            </p>
          )}
          {interview.turns.length > 0 && (
            <details className="rounded-xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                {t('applications.aiInterviewTranscript', 'Interview transcript')} ({interview.turns.length})
              </summary>
              <ol className="mt-3 space-y-2 text-sm">
                {interview.turns.map((turn, index) => (
                  <li key={index} className={turn.role === 'ai' ? 'text-slate-600' : 'font-medium text-slate-900'}>
                    <span className="mr-1.5 text-xs font-semibold uppercase text-slate-400">{turn.role === 'ai' ? 'AI' : candidateName}</span>
                    <span className="whitespace-pre-wrap break-words">{turn.text}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
