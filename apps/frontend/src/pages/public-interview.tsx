import { useEffect, useState } from 'react';
import { CalendarCheck, Layers3, MapPin, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, send } from '../lib/api';
import { formatInterviewTime } from '../features/interviews/format';
import { Alert, Button, Input, LanguageSwitcher, Loading } from '../components/ui';
import type { PublicInterview } from '../types';

/** The page a candidate opens from the interview link: pick one of the proposed times, or ask for others. */
export function PublicInterviewPage() {
  const { t, i18n } = useTranslation();
  const token = window.location.pathname.split('/')[2] ?? '';
  const [interview, setInterview] = useState<PublicInterview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');
  const [requested, setRequested] = useState(false);
  const base = `/public/interviews/${encodeURIComponent(token)}`;

  useEffect(() => {
    void api<PublicInterview>(base)
      .then(setInterview)
      .catch((cause) => setError((cause as Error).message))
      .finally(() => setLoading(false));
  }, [base]);

  async function confirm(slotId: number) {
    setBusy(true);
    setError('');
    try {
      setInterview(await send<PublicInterview>(`${base}/confirm`, { slotId }));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true);
    setError('');
    try {
      setInterview(await send<PublicInterview>(`${base}/decline`, note.trim() ? { note: note.trim() } : {}));
      setRequested(true);
      setDeclining(false);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const when = (iso: string) => (interview ? formatInterviewTime(iso, interview.timezone, i18n.language) : iso);

  return (
    <div className="min-h-screen bg-[color:var(--brand-page)] text-[color:var(--text-ink)]">
      <header className="border-b border-[color:var(--brand-line-soft)] bg-white px-5 py-4 sm:px-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-3 text-xl font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--brand-fill)] text-white">
              <Layers3 size={20} />
            </span>
            shortlist<span className="-ml-3 text-[color:var(--brand-dot)]">.</span>
          </div>
          <LanguageSwitcher variant="compact" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-10">
        {loading && <Loading />}
        {!loading && !interview && <Alert message={error || t('interviews.notFound', 'This link is not valid.')} />}
        {interview && (
          <div className="rounded-2xl border border-[color:var(--brand-line-soft)] bg-white p-6 shadow-sm sm:p-8 text-[color:var(--text-ink)]">
            <h1 className="text-2xl font-bold">{t('interviews.pageTitle', 'Interview invitation')}</h1>
            <p className="mt-2 text-slate-600">
              {t('interviews.pageIntro', { company: interview.companyName, vacancy: interview.vacancyTitle, defaultValue: `${interview.companyName} invites you to an interview for ${interview.vacancyTitle}.` })}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {interview.mode === 'ONLINE' ? t('interviews.online', 'Online') : t('interviews.offline', 'Offline (in person)')} ·{' '}
              {t('interviews.durationNote', { minutes: interview.durationMinutes, timezone: interview.timezone, defaultValue: `${interview.durationMinutes} min · ${interview.timezone}` })}
            </p>
            {interview.mode === 'OFFLINE' && interview.location && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-700">
                <MapPin size={15} /> {interview.location}
                {interview.mapUrl && (
                  <a className="ml-2 font-semibold text-[color:var(--brand-icon)] underline" href={interview.mapUrl} target="_blank" rel="noreferrer">
                    {t('interviews.openMap', 'Open on map')}
                  </a>
                )}
              </p>
            )}
            {interview.note && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{interview.note}</p>}
            <div className="mt-5">
              <Alert message={error} />
            </div>

            {interview.status === 'CANCELLED' && <p className="mt-6 font-medium">{t('interviews.gone', 'This interview was cancelled.')}</p>}

            {interview.status === 'CONFIRMED' && interview.confirmed && (
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="flex items-center gap-2 font-semibold text-emerald-900">
                  <CalendarCheck size={18} /> {t('interviews.confirmedTitle', 'Your interview is confirmed')}
                </p>
                <p className="mt-2">
                  {t('interviews.confirmedWhen', 'When')}: <b>{when(interview.confirmed.startsAt)}</b>
                </p>
                {interview.mode === 'ONLINE' && interview.confirmed.meetUrl && (
                  <a className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[color:var(--brand-solid)] px-4 py-2 font-semibold text-white" href={interview.confirmed.meetUrl} target="_blank" rel="noreferrer">
                    <Video size={16} /> {t('interviews.joinMeet', 'Join the meeting')}
                  </a>
                )}
                {interview.mode === 'OFFLINE' && interview.confirmed.location && (
                  <p className="mt-2 flex items-center gap-1.5">
                    <MapPin size={15} /> {interview.confirmed.location}
                    {(interview.confirmed.mapUrl ?? interview.mapUrl) && (
                      <a className="ml-2 font-semibold text-[color:var(--brand-icon)] underline" href={(interview.confirmed.mapUrl ?? interview.mapUrl) as string} target="_blank" rel="noreferrer">
                        {t('interviews.openMap', 'Open on map')}
                      </a>
                    )}
                  </p>
                )}
              </div>
            )}

            {interview.status === 'PROPOSED' && (
              <div className="mt-6">
                {interview.declined || requested ? (
                  <p className="font-medium">{requested ? t('interviews.requestSent', 'Thanks! HR will send you new times.') : t('interviews.waitingNew', 'You asked for other times. HR will contact you.')}</p>
                ) : interview.slots.length ? (
                  <>
                    <h2 className="text-lg font-semibold">{t('interviews.chooseTime', 'Choose a time that suits you')}</h2>
                    <ul className="mt-3 grid gap-2">
                      {interview.slots.map((slot) => (
                        <li key={slot.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                          <span className="font-medium">{when(slot.startsAt)}</span>
                          <Button type="button" disabled={busy} onClick={() => void confirm(slot.id)}>
                            {t('interviews.confirmButton', 'Confirm')}
                          </Button>
                        </li>
                      ))}
                    </ul>
                    {declining ? (
                      <div className="mt-4 grid gap-2">
                        <Input value={note} maxLength={500} placeholder={t('interviews.declineNotePlaceholder', 'Tell HR what suits you better (optional)')} onChange={(event) => setNote(event.target.value)} />
                        <div className="flex gap-2">
                          <Button type="button" disabled={busy} onClick={() => void decline()}>
                            {t('interviews.sendRequest', 'Send request')}
                          </Button>
                          <Button type="button" variant="outline" onClick={() => setDeclining(false)}>
                            {t('common.cancel', 'Cancel')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" className="mt-4 text-sm underline" onClick={() => setDeclining(true)}>
                        {t('interviews.noneFit', 'None of these times work for me')}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="font-medium">{t('interviews.noSlots', 'No times are available right now. HR will send new ones.')}</p>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
