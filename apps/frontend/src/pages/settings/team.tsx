import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import {
  Copy,
  FileSpreadsheet,
  FileText,
  MessageCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
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
  Input,
  Loading,
  PageTitle,
  FilterAccordion,
  useData,
} from '../../components/ui';
import { useAuth } from '../../features/auth';
import { toast } from 'sonner';
import type { User } from '../../types';
import { CompanyOverviewPanel, MemberAccessEditor, type CompanyOverview } from './company-admin';
import { CandidateIntakePanel } from './candidate-intake';
import { TelegramBusinessCard } from '../../features/telegram/telegram-business-card';

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

  // Retention State
  const [retentionDays, setRetentionDays] = useState(180);
  const [purging, setPurging] = useState(false);
  useEffect(() => {
    if (overview) setRetentionDays(overview.company.retentionDays);
  }, [overview?.company.retentionDays]);

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

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow={t('admin.eyebrow')}
        title={t('admin.title')}
        text={t('admin.subtitle')}
      />

      <Alert message={teamError || actionError} />

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
                <div className="block text-xs font-semibold text-slate-700">
                  {t('admin.accessRole')}
                  <FilterAccordion
                    inline
                    className="mt-1"
                    value={role}
                    onChange={setRole}
                    ariaLabel={t('admin.accessRole')}
                    options={[
                      { value: 'HR', label: t('admin.roleHrOption') },
                      { value: 'RECRUITER', label: t('admin.roleRecruiterOption') },
                      { value: 'INTERVIEWER', label: t('admin.roleInterviewerOption') },
                    ]}
                  />
                </div>
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
                <FilterAccordion
                  className="w-[170px]"
                  value={String(retentionDays)}
                  onChange={(val) => setRetentionDays(parseInt(val, 10))}
                  ariaLabel={t('admin.retentionPeriodLabel')}
                  options={[
                    { value: '90', label: t('admin.days90') },
                    { value: '180', label: t('admin.days180') },
                    { value: '365', label: t('admin.days365') },
                    { value: '730', label: t('admin.days730') },
                  ]}
                />
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
          <TelegramBusinessCard />
        </div>
      )}
    </div>
  );
}
