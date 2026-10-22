import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { send } from '../../lib/api';
import { Alert, DateTimePicker, FormSelect, Input, Modal, useData } from '../../components/ui';
import type { GoogleCalendarStatus, Interview, InterviewMode, InterviewProposal } from '../../types';
import { defaultSlotValue } from './format';

const MAX_SLOTS = 5;

type Props = {
  applicationId: number;
  /** An existing interview that is being given new times. */
  existing?: Interview;
  close: () => void;
  saved: () => void;
};

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-800">
        {label}
      </label>
      {children}
    </div>
  );
}

export function ScheduleInterviewDialog({ applicationId, existing, close, saved }: Props) {
  const { t, i18n } = useTranslation();
  const { data: google } = useData<GoogleCalendarStatus>('/integrations/google-calendar/status');
  const [mode, setMode] = useState<InterviewMode>(existing?.mode ?? 'ONLINE');
  const [slots, setSlots] = useState<string[]>([defaultSlotValue(24), defaultSlotValue(48)]);
  const [duration, setDuration] = useState(String(existing?.durationMinutes ?? 30));
  const [location, setLocation] = useState(existing?.location ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InterviewProposal | null>(null);

  const needsGoogle = mode === 'ONLINE' && google !== undefined && !google.connected;
  const filled = slots.filter(Boolean);

  function setSlot(index: number, value: string) {
    setSlots((current) => current.map((slot, i) => (i === index ? value : slot)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!filled.length || filled.some((value) => Number.isNaN(new Date(value).getTime()) || new Date(value).getTime() <= Date.now())) {
      setError(t('interviews.errorTimes', 'Add at least one time in the future.'));
      return;
    }
    if (mode === 'OFFLINE' && location.trim().length < 3) {
      setError(t('interviews.errorAddress', 'Enter the address of the meeting.'));
      return;
    }
    setBusy(true);
    try {
      const body = {
        mode,
        slots: filled.map((value) => new Date(value).toISOString()),
        durationMinutes: Number(duration),
        ...(mode === 'OFFLINE' ? { location: location.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      const proposal = existing
        ? await send<InterviewProposal>(`/interviews/${existing.id}/schedule`, body, 'PUT')
        : await send<InterviewProposal>(`/applications/${applicationId}/interviews`, body);
      setResult(proposal);
      toast.success(t('interviews.sent', 'Times sent to the candidate'));
      saved();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (result) return <SentStep result={result} close={close} />;

  return (
    <Modal
      title={existing ? t('interviews.rescheduleTitle', 'Propose new times') : t('interviews.dialogTitle', 'Schedule an interview')}
      subtitle={t('interviews.dialogDesc', 'Choose the format and propose up to 5 times. The candidate picks one.')}
      close={close}
      className="application-modal-custom"
    >
      <form onSubmit={submit} className="flex min-h-0 flex-col gap-6 overflow-y-auto px-1 pb-1 pt-2">
        <Alert message={error} />
        <Field label={t('interviews.format', 'Format')} htmlFor="interview-mode">
          <FormSelect
            id="interview-mode"
            value={mode}
            onChange={(value) => setMode(value as InterviewMode)}
            options={[
              { value: 'ONLINE', label: t('interviews.online', 'Online (Google Meet)') },
              { value: 'OFFLINE', label: t('interviews.offline', 'Offline (in person)') },
            ]}
          />
        </Field>
        {needsGoogle && (
          <div role="note" className="-mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {google?.configured ? (
              <>
                {t('interviews.googleRequired', 'Connect your Google Calendar to create Google Meet interviews.')}{' '}
                <Link to="/profile" className="font-semibold underline">
                  {t('interviews.openProfile', 'Open profile')}
                </Link>
              </>
            ) : (
              t('interviews.googleNotConfigured', 'Google Calendar is not configured on this server.')
            )}
          </div>
        )}
        {mode === 'OFFLINE' && (
          <Field label={t('interviews.address', 'Address')} htmlFor="interview-location">
            <Input
              id="interview-location"
              value={location}
              maxLength={300}
              placeholder={t('interviews.addressPlaceholder', 'City, street, office, floor')}
              onChange={(event) => setLocation(event.target.value)}
            />
          </Field>
        )}
        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-semibold text-slate-800">{t('interviews.slots', 'Proposed times')}</legend>
          {slots.map((slot, index) => (
            <div className="flex items-center gap-2" key={index}>
              <DateTimePicker
                value={slot}
                onChange={(value) => setSlot(index, value)}
                language={i18n.language}
                placeholder={t('interviews.pickDate', 'Pick a date')}
                ariaLabel={t('interviews.slotN', { n: index + 1, defaultValue: `Time ${index + 1}` })}
              />
              {slots.length > 1 && (
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  aria-label={t('interviews.removeSlot', 'Remove time')}
                  onClick={() => setSlots((current) => current.filter((_, i) => i !== index))}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
          {slots.length < MAX_SLOTS && (
            <button
              type="button"
              className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-[#1a5d4c] hover:underline"
              onClick={() => setSlots((current) => [...current, defaultSlotValue(24 * (current.length + 1))])}
            >
              <Plus size={15} /> {t('interviews.addSlot', 'Add another time')}
            </button>
          )}
        </fieldset>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label={t('interviews.duration', 'Duration')} htmlFor="interview-duration">
            <FormSelect
              id="interview-duration"
              value={duration}
              onChange={setDuration}
              options={[15, 30, 45, 60, 90, 120].map((minutes) => ({ value: String(minutes), label: t('interviews.minutes', { count: minutes, defaultValue: `${minutes} min` }) }))}
            />
          </Field>
          <Field label={t('interviews.note', 'Note for the candidate (optional)')} htmlFor="interview-note">
            <Input id="interview-note" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </div>
        <div className="modal-footer-actions mt-1 border-t border-slate-100 pt-5">
          <button type="button" className="btn-modal-cancel" onClick={close}>
            {t('common.cancel', 'Cancel')}
          </button>
          <button type="submit" className="btn-modal-submit" disabled={busy || needsGoogle || !filled.length}>
            {busy ? t('interviews.sending', 'Sending…') : t('interviews.send', 'Send to candidate')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SentStep({ result, close }: { result: InterviewProposal; close: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const delivered = result.delivery.telegramSent || result.delivery.emailSent;
  async function copy() {
    try {
      await navigator.clipboard.writeText(result.shareUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Modal title={t('interviews.sent', 'Times sent to the candidate')} close={close} className="application-modal-custom">
      <div className="flex flex-col gap-5 pt-2">
        {delivered ? (
          <p className="text-sm text-slate-700">
            {t('interviews.deliveredVia', 'Delivered via')}{' '}
            <b>{[result.delivery.telegramSent && 'Telegram', result.delivery.emailSent && 'Email'].filter(Boolean).join(' + ')}</b>.
          </p>
        ) : (
          <Alert message={t('interviews.deliveryFailed', 'Could not be delivered automatically. Copy the link and send it to the candidate yourself.')} />
        )}
        <div className="flex items-center gap-2">
          <Input readOnly value={result.shareUrl} aria-label={t('interviews.link', 'Candidate link')} onFocus={(event) => event.currentTarget.select()} />
          <button type="button" className="btn-modal-cancel inline-flex shrink-0 items-center gap-1.5" onClick={() => void copy()}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? t('interviews.copied', 'Copied') : t('interviews.copyLink', 'Copy link')}
          </button>
        </div>
        <div className="modal-footer-actions border-t border-slate-100 pt-5">
          <button type="button" className="btn-modal-submit" onClick={close}>
            {t('interviews.done', 'Done')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
