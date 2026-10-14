import { useState } from 'react';
import { Sparkles, Mic, Square, Loader2, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, send } from '../../lib/api';
import {
  Alert,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui';
import type { Vacancy } from '../../types';
import { useAudioRecorder } from './use-audio-recorder';

export type VacancyDraft = Pick<Vacancy, 'title' | 'description' | 'requirements'>;

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function VacancyGenerator({
  configured,
  disabled,
  apply,
}: {
  configured: boolean;
  disabled: boolean;
  apply: (draft: VacancyDraft) => void;
}) {
  const { t } = useTranslation();
  const [brief, setBrief] = useState('');
  const [language, setLanguage] = useState('uz');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<VacancyDraft | null>(null);
  const [applied, setApplied] = useState(false);
  const [transcribedNotice, setTranscribedNotice] = useState(false);

  const recorder = useAudioRecorder({
    maxDurationSeconds: 90,
    maxSizeBytes: 5 * 1024 * 1024,
    onAudioRecorded: async (blob) => {
      setError('');
      setTranscribedNotice(false);
      try {
        const formData = new FormData();
        formData.append('audio', blob, 'brief.webm');
        formData.append('language', language);
        const result = await api<{ transcript: string }>('/vacancies/transcribe-brief', {
          method: 'POST',
          body: formData,
        });
        if (result.transcript?.trim()) {
          setBrief((prev) => {
            const trimmed = prev.trim();
            return trimmed ? `${trimmed}\n${result.transcript.trim()}` : result.transcript.trim();
          });
          setTranscribedNotice(true);
        }
      } catch (err: any) {
        setError(err?.message || 'Audio transcription failed');
      }
    },
    onError: (errKey) => {
      setError(t(errKey));
    },
  });

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
    <section className="vacancy-generator" aria-label={t('vacancyGenerator.title', 'AI job description generator')}>
      <h3>
        <Sparkles size={17} /> {t('vacancyGenerator.title', 'AI job description generator')}
      </h3>
      <p className="muted small">
        {t('vacancyGenerator.subtitle', 'Describe who you need. Generate sends this brief to Google Gemini and prepares a draft for your review.')}
      </p>

      {/* Voice Recording Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-800/40">
        <div className="flex items-center gap-2">
          {recorder.isRecording ? (
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                {t('vacancyGenerator.recordingTime', 'Recording…')} {formatDuration(recorder.duration)} / 01:30
              </span>
            </div>
          ) : recorder.isTranscribing ? (
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
              <Loader2 className="animate-spin h-3.5 w-3.5" />
              <span>{t('vacancyGenerator.transcribing')}</span>
            </div>
          ) : (
            <span className="text-xs text-slate-500 dark:text-zinc-400">
              {t('vacancyGenerator.recordVoice', 'Record voice')} (max 90s)
            </span>
          )}
        </div>

        <div>
          {recorder.isRecording ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors shadow-sm"
              onClick={recorder.stopRecording}
            >
              <Square size={13} fill="currentColor" /> {t('vacancyGenerator.stopRecording', 'Stop')}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || disabled || !configured || recorder.isTranscribing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 transition-colors shadow-sm disabled:opacity-50"
              onClick={() => void recorder.startRecording()}
            >
              <Mic size={14} className="text-red-500" />
              {t('vacancyGenerator.recordVoice', 'Record voice')}
            </button>
          )}
        </div>
      </div>

      {transcribedNotice && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium px-1">
          <Check size={14} /> {t('vacancyGenerator.audioTranscribed')}
        </div>
      )}

      <label>
        {t('vacancyGenerator.label')}
        <textarea
          value={brief}
          maxLength={3000}
          rows={3}
          placeholder={t('vacancyGenerator.placeholder', 'Middle NestJS developer kerak')}
          disabled={busy || disabled || recorder.isRecording || recorder.isTranscribing}
          onChange={(e) => {
            setBrief(e.target.value);
            setApplied(false);
            setTranscribedNotice(false);
          }}
        />
      </label>
      <label>
        {t('vacancyGenerator.draftLanguage', 'Draft language')}
        <Select value={language} disabled={busy || disabled} onValueChange={setLanguage}>
          <SelectTrigger aria-label={t('vacancyGenerator.draftLanguage', 'Draft language')} className="mt-1 w-full">
            <SelectValue placeholder={t('vacancyGenerator.selectLanguage', 'Select language')} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="uz">O'zbekcha</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ru">Русский</SelectItem>
              <SelectItem value="tg">Тоҷикӣ</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      {!configured && (
        <p className="muted small">
          {t('vacancyGenerator.aiUnavailable', 'AI is unavailable. Configure GEMINI_API_KEY on the backend, or write the vacancy below.')}
        </p>
      )}
      <Alert message={error} />
      <button
        type="button"
        className="secondary"
        disabled={busy || disabled || !configured || brief.trim().length < 5 || recorder.isRecording || recorder.isTranscribing}
        onClick={() => void generate()}
      >
        <Sparkles size={16} />{' '}
        {busy ? t('vacancies.saving', 'Saving…') : t('vacancyGenerator.generateButton')}
      </button>
      {busy && (
        <p role="status" className="muted small">
          {t('vacancyGenerator.preparing', 'Preparing the role description and requirements…')}
        </p>
      )}
      {draft && (
        <div className="vacancy-draft">
          <h4>{draft.title}</h4>
          <p className="vacancy-draft-text">{draft.description}</p>
          <ul>
            {draft.requirements.map((r, i) => (
              <li key={i}>
                <strong>{r.name}</strong> — {r.required ? t('vacancyGenerator.required', 'Required') : t('vacancyGenerator.niceToHave', 'Nice to have')}
                {r.description && <p>{r.description}</p>}
              </li>
            ))}
          </ul>
          <p className="muted small">
            {t('vacancyGenerator.useDraftHelp', 'Use draft replaces the title, description and requirements below. Review and edit them before saving.')}
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
            {t('vacancyGenerator.useDraft')}
          </button>
        </div>
      )}
      {applied && (
        <p role="status" className="muted small">
          {t('vacancyGenerator.draftApplied', 'Draft added to the form. Review it, then choose Save vacancy.')}
        </p>
      )}
    </section>
  );
}
