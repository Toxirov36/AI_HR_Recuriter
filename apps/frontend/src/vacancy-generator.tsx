import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { send } from './api';
import { Alert } from './ui';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Vacancy } from './types';
export type VacancyDraft = Pick<Vacancy, 'title' | 'description' | 'requirements'>;

export function VacancyGenerator({
  configured,
  disabled,
  apply,
}: {
  configured: boolean;
  disabled: boolean;
  apply: (draft: VacancyDraft) => void;
}) {
  const [brief, setBrief] = useState('');
  const [language, setLanguage] = useState('uz');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<VacancyDraft | null>(null);
  const [applied, setApplied] = useState(false);
  async function generate() {
    if (busy || disabled || !configured || brief.trim().length < 5) return;
    setBusy(true);
    setError('');
    setApplied(false);
    try {
      const result = await send<VacancyDraft>('/vacancies/generate-description', {
        brief: brief.trim(),
        language,
      });
      setDraft(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="vacancy-generator" aria-label="AI job description generator">
      <h3>
        <Sparkles size={17} /> AI job description generator
      </h3>
      <p className="muted small">
        Describe who you need. Generate sends this brief to Google Gemini and prepares a draft for
        your review.
      </p>
      <label>
        Who are you hiring?
        <textarea
          value={brief}
          maxLength={3000}
          rows={3}
          placeholder="Middle NestJS developer kerak"
          disabled={busy || disabled}
          onChange={(e) => {
            setBrief(e.target.value);
            setApplied(false);
          }}
        />
      </label>
      <label>
        Draft language
        <Select value={language} disabled={busy || disabled} onValueChange={setLanguage}>
          <SelectTrigger aria-label="Draft language" className="mt-1 w-full">
            <SelectValue placeholder="Select language" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="uz">O‘zbekcha</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ru">Русский</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      {!configured && (
        <p className="muted small">
          AI is unavailable. Configure GEMINI_API_KEY on the backend, or write the vacancy below.
        </p>
      )}
      <Alert message={error} />
      <button
        type="button"
        className="secondary"
        disabled={busy || disabled || !configured || brief.trim().length < 5}
        onClick={() => void generate()}
      >
        <Sparkles size={16} />{' '}
        {busy ? 'Writing vacancy…' : draft ? 'Regenerate draft' : 'Generate job description'}
      </button>
      {busy && (
        <p role="status" className="muted small">
          Preparing the role description and requirements…
        </p>
      )}
      {draft && (
        <div className="vacancy-draft">
          <h4>{draft.title}</h4>
          <p className="vacancy-draft-text">{draft.description}</p>
          <ul>
            {draft.requirements.map((r, i) => (
              <li key={i}>
                <strong>{r.name}</strong> — {r.required ? 'Required' : 'Nice to have'}
                {r.description && <p>{r.description}</p>}
              </li>
            ))}
          </ul>
          <p className="muted small">
            Use draft replaces the title, description and requirements below. Review and edit them
            before saving.
          </p>
          <button
            type="button"
            className="primary"
            disabled={busy || disabled}
            onClick={() => {
              apply(draft);
              setApplied(true);
            }}
          >
            Use draft
          </button>
        </div>
      )}
      {applied && (
        <p role="status" className="muted small">
          Draft added to the form. Review it, then choose Save vacancy.
        </p>
      )}
    </section>
  );
}
