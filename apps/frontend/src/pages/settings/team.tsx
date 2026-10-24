import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  MessageCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlink,
  UserPlus,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, send } from '../../lib/api';
import {
  Alert,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Loading,
  PageTitle,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useData,
} from '../../components/ui';
import { useAuth } from '../../features/auth';
import { toast } from 'sonner';
import type { User } from '../../types';
import { CompanyOverviewPanel, MemberAccessEditor, type CompanyOverview } from './company-admin';
import { CandidateIntakePanel } from './candidate-intake';

interface AuditLogItem {
  id: number;
  createdAt: string;
  actorName: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: any;
  ipAddress: string | null;
}

export function Team() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const {
    data: overview,
    error: overviewError,
    reload: reloadOverview,
  } = useData<CompanyOverview>('/company-admin');
  const { data: teamUsers, error: teamError, reload: reloadTeam } = useData<User[]>('/auth/team');
  const {
    data: telegramStatus,
    error: telegramError,
    reload: reloadTelegram,
  } = useData<{
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
    setup: {
      telegramVerified: boolean;
      telegramUsername: string | null;
      expiresAt: string;
    } | null;
  }>('/v1/integrations/telegram/status');
  const {
    data: telegramAdminStatus,
    reload: reloadTelegramAdmin,
  } = useData<{ connected: boolean; telegramUsername?: string | null }>('/v1/integrations/telegram/admin/status');

  const {
    data: auditData,
    error: auditError,
    reload: reloadAudit,
  } = useData<{ items: AuditLogItem[]; total: number }>('/v1/audit-logs?pageSize=30');

  const [activeTab, setActiveTab] = useState('overview');
  const [memberSearch, setMemberSearch] = useState('');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [role, setRole] = useState('HR');

  // Telegram Deep Link Onboarding State
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [connectLinkData, setConnectLinkData] = useState<{
    token: string;
    connectUrl: string;
    botUsername: string;
  } | null>(null);
  const [connectSetup, setConnectSetup] = useState<{
    telegramVerified: boolean;
    telegramUsername: string | null;
    expiresAt: string;
  } | null>(null);
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Refresh while the Telegram tab is visible, even if the setup dialog was closed.
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    if (connectModalOpen || (activeTab === 'telegram' && !telegramStatus?.connected)) {
      pollInterval = setInterval(async () => {
        try {
          const res = await api<{
            connected: boolean;
            setup: {
              telegramVerified: boolean;
              telegramUsername: string | null;
              expiresAt: string;
            } | null;
          }>('/v1/integrations/telegram/status');
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
    }
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [activeTab, connectModalOpen, reloadTelegram, t, telegramStatus?.connected]);

  // Retention State
  const [retentionDays, setRetentionDays] = useState(180);
  const [purging, setPurging] = useState(false);
  useEffect(() => {
    if (overview) setRetentionDays(overview.company.retentionDays);
  }, [overview?.company.retentionDays]);

  async function startTelegramConnect() {
    setBusy(true);
    setError('');
    // Open the tab in the click handler so browsers do not block it after the API request.
    const botTab = window.open('about:blank', '_blank');
    if (botTab) botTab.opener = null;
    try {
      const res = await send<{
        token: string;
        connectUrl: string;
        botUsername: string;
      }>('/v1/integrations/telegram/connect-link', {});
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

  async function connectTelegramAdmin() {
    const botTab = window.open('about:blank', '_blank');
    if (botTab) botTab.opener = null;
    try {
      const result = await send<{ url: string }>('/v1/integrations/telegram/admin/connect-link', {});
      if (botTab) botTab.location.href = result.url;
      else window.location.assign(result.url);
      toast.success(t('admin.telegramAdminConnectedHint'));
    } catch (error) {
      botTab?.close();
      toast.error((error as Error).message);
    }
  }

  async function disconnectTelegramAdmin() {
    if (!window.confirm(t('admin.telegramAdminDisconnectConfirm'))) return;
    try {
      await api('/v1/integrations/telegram/admin/connection', { method: 'DELETE' });
      reloadTelegramAdmin();
      toast.success(t('admin.telegramAdminDisconnected'));
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function submitInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInvite('');
    try {
      const result = await send<{ inviteUrl: string }>('/auth/invitations', {
        ...Object.fromEntries(new FormData(e.currentTarget)),
        role,
      });
      setInvite(result.inviteUrl);
      setCopied(false);
      toast.success(t('admin.inviteCreated'));
      reloadTeam();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadAuditExport(format: 'csv' | 'json') {
    try {
      const res = await fetch(`/api/v1/audit-logs/export?format=${format}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(t('admin.auditExportError'));
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(t('admin.auditExportSuccess', { format: format.toUpperCase() }));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function saveRetentionPolicy() {
    setBusy(true);
    try {
      await send('/v1/company/retention-policy', { retentionDays }, 'PUT');
      reloadOverview();
      toast.success(t('admin.retentionUpdated'));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function purgeExpired() {
    setPurging(true);
    try {
      const res = await send<{ purgedCount: number; retentionDays: number }>(
        '/v1/retention/purge',
        {},
      );
      toast.success(t('admin.purgeSuccess', { count: res.purgedCount }));
      reloadAudit();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPurging(false);
    }
  }

  const setupStage = connectSetup ?? telegramStatus?.setup;

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow={t('admin.eyebrow')}
        title={t('admin.title')}
        text={t('admin.subtitle')}
      />

      <Alert message={teamError || telegramError || actionError} />

      <div
        role="tablist"
        className="bg-slate-100 p-1 rounded-xl flex flex-wrap gap-1 mb-6 border border-slate-200"
      >
        <button
          role="tab"
          type="button"
          aria-selected={activeTab === 'overview'}
          onClick={() => setActiveTab('overview')}
          className={`rounded-lg px-3.5 py-2 text-xs font-medium transition-all ${
            activeTab === 'overview'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          {t('admin.tabOverview')}
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={activeTab === 'team'}
          onClick={() => setActiveTab('team')}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-medium transition-all gap-2 ${
            activeTab === 'team'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <Users size={15} /> {t('admin.tabTeam')}
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={activeTab === 'audit'}
          onClick={() => setActiveTab('audit')}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-medium transition-all gap-2 ${
            activeTab === 'audit'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <FileSpreadsheet size={15} /> {t('admin.tabAudit')}
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={activeTab === 'retention'}
          onClick={() => setActiveTab('retention')}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-medium transition-all gap-2 ${
            activeTab === 'retention'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <ShieldAlert size={15} /> {t('admin.tabRetention')}
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={activeTab === 'telegram'}
          onClick={() => setActiveTab('telegram')}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-medium transition-all gap-2 ${
            activeTab === 'telegram'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <MessageCircle size={15} /> {t('admin.tabTelegram')}
        </button>
      </div>

      {/* 1. OVERVIEW & AUDIT TAB */}
      {activeTab === 'overview' && (
        <CompanyOverviewPanel data={overview} error={overviewError} reload={reloadOverview} />
      )}
      {activeTab === 'audit' && <Alert message={auditError} />}

      {/* 2. TEAM & RBAC TAB */}
      {activeTab === 'team' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="panel padded">
              <h2>{t('admin.teamMembers')}</h2>
              <Input
                aria-label={t('admin.searchMembersLabel')}
                placeholder={t('admin.searchMembers')}
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="my-3"
              />
              <p className="muted small mb-4">{t('admin.teamMembersDesc')}</p>
              {!teamUsers && !teamError ? (
                <Loading />
              ) : (
                <div className="team-list space-y-3">
                  {teamUsers &&
                    !teamUsers.some((u) =>
                      `${u.fullName} ${u.email ?? ''} ${u.phone ?? ''}`
                        .toLowerCase()
                        .includes(memberSearch.toLowerCase()),
                    ) && <p className="text-sm text-slate-500">{t('admin.noMembersFound')}</p>}
                  {teamUsers
                    ?.filter((u) =>
                      `${u.fullName} ${u.email ?? ''} ${u.phone ?? ''}`
                        .toLowerCase()
                        .includes(memberSearch.toLowerCase()),
                    )
                    .map((u) => {
                      const initials = u.fullName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase();
                      return (
                        <div
                          className="team-row flex flex-wrap gap-3 items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50/50"
                          key={u.id}
                        >
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback>{initials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <strong className="text-sm font-semibold text-slate-800">
                                {u.fullName}
                              </strong>
                              <span className="block text-xs text-slate-500">
                                {u.email || u.phone}
                              </span>
                            </div>
                          </div>
                          <Badge
                            variant={u.role === 'ADMIN' ? 'default' : 'outline'}
                            className={
                              u.role === 'ADMIN' ? 'bg-[#245e4f] text-white' : 'text-slate-700'
                            }
                          >
                            {u.role}
                          </Badge>
                          {u.isActive === false && (
                            <Badge variant="outline" className="text-red-700">
                              {t('admin.blocked')}
                            </Badge>
                          )}
                          <MemberAccessEditor
                            member={u}
                            onSaved={() => {
                              reloadTeam();
                              reloadOverview();
                              reloadAudit();
                            }}
                          />
                        </div>
                      );
                    })}
                </div>
              )}
            </section>

            <section className="panel padded">
              <h2>{t('admin.inviteNewMember')}</h2>
              <p className="muted small mb-4">{t('admin.inviteDesc')}</p>
              <form onSubmit={submitInvite} className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700">
                  {t('admin.workEmail')}
                  <Input
                    name="email"
                    type="email"
                    required
                    maxLength={160}
                    placeholder="colleague@company.com"
                    className="mt-1"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  {t('admin.accessRole')}
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={t('admin.selectRole')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="HR">{t('admin.roleHrOption')}</SelectItem>
                        <SelectItem value="RECRUITER">
                          {t('admin.roleRecruiterOption')}
                        </SelectItem>
                        <SelectItem value="INTERVIEWER">
                          {t('admin.roleInterviewerOption')}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </label>
                <Button
                  type="submit"
                  disabled={busy}
                  className="bg-[#245e4f] text-white gap-2 w-full mt-2"
                >
                  <UserPlus size={16} /> {t('admin.createInviteLink')}
                </Button>
              </form>

              {invite && (
                <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 text-xs">
                  <div className="font-semibold text-emerald-900 flex items-center gap-1.5">
                    <ShieldCheck size={16} /> {t('admin.inviteReady')}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={invite} className="text-xs font-mono bg-white" />
                    <Button
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(invite);
                        setCopied(true);
                        toast.success(t('admin.linkCopied'));
                      }}
                      className="shrink-0 bg-[#245e4f] text-white"
                    >
                      <Copy size={13} /> {copied ? t('admin.copied') : t('admin.copy')}
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* 3. AUDIT LOGS TAB */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="panel padded">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4 mb-4">
              <div>
                <h2>{t('admin.auditTitle')}</h2>
                <p className="muted small">{t('admin.auditDesc')}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadAuditExport('csv')}
                  className="text-xs gap-1.5 border-slate-300 hover:bg-slate-50"
                >
                  <FileSpreadsheet size={15} className="text-emerald-700" /> {t('admin.exportCsv')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadAuditExport('json')}
                  className="text-xs gap-1.5 border-slate-300 hover:bg-slate-50"
                >
                  <FileText size={15} className="text-blue-700" /> {t('admin.exportJson')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => reloadAudit()}
                  className="text-xs gap-1"
                >
                  <RefreshCw size={13} /> {t('admin.refresh')}
                </Button>
              </div>
            </div>

            {auditData?.items?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-700">
                      <th className="p-2.5 font-semibold">{t('admin.colTime')}</th>
                      <th className="p-2.5 font-semibold">{t('admin.colUser')}</th>
                      <th className="p-2.5 font-semibold">{t('admin.colRole')}</th>
                      <th className="p-2.5 font-semibold">{t('admin.colAction')}</th>
                      <th className="p-2.5 font-semibold">{t('admin.colResource')}</th>
                      <th className="p-2.5 font-semibold">{t('admin.colIp')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditData.items.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50/50">
                        <td className="p-2.5 text-slate-500 font-mono text-[11px]">
                          {new Date(entry.createdAt).toLocaleString()}
                        </td>
                        <td className="p-2.5 font-medium text-slate-800">{entry.actorName}</td>
                        <td className="p-2.5">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                            {entry.actorRole}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono text-[11px] text-emerald-800 font-semibold">
                          {entry.action}
                        </td>
                        <td className="p-2.5 text-slate-600">
                          {entry.resourceType} #{entry.resourceId}
                        </td>
                        <td className="p-2.5 text-slate-400 font-mono text-[11px]">
                          {entry.ipAddress || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 text-xs">
                {t('admin.noAuditLogs')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. DATA RETENTION & ANONYMIZATION TAB */}
      {activeTab === 'retention' && (
        <div className="space-y-6">
          <Card className="p-6 border border-slate-200 bg-white shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <ShieldAlert size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {t('admin.retentionPolicy')}
                </h3>
                <p className="text-xs text-slate-500">{t('admin.retentionStandard')}</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {t('admin.retentionInfo')}
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700">
                  {t('admin.retentionPeriodLabel')}
                </span>
                <Select
                  value={String(retentionDays)}
                  onValueChange={(val) => setRetentionDays(parseInt(val, 10))}
                >
                  <SelectTrigger className="w-[140px] text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="90">{t('admin.days90')}</SelectItem>
                    <SelectItem value="180">{t('admin.days180')}</SelectItem>
                    <SelectItem value="365">{t('admin.days365')}</SelectItem>
                    <SelectItem value="730">{t('admin.days730')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                onClick={saveRetentionPolicy}
                disabled={busy}
                className="bg-[#245e4f] text-white text-xs h-9"
              >
                {t('admin.savePolicy')}
              </Button>
            </div>

            <div className="pt-4 border-t flex items-center justify-between">
              <div>
                <strong className="text-xs text-slate-800 block">
                  {t('admin.forcePurge')}
                </strong>
                <span className="text-xs text-slate-500">{t('admin.forcePurgeDesc')}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={purgeExpired}
                disabled={purging}
                className="text-xs border-amber-300 text-amber-800 hover:bg-amber-50 gap-1.5"
              >
                <Trash2 size={14} /> {purging ? t('admin.purging') : t('admin.startPurge')}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 5. TELEGRAM INTEGRATION TAB */}
      {activeTab === 'telegram' && (
        <div className="space-y-6">
          <CandidateIntakePanel />
          <Card className="p-6 border border-slate-200 bg-white shadow-sm space-y-3">
            <h3 className="text-base font-bold text-slate-900">{t('admin.telegramAdminTitle')}</h3>
            <p className="text-sm text-slate-600">{t('admin.telegramAdminDescription')}</p>
            <p className="text-sm">{t('admin.connectionStatus')}: <strong>{telegramAdminStatus?.connected ? `${t('admin.telegramAdminConnected')}${telegramAdminStatus.telegramUsername ? ` · @${telegramAdminStatus.telegramUsername}` : ''}` : t('admin.telegramAdminNotConnected')}</strong></p>
            <div className="flex flex-wrap gap-2">
              {!telegramAdminStatus?.connected && <Button type="button" onClick={connectTelegramAdmin}>{t('admin.telegramAdminConnect')}</Button>}
              <Button type="button" variant="outline" onClick={() => reloadTelegramAdmin()}>{t('admin.telegramAdminRefresh')}</Button>
              {telegramAdminStatus?.connected && <Button type="button" variant="outline" onClick={disconnectTelegramAdmin}>{t('admin.telegramAdminDisconnect')}</Button>}
            </div>
          </Card>
          <Card className="p-6 border border-slate-200 bg-white shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                    telegramStatus?.connected
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  <MessageCircle size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    {t('admin.telegramIntegration')}
                    {telegramStatus?.connected ? (
                      <Badge
                        className={
                          telegramStatus.connection?.canReply
                            ? 'bg-emerald-600 text-white text-xs'
                            : 'bg-amber-100 text-amber-900 text-xs'
                        }
                      >
                        {telegramStatus.connection?.canReply
                          ? t('admin.telegramActive')
                          : t('admin.telegramNoReply')}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-600 text-xs">
                        {t('admin.notConnected')}
                      </Badge>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500">{t('admin.telegramSubtitle')}</p>
                </div>
              </div>

              {telegramStatus?.connected ? (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reloadTelegram()}
                    className="text-xs gap-1"
                  >
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reloadTelegram()}
                    className="text-xs gap-1"
                  >
                    <RefreshCw size={13} /> {t('admin.checkStatus')}
                  </Button>
                  <Button
                    onClick={startTelegramConnect}
                    disabled={busy}
                    className="bg-[#245e4f] hover:bg-[#1b4338] text-white gap-2 font-semibold shadow-sm"
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
                    <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">
                      {t('admin.telegramAccount')}
                    </span>
                    <strong className="text-sm text-slate-900 font-mono">
                      {telegramStatus.connection?.telegramUsername
                        ? `@${telegramStatus.connection.telegramUsername}`
                        : `ID: ${telegramStatus.connection?.telegramUserId}`}
                    </strong>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">
                      {t('admin.connectionStatus')}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 size={15} />{' '}
                      {telegramStatus.connection?.canReply
                        ? t('admin.businessBotConnected')
                        : t('admin.enableReplyPermission')}
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">
                      {t('admin.connectedDate')}
                    </span>
                    <span className="text-xs text-slate-700 font-mono">
                      {telegramStatus.connection?.createdAt
                        ? new Date(telegramStatus.connection.createdAt).toLocaleDateString()
                        : '—'}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs space-y-2">
                  <strong className="text-emerald-900 block font-semibold">
                    {t('admin.grantedPermissions')}
                  </strong>
                  <ul className="space-y-1 text-emerald-800">
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      <strong>{t('admin.permReadLabel')}</strong>{' '}
                      {telegramStatus.connection?.canReadMessages
                        ? t('admin.permReadActive')
                        : t('admin.permReadInactive')}
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      <strong>{t('admin.permReplyLabel')}</strong>{' '}
                      {telegramStatus.connection?.canReply
                        ? t('admin.permReplyActive')
                        : t('admin.permReplyInactive')}
                    </li>
                  </ul>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500">
                  {t('admin.telegramRule')}
                </div>
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  {t('admin.telegramTroubleshoot')}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 text-center space-y-4">
                  <div className="max-w-md mx-auto space-y-2">
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {t('admin.telegramConnectPrompt')}
                    </p>
                    <div className="pt-2">
                      <Button
                        onClick={startTelegramConnect}
                        disabled={busy}
                        className="bg-[#245e4f] hover:bg-[#1b4338] text-white gap-2 font-semibold"
                      >
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
          </Card>
        </div>
      )}

      {/* TELEGRAM CONNECT ONBOARDING DIALOG */}
      <Dialog open={connectModalOpen} onOpenChange={setConnectModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle size={20} className="text-[#245e4f] dark:text-[#58c0a0]" /> {t('admin.modalConnectTitle')}
            </DialogTitle>
            <DialogDescription>{t('admin.modalConnectDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-3">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-700 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                  1
                </span>
                <div className="space-y-1.5 flex-1">
                  <strong className="text-slate-900 block text-xs">
                    {setupStage?.telegramVerified
                      ? t('admin.modalStep1Verified')
                      : t('admin.modalStep1Start')}
                  </strong>
                  <p className="text-slate-600 text-[11px]">
                    {setupStage?.telegramVerified
                      ? t('admin.modalStep1VerifiedText', {
                          username: setupStage.telegramUsername
                            ? `@${setupStage.telegramUsername}`
                            : t('admin.telegramAccount'),
                        })
                      : t('admin.modalStep1StartText')}
                  </p>
                  {connectLinkData && (
                    <a
                      href={connectLinkData.connectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#245e4f] hover:bg-[#1b4338] text-white font-medium text-xs shadow-sm transition-all"
                    >
                      {t('admin.reopenBot')} <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3 pt-2 border-t border-emerald-200/60">
                <span className="w-6 h-6 rounded-full bg-slate-700 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                  2
                </span>
                <div className="space-y-1 text-slate-700 text-xs">
                  <strong className="text-slate-900 block">
                    {t('admin.modalStep2Title')}
                  </strong>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    {t('admin.modalStep2Desc', {
                      botUsername: connectLinkData?.botUsername || 'bot',
                    })}
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
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                  3
                </span>
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

      {/* TELEGRAM DISCONNECT CONFIRMATION DIALOG */}
      <Dialog open={disconnectModalOpen} onOpenChange={setDisconnectModalOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <ShieldAlert size={20} /> {t('admin.disconnectModalTitle')}
            </DialogTitle>
            <DialogDescription>{t('admin.disconnectModalDesc')}</DialogDescription>
          </DialogHeader>

          <p className="text-xs text-slate-600 leading-relaxed py-2">
            {t('admin.disconnectModalWarning')}
          </p>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDisconnectModalOpen(false)}>
              {t('admin.cancel')}
            </Button>
            <Button
              onClick={confirmDisconnect}
              disabled={disconnecting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {disconnecting ? t('admin.disconnecting') : t('admin.disconnectConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
