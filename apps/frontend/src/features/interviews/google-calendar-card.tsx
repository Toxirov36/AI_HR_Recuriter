import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck } from 'lucide-react';
import { toast } from 'sonner';
import { send } from '../../lib/api';
import { Alert, Button, useData } from '../../components/ui';
import type { GoogleCalendarStatus } from '../../types';

/** Lets a recruiter connect their Google Calendar so interviews they schedule get Meet links. */
export function GoogleCalendarCard() {
  const { t } = useTranslation();
  const { data, error, reload } = useData<GoogleCalendarStatus>('/integrations/google-calendar/status');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  // Google sends the browser back here with ?google=connected or ?google=error.
  useEffect(() => {
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get('google');
    if (!outcome) return;
    if (outcome === 'connected') toast.success(t('interviews.googleSuccess', 'Google Calendar connected'));
    else setActionError(t('interviews.googleError', 'Google Calendar could not be connected. Try again.'));
    url.searchParams.delete('google');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    reload();
  }, [reload, t]);

  async function connect() {
    setBusy(true);
    setActionError('');
    try {
      const { url } = await send<{ url: string }>('/integrations/google-calendar/connect', {});
      window.location.assign(url);
    } catch (cause) {
      setActionError((cause as Error).message);
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setActionError('');
    try {
      await send('/integrations/google-calendar/connection', {}, 'DELETE');
      toast.success(t('interviews.googleDisconnected', 'Google Calendar disconnected'));
      reload();
    } catch (cause) {
      setActionError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6">
      <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
        <CalendarCheck size={18} className="text-[#1a5d4c] dark:text-[#58c0a0]" />
        {t('interviews.googleTitle', 'Google Calendar')}
      </h2>
      <p className="text-xs text-slate-500 mt-1">
        {t('interviews.googleDesc', 'Connect your Google account so interviews you schedule get a Google Meet link and appear in your calendar.')}
      </p>
      <Alert message={error || actionError} />
      {data && !data.configured && <p className="text-sm text-slate-600 mt-4">{t('interviews.googleNotConfigured', 'Google Calendar is not configured on this server.')}</p>}
      {data?.configured && data.connected && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-700">{t('interviews.googleConnectedAs', { email: data.googleEmail, defaultValue: `Connected as ${data.googleEmail}` })}</span>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void disconnect()}>
            {t('interviews.googleDisconnect', 'Disconnect')}
          </Button>
        </div>
      )}
      {data?.configured && !data.connected && (
        <Button type="button" className="mt-4" disabled={busy} onClick={() => void connect()}>
          {t('interviews.googleConnect', 'Connect Google')}
        </Button>
      )}
    </div>
  );
}
