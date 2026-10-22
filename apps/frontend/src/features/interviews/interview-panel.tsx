import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarClock, CalendarDays, Check, Copy, Hourglass, MapPin, Video } from 'lucide-react';
import { toast } from 'sonner';
import { send } from '../../lib/api';
import {
  Alert,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  useData,
} from '../../components/ui';
import type { Interview, Stage } from '../../types';
import { formatInterviewTime } from './format';
import { ScheduleInterviewDialog } from './schedule-interview-dialog';

type Props = { applicationId: number; status: Stage; onChanged?: () => void };

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-[15px] text-slate-800">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-slate-500">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** The interview of one application: its state, the proposed or confirmed time, and the actions on it. */
export function InterviewPanel({ applicationId, status, onChanged }: Props) {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { data: interviews, error, reload } = useData<Interview[]>(`/applications/${applicationId}/interviews`);
  const [dialog, setDialog] = useState<'new' | 'reschedule' | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const [copied, setCopied] = useState(false);

  const active = interviews?.find((interview) => interview.status !== 'CANCELLED');
  const closed = status === 'REJECTED' || status === 'HIRED';

  // The pipeline menu links here with ?schedule=1.
  useEffect(() => {
    if (params.get('schedule') && interviews && !active && !closed) {
      setDialog('new');
      const next = new URLSearchParams(params);
      next.delete('schedule');
      setParams(next, { replace: true });
    }
  }, [params, interviews, active, closed, setParams]);

  async function cancel() {
    if (!active) return;
    setActionError('');
    try {
      await send(`/interviews/${active.id}/cancel`, {}, 'PUT');
      toast.success(t('interviews.cancelledToast', 'Interview cancelled'));
      reload();
      onChanged?.();
    } catch (cause) {
      setActionError((cause as Error).message);
    } finally {
      setCancelOpen(false);
    }
  }

  async function copyMeet(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const time = (iso: string, zone: string) => formatInterviewTime(iso, zone, i18n.language);
  const confirmedSlot = active?.slots.find((slot) => slot.id === active.confirmedSlotId);
  const confirmed = active?.status === 'CONFIRMED';
  const statusText = confirmed
    ? t('interviews.statusConfirmed', 'Confirmed')
    : active?.declinedAt
      ? t('interviews.statusDeclined', 'The candidate asked for other times')
      : t('interviews.statusProposed', 'Waiting for the candidate');

  return (
    <section className="panel padded" id="interview">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2.5">
            <CalendarClock size={20} className="text-[#1a5d4c]" /> {t('interviews.panelTitle', 'Interview')}
          </h2>
          <p className="muted mt-1">{t('interviews.panelDesc', 'Propose times; the candidate picks one.')}</p>
        </div>
        {!active && !closed && interviews && (
          <Button type="button" onClick={() => setDialog('new')}>
            {t('interviews.scheduleButton', 'Schedule interview')}
          </Button>
        )}
      </div>
      <Alert message={error || actionError} />
      {interviews && !active && <p className="muted mt-5">{t('interviews.empty', 'No interview scheduled yet.')}</p>}

      {active && (
        <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
                confirmed ? 'bg-emerald-100 text-emerald-800' : active.declinedAt ? 'bg-amber-100 text-amber-900' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {confirmed ? <Check size={14} /> : <Hourglass size={14} />} {statusText}
            </span>
            <span className="text-sm text-slate-600">
              {active.mode === 'ONLINE' ? t('interviews.online', 'Online (Google Meet)') : t('interviews.offline', 'Offline (in person)')} ·{' '}
              {t('interviews.minutes', { count: active.durationMinutes, defaultValue: `${active.durationMinutes} min` })}
            </span>
          </div>

          {confirmed && confirmedSlot ? (
            <Row icon={<CalendarDays size={18} />}>
              <span className="text-slate-500">{t('interviews.confirmedTime', 'Confirmed time')}:</span>{' '}
              <b>{time(confirmedSlot.startsAt, active.timezone)}</b> <span className="text-slate-500">({active.timezone})</span>
            </Row>
          ) : (
            <Row icon={<CalendarDays size={18} />}>
              <p className="mb-1.5 text-slate-500">{t('interviews.slots', 'Proposed times')}:</p>
              <ul className="grid gap-1.5">
                {active.slots.map((slot) => (
                  <li key={slot.id} className="font-medium">
                    {time(slot.startsAt, active.timezone)}
                  </li>
                ))}
              </ul>
              {active.declineNote && <p className="mt-3 rounded-lg bg-white p-3 text-slate-600 ring-1 ring-slate-200">“{active.declineNote}”</p>}
            </Row>
          )}

          {active.mode === 'ONLINE' && active.meetUrl && (
            <Row icon={<Video size={18} />}>
              <div className="flex flex-wrap items-center gap-2.5">
                <a
                  href={active.meetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#1a5d4c] px-4 py-2.5 text-sm font-semibold text-white no-underline shadow-sm transition-colors hover:bg-[#154a3d]"
                >
                  <Video size={16} /> {t('interviews.joinMeet', 'Join Google Meet')}
                </a>
                <button
                  type="button"
                  onClick={() => void copyMeet(active.meetUrl!)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? t('interviews.copied', 'Copied') : t('interviews.copyLink', 'Copy link')}
                </button>
              </div>
              <p className="mt-2 break-all text-sm text-slate-500">{active.meetUrl}</p>
            </Row>
          )}
          {active.mode === 'OFFLINE' && active.location && (
            <Row icon={<MapPin size={18} />}>
              <span className="font-medium">{active.location}</span>
            </Row>
          )}

          <div className="mt-2 flex flex-wrap gap-3 border-t border-slate-200 pt-5">
            <Button type="button" variant="outline" onClick={() => setDialog('reschedule')}>
              {t('interviews.reschedule', 'Propose new times')}
            </Button>
            <Button type="button" variant="outline" onClick={() => setCancelOpen(true)}>
              {t('interviews.cancel', 'Cancel interview')}
            </Button>
          </div>
        </div>
      )}

      {dialog && (
        <ScheduleInterviewDialog
          applicationId={applicationId}
          existing={dialog === 'reschedule' ? active : undefined}
          close={() => setDialog(null)}
          saved={() => {
            reload();
            onChanged?.();
          }}
        />
      )}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('interviews.cancelConfirmTitle', 'Cancel this interview?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('interviews.cancelConfirmDesc', 'The candidate is notified and the calendar event is removed.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('interviews.keep', 'Keep it')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void cancel()}>{t('interviews.cancel', 'Cancel interview')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
