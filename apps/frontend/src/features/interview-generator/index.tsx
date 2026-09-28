import { useEffect, useState } from 'react';
import { send } from '../../lib/api';
import { Alert, Badge, Button, Card, Textarea } from '../../components/ui';
import { toast } from 'sonner';
import {
  AlertCircle,
  FileCheck2,
  HelpCircle,
  MessageSquare,
  Scale,
  Sparkles,
} from 'lucide-react';
import { ScorecardSection } from './scorecard-section';
import { DEFAULT_CORE_CRITERIA } from './scorecard-rubric';
import type {
  Application,
  InterviewReview,
  ScorecardCriterion,
  StructuredScorecard,
} from '../../types';

export * from './scorecard-rubric';
export * from './scorecard-criterion-row';
export * from './scorecard-section';

export function InterviewReviewEditor({
  application,
  onDirty,
  onSaving,
  disabled = false,
}: {
  application: Application;
  onDirty: (dirty: boolean) => void;
  onSaving: (saving: boolean) => void;
  disabled?: boolean;
}) {
  const currentQuestions = application.interviewQuestions?.questions ?? [];

  // 1. Answers state for Interview Questions Guide
  const [answers, setAnswers] = useState(() => {
    const saved = application.interviewReview?.answers ?? [];
    return [
      ...currentQuestions.map(
        (q) =>
          saved.find((a) => a.question === q.question) ?? {
            question: q.question,
            answer: '',
            notes: '',
          },
      ),
      ...saved.filter((a) => !currentQuestions.some((q) => q.question === a.question)),
    ];
  });

  // 2. Structured Scorecard state
  const [scorecard, setScorecard] = useState<StructuredScorecard>(() => {
    const saved = application.interviewReview?.scorecard;
    if (saved && saved.criteria && saved.criteria.length > 0) {
      return saved;
    }

    // Initialize from vacancy requirements + default core criteria
    const vacancyRequirements = application.vacancy?.requirements ?? [];
    const technicalCriteria: ScorecardCriterion[] = vacancyRequirements.map((req) => ({
      id: `req-${req.id ?? req.name.toLowerCase().replace(/\s+/g, '-')}`,
      name: req.name,
      category: 'TECHNICAL',
      score: null,
      evidence: '',
    }));

    const coreCriteria: ScorecardCriterion[] = DEFAULT_CORE_CRITERIA.map((core) => ({
      id: core.id,
      name: core.name,
      category: 'CORE',
      score: null,
      evidence: '',
    }));

    return {
      criteria: [...technicalCriteria, ...coreCriteria],
      finalDecision: 'UNDECIDED',
      decisionNotes: '',
    };
  });

  // 3. UI states & overall notes
  const [activeTab, setActiveTab] = useState<'scorecard' | 'questions'>('scorecard');
  const [invalidCriterionIds, setInvalidCriterionIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState(application.interviewReview?.notes ?? '');
  const [revision, setRevision] = useState(application.reviewRevision);
  const [saved, setSaved] = useState(application.interviewReview);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const changed = () => {
    setDirty(true);
    onDirty(true);
  };

  const handleScorecardChange = (updated: StructuredScorecard) => {
    setScorecard(updated);
    // Clear validation errors for criteria that now have valid evidence
    if (invalidCriterionIds.size > 0) {
      const remainingInvalid = new Set<string>();
      for (const c of updated.criteria) {
        if (c.score !== null && c.score !== undefined && c.score >= 1 && c.evidence.trim().length < 3) {
          remainingInvalid.add(c.id);
        }
      }
      setInvalidCriterionIds(remainingInvalid);
    }
    changed();
  };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    // Strict Validation: Every scored criterion MUST have non-empty evidence
    const invalid = new Set<string>();
    for (const c of scorecard.criteria) {
      if (c.score !== null && c.score !== undefined && c.score >= 1) {
        if (c.evidence.trim().length < 3) {
          invalid.add(c.id);
        }
      }
    }

    if (invalid.size > 0) {
      setInvalidCriterionIds(invalid);
      setActiveTab('scorecard');
      const errText =
        'Interviewer ball qo‘yganda dalil yoki izoh yozishi majburiy! Iltimos, belgilangan barcha mezonlarga dalil yozing.';
      setError(errText);
      toast.error(errText);
      return;
    }

    setSaving(true);
    onSaving(true);

    try {
      const result = await send<{ interviewReview: InterviewReview; reviewRevision: number }>(
        `/applications/${application.id}/interview-review`,
        { revision, answers, notes, scorecard },
        'PUT',
      );
      setRevision(result.reviewRevision);
      setSaved(result.interviewReview);
      setDirty(false);
      onDirty(false);
      setInvalidCriterionIds(new Set());
      toast.success('Interview scorecard va eslatmalar muvaffaqiyatli saqlandi!');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
      onSaving(false);
    }
  }

  const scoredCount = scorecard.criteria.filter(
    (c) => c.score !== null && c.score !== undefined && c.score >= 1,
  ).length;

  return (
    <form onSubmit={save} className="interview-review space-y-6">
      <Alert message={error} />

      <fieldset disabled={saving || disabled} className="space-y-6">
        {/* Section 1: Structured Scorecard */}
        <div className="space-y-4">
          <ScorecardSection
            scorecard={scorecard}
            disabled={saving || disabled}
            invalidCriterionIds={invalidCriterionIds}
            onChange={handleScorecardChange}
          />
        </div>

        {/* Section 2: Questions & Answers Guide */}
        <div className="space-y-3 pt-4 border-t dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare size={18} className="text-[#245e4f] dark:text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Savollar va Javoblar (Interview Guide Q&A)
              </h3>
              {answers.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {answers.length} ta savol
                </Badge>
              )}
            </div>
          </div>

          <div className="questions space-y-3">
            {answers.map((entry, index) => (
              <Card key={index} className="p-4 border shadow-sm space-y-3">
                <div className="flex items-start gap-3">
                  <Badge variant="outline" className="text-xs font-mono px-2 py-0.5 mt-0.5">
                    {String(index + 1).padStart(2, '0')}
                  </Badge>
                  <div className="interview-answer flex-1 space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold">{entry.question}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {currentQuestions.find((q) => q.question === entry.question)?.rationale ??
                          'Saved from an earlier interview guide.'}
                      </p>
                    </div>

                    <label className="block text-xs font-medium">
                      Candidate answer
                      <Textarea
                        rows={3}
                        maxLength={10000}
                        value={entry.answer}
                        placeholder="Record the candidate's response…"
                        className="mt-1 text-xs"
                        onChange={(e) => {
                          setAnswers(
                            answers.map((a, i) => (i === index ? { ...a, answer: e.target.value } : a)),
                          );
                          changed();
                        }}
                      />
                    </label>

                    <label className="block text-xs font-medium">
                      HR notes
                      <Textarea
                        rows={2}
                        maxLength={5000}
                        value={entry.notes}
                        placeholder="Observations and follow-up points…"
                        className="mt-1 text-xs"
                        onChange={(e) => {
                          setAnswers(
                            answers.map((a, i) => (i === index ? { ...a, notes: e.target.value } : a)),
                          );
                          changed();
                        }}
                      />
                    </label>
                  </div>
                </div>
              </Card>
            ))}

            {!answers.length && (
              <p className="text-xs text-slate-500 italic p-4 bg-slate-50 rounded border">
                Savollar ro‘yxati hozircha bo‘sh. Yuqoridagi savollar generatori orqali savollar yaratishingiz mumkin.
              </p>
            )}
          </div>
        </div>

        {/* Section 3: Overall Interview Notes */}
        <div className="pt-4 border-t dark:border-slate-800 space-y-2">
          <label
            htmlFor="overall-interview-notes"
            className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
          >
            Overall interview notes
          </label>
          <Textarea
            id="overall-interview-notes"
            aria-label="Overall interview notes"
            rows={3}
            maxLength={10000}
            value={notes}
            placeholder="Summarize the conversation and agreed next steps…"
            className="text-xs resize-y"
            onChange={(e) => {
              setNotes(e.target.value);
              changed();
            }}
          />
        </div>

        {/* Save Footer & Attribution */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t dark:border-slate-800">
          <Button
            type="submit"
            className="bg-[#245e4f] hover:bg-[#1b4338] text-white text-xs px-5 py-2 font-medium"
            disabled={saving || !dirty}
          >
            {saving ? 'Saving notes…' : 'Save interview notes'}
          </Button>

          <span className="text-xs text-slate-500" role="status">
            {dirty ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                Unsaved changes — save before leaving this page.
              </span>
            ) : saved ? (
              <span>
                Saved by {saved.updatedBy} ·{' '}
                {new Date(saved.updatedAt).toLocaleString()}
              </span>
            ) : (
              'No notes saved yet'
            )}
          </span>
        </div>
      </fieldset>
    </form>
  );
}
