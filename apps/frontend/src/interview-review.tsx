import { useEffect, useState } from 'react';
import { send } from './api';
import { Alert } from './ui';
import type { Application, InterviewReview } from './types';

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
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    onSaving(true);
    setError('');
    try {
      const result = await send<{ interviewReview: InterviewReview; reviewRevision: number }>(
        `/applications/${application.id}/interview-review`,
        { revision, answers, notes },
        'PUT',
      );
      setRevision(result.reviewRevision);
      setSaved(result.interviewReview);
      setDirty(false);
      onDirty(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
      onSaving(false);
    }
  }
  return (
    <form onSubmit={save} className="interview-review">
      <Alert message={error} />
      <fieldset disabled={saving || disabled}>
        <div className="questions">
          {answers.map((entry, index) => (
            <article key={index}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div className="interview-answer">
                <h3>{entry.question}</h3>
                <p>
                  {currentQuestions.find((q) => q.question === entry.question)?.rationale ??
                    'Saved from an earlier interview guide.'}
                </p>
                <label>
                  Candidate answer
                  <textarea
                    rows={3}
                    maxLength={10000}
                    value={entry.answer}
                    placeholder="Record the candidate’s response…"
                    onChange={(e) => {
                      setAnswers(
                        answers.map((a, i) => (i === index ? { ...a, answer: e.target.value } : a)),
                      );
                      changed();
                    }}
                  />
                </label>
                <label>
                  HR notes
                  <textarea
                    rows={2}
                    maxLength={5000}
                    value={entry.notes}
                    placeholder="Observations and follow-up points…"
                    onChange={(e) => {
                      setAnswers(
                        answers.map((a, i) => (i === index ? { ...a, notes: e.target.value } : a)),
                      );
                      changed();
                    }}
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
        <div className="padded">
          {!answers.length && (
            <p className="muted">
              Generate interview questions to record answers here. You can add general notes now.
            </p>
          )}
          <label>
            Overall interview notes
            <textarea
              rows={4}
              maxLength={10000}
              value={notes}
              placeholder="Summarize the conversation and agreed next steps…"
              onChange={(e) => {
                setNotes(e.target.value);
                changed();
              }}
            />
          </label>
          <div className="row wrap review-save">
            <button className="primary" disabled={saving || !dirty}>
              {saving ? 'Saving notes…' : 'Save interview notes'}
            </button>
            <span className="muted small" role="status">
              {dirty
                ? 'Unsaved changes — save before leaving this page.'
                : saved
                  ? `Saved by ${saved.updatedBy} · ${new Date(saved.updatedAt).toLocaleString()}`
                  : 'No notes saved yet'}
            </span>
          </div>
        </div>
      </fieldset>
    </form>
  );
}
