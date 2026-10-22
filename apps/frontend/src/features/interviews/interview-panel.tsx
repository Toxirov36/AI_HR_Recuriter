import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarClock, ExternalLink, MapPin, Video } from 'lucide-react';
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

/** The interview of one application: its state, the proposed or confirmed time, and the actions on it. */
export function InterviewPanel({ applicationId, status, onChanged }: Props) {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { data: interviews, error, reload } = useData<Interview[]>(`/applications/${applicationId}/interviews`);
  const [dialog, setDialog] = useState<'new' | 'reschedule' | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [actionError, setActionError] = useState('');

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

  const time = (iso: string, zone: string) => formatInterviewTime(iso, zone, i18n.language);
  const confirmedSlot = active?.slots.find((slot) => slot.id === active.confirmedSlotId);

  return (
    <section className="panel padded" id="interview">
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2>
            <CalendarClock size={18} style={{ verticalAlign: '-3px' }} /> {t('interviews.panelTitle', 'Interview')}
          </h2>
          <p className="muted">{t('interviews.panelDesc', 'Propose times; the candidate picks one.')}</p>
        </div>
        {!active && !closed && interviews && (
          <Button type="button" onClick={() => setDialog('new')}>
            {t('interviews.scheduleButton', 'Schedule interview')}
          </Button>
        )}
      </div>
      <Alert message={error || actionError} />
      {interviews && !active && <p className="muted">{t('interviews.empty', 'No interview scheduled yet.')}</p>}
      {active && (
        <div className="interview-details">
          <p>
            <strong>
              {active.status === 'CONFIRMED'
                ? t('interviews.statusConfirmed', 'Confirmed')
                : active.declinedAt
                  ? t('interviews.statusDeclined', 'The candidate asked for other times')
                  : t('interviews.statusProposed', 'Waiting for the candidate')}
            </strong>{' '}
            · {active.mode === 'ONLINE' ? t('interviews.online', 'Online (Google Meet)') : t('interviews.offline', 'Offline (in person)')} ·{' '}
            {t('interviews.minutes', { count: active.durationMinutes, defaultValue: `${active.durationMinutes} min` })}
          </p>
          {active.status === 'CONFIRMED' && confirmedSlot ? (
            <p>
              {t('interviews.confirmedTime', 'Confirmed time')}: <b>{time(confirmedSlot.startsAt, active.timezone)}</b> ({active.timezone})
            </p>
          ) : (
            <>
              <p className="muted small">{t('interviews.slots', 'Proposed times')}:</p>
              <ul>
                {active.slots.map((slot) => (
                  <li key={slot.id}>{time(slot.startsAt, active.timezone)}</li>
                ))}
              </ul>
              {active.declineNote && <p className="muted">“{active.declineNote}”</p>}
            </>
          )}
          {active.mode === 'ONLINE' && active.meetUrl && (
            <p>
              <Video size={15} style={{ verticalAlign: '-2px' }} />{' '}
              <a href={active.meetUrl} target="_blank" rel="noreferrer">
                {t('interviews.meetLink', 'Google Meet')} <ExternalLink size={13} />
              </a>
            </p>
          )}
          {active.mode === 'OFFLINE' && active.location && (
            <p>
              <MapPin size={15} style={{ verticalAlign: '-2px' }} /> {active.location}
            </p>
          )}
          <div className="row wrap" style={{ gap: 8 }}>
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
