import { useEffect, useState } from 'react';
import { send } from '../../lib/api';
import { Alert, Badge, Button, Card, Textarea } from '../../components/ui';
import { toast } from 'sonner';
import type { Application, InterviewReview } from '../../types';

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
      toast.success('Interview notes saved successfully!');
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
            <Card key={index} className="p-4 mb-3 border shadow-sm">
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="text-xs font-mono px-2 py-0.5 mt-0.5">
                  {String(index + 1).padStart(2, '0')}
                </Badge>
                <div className="interview-answer flex-1 space-y-3">
                  <div>
                    <h3 className="text-base font-semibold">{entry.question}</h3>
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
                      className="mt-1"
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
                      className="mt-1"
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
        </div>
        <div className="padded">
          {!answers.length && (
            <p className="muted">
              Generate interview questions to record answers here. You can add general notes now.
            </p>
          )}
          <label>
            Overall interview notes
            <Textarea
              rows={4}
              maxLength={10000}
              value={notes}
              placeholder="Summarize the conversation and agreed next steps…"
              className="mt-1"
              onChange={(e) => {
                setNotes(e.target.value);
                changed();
              }}
            />
          </label>
          <div className="row wrap review-save mt-3">
            <Button
              type="submit"
              className="bg-[#245e4f] hover:bg-[#1b4338] text-white"
              disabled={saving || !dirty}
            >
              {saving ? 'Saving notes…' : 'Save interview notes'}
            </Button>
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
