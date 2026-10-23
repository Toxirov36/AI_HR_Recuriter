import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, send } from '../../lib/api';
import { Button, Input, Modal, Textarea } from '../../components/ui';
import type { AssessmentQuestion, AssessmentView, Vacancy } from '../../types';

/** HR reviews, edits and approves the AI-drafted candidate test; the bot only uses an approved test. */
export function AssessmentModal({ vacancy, close }: { vacancy: Vacancy; close: () => void }) {
  const { t } = useTranslation();
  const [view, setView] = useState<AssessmentView | null>(null);
  const [draft, setDraft] = useState<AssessmentQuestion[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const base = `/vacancies/${vacancy.id}/assessment`;

  const apply = useCallback((next: AssessmentView) => {
    setView(next);
    setDraft(next.questions ?? []);
    setCustom(next.customQuestions ?? []);
    setDirty(false);
  }, []);

  useEffect(() => {
    api<AssessmentView>(base).then(apply).catch((cause: Error) => setError(cause.message));
  }, [base, apply]);

  async function run(work: () => Promise<AssessmentView>, success?: string, closeAfter = false) {
    setBusy(true);
    setError('');
    try {
      apply(await work());
      if (success) toast.success(success);
      if (closeAfter) close();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const cleanCustom = custom.map((text) => text.trim()).filter(Boolean);
  const saveDraft = () => send<AssessmentView>(base, { questions: draft, customQuestions: cleanCustom }, 'PUT');

  function change(index: number, patch: Partial<AssessmentQuestion>) {
    setDraft((current) => current.map((question, i) => (i === index ? { ...question, ...patch } : question)));
    setDirty(true);
  }

  function changeCustom(index: number, value: string) {
    setCustom((current) => current.map((text, i) => (i === index ? value : text)));
    setDirty(true);
  }

  function changeOption(index: number, option: number, value: string) {
    setDraft((current) =>
      current.map((question, i) => (i === index ? { ...question, options: question.options.map((text, o) => (o === option ? value : text)) } : question)),
    );
    setDirty(true);
  }

  const state = view?.state ?? 'NONE';
  const hasDraft = state === 'PENDING' || state === 'APPROVED';
  const customValid = custom.length <= 5 && custom.every((text) => text.trim().length === 0 || text.trim().length >= 5);
  const complete =
    customValid && draft.length === 10 && draft.every((q) => q.question.trim().length >= 5 && q.explanation.trim().length >= 5 && q.options.every((o) => o.trim()));

  return (
    <Modal title={t('vacancies.assessmentTitle')} subtitle={vacancy.title} close={close} className="max-w-[820px]">
      <div className="space-y-4 overflow-y-auto pr-1 text-sm">
        {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
        <p className="rounded-lg bg-slate-50 p-3 text-slate-600">{t('vacancies.assessmentIntro')}</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${state === 'APPROVED' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}
          >
            {t(`vacancies.assessmentState${state}`)}
          </span>
          <Button type="button" variant="outline" disabled={busy || !view} onClick={() => void run(() => send<AssessmentView>(`${base}/generate`, {}), t('vacancies.assessmentGenerated'))}>
            {hasDraft ? t('vacancies.assessmentRegenerate') : t('vacancies.assessmentGenerate')}
          </Button>
        </div>

        {hasDraft &&
          draft.map((question, index) => (
            <section key={question.id} className="space-y-2 rounded-xl border border-slate-200 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {index + 1}. {question.type === 'HARD_SKILL' ? t('vacancies.assessmentHard') : t('vacancies.assessmentSoft')}
              </h3>
              <Textarea
                className="min-h-0 text-sm font-medium"
                aria-label={`${t('vacancies.assessmentQuestion')} ${index + 1}`}
                value={question.question}
                rows={2}
                onChange={(event) => change(index, { question: event.target.value })}
              />
              <div className="space-y-1.5" role="radiogroup" aria-label={`${t('vacancies.assessmentCorrect')} ${index + 1}`}>
                {question.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-center gap-2">
                    <input
                      type="radio"
                      className="h-4 w-4 shrink-0 cursor-pointer accent-emerald-700"
                      name={`correct-${question.id}`}
                      checked={question.correctIndex === optionIndex}
                      title={t('vacancies.assessmentCorrect')}
                      aria-label={`${t('vacancies.assessmentCorrect')} ${index + 1}.${'ABCD'[optionIndex]}`}
                      onChange={() => change(index, { correctIndex: optionIndex })}
                    />
                    <span className="w-4 shrink-0 text-center text-xs font-semibold text-slate-500">{'ABCD'[optionIndex]}</span>
                    <Input
                      className="h-9 min-w-0 flex-1 text-sm font-normal"
                      aria-label={`${index + 1}.${'ABCD'[optionIndex]}`}
                      value={option}
                      onChange={(event) => changeOption(index, optionIndex, event.target.value)}
                    />
                  </div>
                ))}
              </div>
              <Textarea
                className="min-h-0 text-xs font-normal text-slate-600"
                placeholder={t('vacancies.assessmentExplanation')}
                aria-label={`${t('vacancies.assessmentExplanation')} ${index + 1}`}
                value={question.explanation}
                rows={2}
                onChange={(event) => change(index, { explanation: event.target.value })}
              />
            </section>
          ))}

        {hasDraft && (
          <section className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4" aria-label={t('vacancies.customQuestionsTitle')}>
            <div>
              <h3 className="text-sm font-semibold">
                {t('vacancies.customQuestionsTitle')} ({cleanCustom.length}/5)
              </h3>
              <p className="muted small">{t('vacancies.customQuestionsHint')}</p>
            </div>
            {custom.map((text, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className="mt-2 w-5 shrink-0 text-center text-xs font-semibold text-slate-500">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <Textarea
                    className="min-h-0 text-sm"
                    rows={2}
                    maxLength={500}
                    placeholder={t('vacancies.customQuestionPlaceholder')}
                    aria-label={`${t('vacancies.customQuestionsTitle')} ${index + 1}`}
                    value={text}
                    onChange={(event) => changeCustom(index, event.target.value)}
                  />
                  {text.trim().length > 0 && text.trim().length < 5 && <small className="text-red-700">{t('vacancies.customQuestionShort')}</small>}
                </div>
                <button
                  type="button"
                  className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700"
                  aria-label={`${t('vacancies.customQuestionRemove')} ${index + 1}`}
                  title={t('vacancies.customQuestionRemove')}
                  onClick={() => {
                    setCustom((current) => current.filter((_, i) => i !== index));
                    setDirty(true);
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            {custom.length < 5 && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#1a5d4c] bg-white px-3.5 py-2 text-sm font-semibold text-[#1a5d4c] hover:bg-emerald-50"
                onClick={() => {
                  setCustom((current) => [...current, '']);
                  setDirty(true);
                }}
              >
                <Plus size={15} /> {t('vacancies.customQuestionAdd')}
              </button>
            )}
          </section>
        )}

        {hasDraft && (
          <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
            {dirty && <span className="mr-auto self-center text-xs text-amber-800">{t('vacancies.assessmentUnsaved')}</span>}
            <Button type="button" variant="outline" disabled={busy || !dirty || !complete} onClick={() => void run(saveDraft, t('vacancies.assessmentSaved'))}>
              {t('common.save', 'Saqlash')}
            </Button>
            <Button
              type="button"
              disabled={busy || !complete || (state === 'APPROVED' && !dirty)}
              onClick={() =>
                void run(async () => {
                  if (dirty) await saveDraft();
                  return send<AssessmentView>(`${base}/approve`, {});
                }, t('vacancies.assessmentApproved'), true)
              }
            >
              {t('vacancies.assessmentApprove')}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
