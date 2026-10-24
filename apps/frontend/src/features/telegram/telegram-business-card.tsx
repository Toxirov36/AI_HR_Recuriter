import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, MessageCircle, RefreshCw, ShieldAlert, Unlink, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, send } from '../../lib/api';
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
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useData,
} from '../../components/ui';

type Setup = { telegramVerified: boolean; telegramUsername: string | null; expiresAt: string };

export type TelegramStatus = {
  connected: boolean;
  connection: {
    id: string;
    telegramUserId: string;
    telegramUsername: string | null;
    canReply: boolean;
    canReadMessages: boolean;
    enabled: boolean;
    createdAt: string;
  } | null;
  botUsername: string;
  setup: Setup | null;
  /** Only for the administrator: every connected HR account of the company. */
  team?: { id: string; telegramUsername: string | null; canReply: boolean; fullName: string | null; mine: boolean }[];
};

/**
 * The signed-in user's own Telegram Business account: each HR connects theirs, so candidates writing to any of
 * them reach the company. The administrator also sees (and can remove) the other members' connections.
 */
export function TelegramBusinessCard() {
  const { t } = useTranslation();
  const { data: telegramStatus, error: telegramError, reload: reloadTelegram } = useData<TelegramStatus>('/v1/integrations/telegram/status');
  const [busy, setBusy] = useState(false);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [connectLinkData, setConnectLinkData] = useState<{ token: string; connectUrl: string; botUsername: string } | null>(null);
  const [connectSetup, setConnectSetup] = useState<Setup | null>(null);
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; name: string } | null>(null);

  // Refresh while a connection is being set up, even if the setup dialog was closed.
  const settingUp = connectModalOpen || (!telegramStatus?.connected && Boolean(connectSetup ?? telegramStatus?.setup));
  useEffect(() => {
    if (!settingUp) return;
    const pollInterval = setInterval(async () => {
      try {
        const res = await api<{ connected: boolean; setup: Setup | null }>('/v1/integrations/telegram/status');
        if (res?.connected) {
          toast.success(t('admin.telegramSuccessToast'));
          setConnectModalOpen(false);
          setConnectSetup(null);
          reloadTelegram();
        } else {
          setConnectSetup(res.setup);
        }
      } catch {
        // ignore transient poll error
      }
    }, 3000);
    return () => clearInterval(pollInterval);
  }, [settingUp, reloadTelegram, t]);

  async function startTelegramConnect() {
    setBusy(true);
    // Open the tab in the click handler so browsers do not block it after the API request.
    const botTab = window.open('about:blank', '_blank');
    if (botTab) botTab.opener = null;
    try {
      const res = await send<{ token: string; connectUrl: string; botUsername: string }>('/v1/integrations/telegram/connect-link', {});
      setConnectLinkData(res);
      setConnectSetup({ telegramVerified: false, telegramUsername: null, expiresAt: '' });
      setConnectModalOpen(true);
      if (botTab) botTab.location.href = res.connectUrl;
    } catch (e) {
      botTab?.close();
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDisconnect() {
    setDisconnecting(true);
    try {
      await api('/v1/integrations/telegram/connection', { method: 'DELETE' });
      toast.success(t('admin.telegramDisconnectedToast'));
      setDisconnectModalOpen(false);
      reloadTelegram();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDisconnecting(false);
    }
  }

  async function removeMember() {
    if (!memberToRemove) return;
    const { id } = memberToRemove;
    setMemberToRemove(null);
    try {
      await api(`/v1/integrations/telegram/connections/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast.success(t('admin.telegramDisconnectedToast'));
      reloadTelegram();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const setupStage = connectSetup ?? telegramStatus?.setup;
  const others = telegramStatus?.team?.filter((member) => !member.mine) ?? [];

  return (
    <>
      <Alert message={telegramError} />
      <Card className="p-6 border border-slate-200 bg-white shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                telegramStatus?.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-700'
              }`}
            >
              <MessageCircle size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                {t('admin.myTelegram')}
                {telegramStatus?.connected ? (
                  <Badge
                    className={
                      telegramStatus.connection?.canReply ? 'bg-emerald-600 text-white text-xs' : 'bg-amber-100 text-amber-900 text-xs'
                    }
                  >
                    {telegramStatus.connection?.canReply ? t('admin.telegramActive') : t('admin.telegramNoReply')}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-slate-600 text-xs">
                    {t('admin.notConnected')}
                  </Badge>
                )}
              </h3>
              <p className="text-xs text-slate-500">{t('admin.myTelegramSubtitle')}</p>
            </div>
          </div>

          {telegramStatus?.connected ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => reloadTelegram()} className="text-xs gap-1">
                <RefreshCw size={13} /> {t('admin.refresh')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDisconnectModalOpen(true)}
                className="text-xs border-red-200 text-red-600 hover:bg-red-50 gap-1.5"
              >
                <Unlink size={14} /> {t('admin.disconnect')}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => reloadTelegram()} className="text-xs gap-1">
                <RefreshCw size={13} /> {t('admin.checkStatus')}
              </Button>
              <Button
                onClick={startTelegramConnect}
                disabled={busy}
                className="bg-[color:var(--brand-fill)] hover:bg-[color:var(--brand-fill-hover)] text-white gap-2 font-semibold shadow-sm"
              >
                <MessageCircle size={16} /> {t('admin.connectViaTelegram')}
              </Button>
            </div>
          )}
        </div>

        {telegramStatus?.connected ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">{t('admin.telegramAccount')}</span>
                <strong className="text-sm text-slate-900 font-mono">
                  {telegramStatus.connection?.telegramUsername
                    ? `@${telegramStatus.connection.telegramUsername}`
                    : `ID: ${telegramStatus.connection?.telegramUserId}`}
                </strong>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">{t('admin.connectionStatus')}</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 size={15} />{' '}
                  {telegramStatus.connection?.canReply ? t('admin.businessBotConnected') : t('admin.enableReplyPermission')}
                </span>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">{t('admin.connectedDate')}</span>
                <span className="text-xs text-slate-700 font-mono">
                  {telegramStatus.connection?.createdAt ? new Date(telegramStatus.connection.createdAt).toLocaleDateString() : '—'}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs space-y-2">
              <strong className="text-emerald-900 block font-semibold">{t('admin.grantedPermissions')}</strong>
              <ul className="space-y-1 text-emerald-800">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <strong>{t('admin.permReadLabel')}</strong>{' '}
                  {telegramStatus.connection?.canReadMessages ? t('admin.permReadActive') : t('admin.permReadInactive')}
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <strong>{t('admin.permReplyLabel')}</strong>{' '}
                  {telegramStatus.connection?.canReply ? t('admin.permReplyActive') : t('admin.permReplyInactive')}
                </li>
              </ul>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500">{t('admin.telegramRule')}</div>
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">{t('admin.telegramTroubleshoot')}</div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 text-center space-y-4">
              <div className="max-w-md mx-auto space-y-2">
                <p className="text-xs text-slate-600 leading-relaxed">{t('admin.telegramConnectPrompt')}</p>
                <div className="pt-2">
                  <Button onClick={startTelegramConnect} disabled={busy} className="bg-[color:var(--brand-fill)] hover:bg-[color:var(--brand-fill-hover)] text-white gap-2 font-semibold">
                    <MessageCircle size={16} /> {t('admin.connectViaTelegram')}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600">
              <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
                <strong className="text-slate-900 block">{t('admin.step1Header')}</strong>
                <p className="text-[11px] text-slate-500">{t('admin.step1Body')}</p>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
                <strong className="text-slate-900 block">{t('admin.step2Header')}</strong>
                <p className="text-[11px] text-slate-500">{t('admin.step2Body')}</p>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
                <strong className="text-slate-900 block">{t('admin.step3Header')}</strong>
                <p className="text-[11px] text-slate-500">{t('admin.step3Body')}</p>
              </div>
            </div>
          </div>
        )}

        {telegramStatus?.team && (
          <div className="space-y-2 border-t pt-4">
            <strong className="text-sm text-slate-900 block">{t('admin.telegramTeamTitle')}</strong>
            <p className="text-xs text-slate-500">{t('admin.telegramTeamHint')}</p>
            {others.length ? (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {others.map((member) => {
                  const name = member.fullName ?? t('admin.telegramTeamUnknown');
                  return (
                    <li key={member.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs">
                      <span className="text-slate-800">
                        <strong>{name}</strong>
                        {member.telegramUsername && <span className="text-slate-500 font-mono"> · @{member.telegramUsername}</span>}
                        {!member.canReply && <span className="text-amber-700"> · {t('admin.telegramNoReply')}</span>}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setMemberToRemove({ id: member.id, name })}
                        className="text-xs border-red-200 text-red-600 hover:bg-red-50 gap-1"
                      >
                        <X size={13} /> {t('admin.disconnect')}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">{t('admin.telegramTeamEmpty')}</p>
            )}
          </div>
        )}
      </Card>

      {/* TELEGRAM CONNECT ONBOARDING DIALOG */}
      <Dialog open={connectModalOpen} onOpenChange={setConnectModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle size={20} className="text-[color:var(--brand-text)]" /> {t('admin.modalConnectTitle')}
            </DialogTitle>
            <DialogDescription>{t('admin.modalConnectDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-3">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-700 text-white font-bold flex items-center justify-center shrink-0 text-xs">1</span>
                <div className="space-y-1.5 flex-1">
                  <strong className="text-slate-900 block text-xs">
                    {setupStage?.telegramVerified ? t('admin.modalStep1Verified') : t('admin.modalStep1Start')}
                  </strong>
                  <p className="text-slate-600 text-[11px]">
                    {setupStage?.telegramVerified
                      ? t('admin.modalStep1VerifiedText', {
                          username: setupStage.telegramUsername ? `@${setupStage.telegramUsername}` : t('admin.telegramAccount'),
                        })
                      : t('admin.modalStep1StartText')}
                  </p>
                  {connectLinkData && (
                    <a
                      href={connectLinkData.connectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--brand-fill)] hover:bg-[color:var(--brand-fill-hover)] text-white font-medium text-xs shadow-sm transition-all"
                    >
                      {t('admin.reopenBot')} <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3 pt-2 border-t border-emerald-200/60">
                <span className="w-6 h-6 rounded-full bg-slate-700 text-white font-bold flex items-center justify-center shrink-0 text-xs">2</span>
                <div className="space-y-1 text-slate-700 text-xs">
                  <strong className="text-slate-900 block">{t('admin.modalStep2Title')}</strong>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    {t('admin.modalStep2Desc', { botUsername: connectLinkData?.botUsername || 'bot' })}
                  </p>
                  <a
                    href="tg://settings/business"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-medium text-emerald-800 hover:bg-emerald-50"
                  >
                    {t('admin.openBusinessSettings')} <ExternalLink size={13} />
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3 pt-2 border-t border-emerald-200/60">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">3</span>
                <div className="space-y-1 text-slate-700 text-xs">
                  <strong className="text-slate-900 block">{t('admin.modalStep3Title')}</strong>
                  <div className="flex items-center gap-2 text-blue-700 font-medium text-[11px] pt-0.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                    {t('admin.modalStep3Waiting')}
                  </div>
                  <p className="text-slate-600 text-[11px] pt-1">{t('admin.modalStep3Reconnect')}</p>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setConnectModalOpen(false)}>
                {t('admin.close')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* A colleague's Telegram is removed only after the administrator confirms */}
      <AlertDialog open={Boolean(memberToRemove)} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.disconnectModalTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.telegramTeamRemoveConfirm', { name: memberToRemove?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('admin.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={() => void removeMember()}>
              {t('admin.disconnectConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* TELEGRAM DISCONNECT CONFIRMATION DIALOG */}
      <Dialog open={disconnectModalOpen} onOpenChange={setDisconnectModalOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <ShieldAlert size={20} /> {t('admin.disconnectModalTitle')}
            </DialogTitle>
            <DialogDescription>{t('admin.disconnectModalDesc')}</DialogDescription>
          </DialogHeader>
          <p className="text-xs text-slate-600 leading-relaxed py-2">{t('admin.disconnectModalWarning')}</p>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDisconnectModalOpen(false)}>
              {t('admin.cancel')}
            </Button>
            <Button onClick={confirmDisconnect} disabled={disconnecting} className="bg-red-600 hover:bg-red-700 text-white">
              {disconnecting ? t('admin.disconnecting') : t('admin.disconnectConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
