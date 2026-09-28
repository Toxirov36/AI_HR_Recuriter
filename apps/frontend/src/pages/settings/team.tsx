import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Layers3,
  MessageCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlink,
  UserPlus,
  Users,
} from 'lucide-react';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useData,
} from '../../components/ui';
import { useAuth } from '../../features/auth';
import { toast } from 'sonner';
import type { User } from '../../types';
import { CompanyOverviewPanel, MemberAccessEditor, type CompanyOverview } from './company-admin';

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
  const { user } = useAuth();
  const { data: overview, error: overviewError, reload: reloadOverview } = useData<CompanyOverview>('/company-admin');
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
            setup: { telegramVerified: boolean; telegramUsername: string | null; expiresAt: string } | null;
          }>('/v1/integrations/telegram/status');
          if (res?.connected) {
            toast.success('Telegram hisobingiz muvaffaqiyatli ulandi! 🎉');
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
  }, [activeTab, connectModalOpen, reloadTelegram, telegramStatus?.connected]);

  // MFA Setup State
  const [mfaModalOpen, setMfaModalOpen] = useState(false);
  const [mfaSecretData, setMfaSecretData] = useState<{ secret: string; otpAuthUri: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  // Retention State
  const [retentionDays, setRetentionDays] = useState(180);
  const [purging, setPurging] = useState(false);
  useEffect(() => { if (overview) setRetentionDays(overview.company.retentionDays); }, [overview?.company.retentionDays]);

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
      toast.success('Telegram Business hisobi uzildi');
      setDisconnectModalOpen(false);
      reloadTelegram();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDisconnecting(false);
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
      toast.success('Taklif havolasi muvaffaqiyatli yaratildi!');
      reloadTeam();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startMfaSetup() {
    setBusy(true);
    setError('');
    try {
      const res = await api<{ secret: string; otpAuthUri: string }>('/auth/mfa/setup');
      setMfaSecretData(res);
      setMfaCode('');
      setRecoveryCodes(null);
      setMfaModalOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmMfaEnable() {
    if (!mfaCode.trim()) return;
    setBusy(true);
    try {
      const res = await send<{ enabled: boolean; recoveryCodes: string[] }>('/auth/mfa/enable', {
        code: mfaCode.trim(),
      });
      if (res.enabled) {
        setRecoveryCodes(res.recoveryCodes);
        toast.success('2FA muvaffaqiyatli yoqildi!');
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadAuditExport(format: 'csv' | 'json') {
    try {
      const res = await fetch(`/api/v1/audit-logs/export?format=${format}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Eksport qilishda xatolik yuz berdi');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Audit loglar ${format.toUpperCase()} formatida yuklab olindi`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function saveRetentionPolicy() {
    setBusy(true);
    try {
      await send('/v1/company/retention-policy', { retentionDays }, 'PUT');
      reloadOverview();
      toast.success('Ma‘lumotlar saqlanish muddati yangilandi');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function purgeExpired() {
    setPurging(true);
    try {
      const res = await send<{ purgedCount: number; retentionDays: number }>('/v1/retention/purge', {});
      toast.success(`${res.purgedCount} ta eskirgan nomzod ma‘lumotlari tozalandi (anonymized)`);
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
        eyebrow="TIZIM SOZLAMALARI"
        title="Kompaniya admin paneli"
        text="Kompaniya, xodimlar, integratsiyalar va ishga olish jarayonini boshqaring."
      />

      <Alert message={teamError || telegramError || actionError} />

      <div role="tablist" className="bg-slate-100 p-1 rounded-xl flex flex-wrap gap-1 mb-6 border border-slate-200">
        <button role="tab" type="button" aria-selected={activeTab === 'overview'} onClick={() => setActiveTab('overview')} className={`rounded-lg px-3.5 py-2 text-xs font-medium ${activeTab === 'overview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>Umumiy ko‘rinish</button>
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
          <Users size={15} /> Jamoa va Rollar (RBAC)
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={activeTab === 'security'}
          onClick={() => setActiveTab('security')}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-medium transition-all gap-2 ${
            activeTab === 'security'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <ShieldCheck size={15} /> Xavfsizlik & MFA (2FA)
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
          <FileSpreadsheet size={15} /> Audit loglar & Export
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
          <ShieldAlert size={15} /> Ma'lumotlar saqlanishi (GDPR)
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
          <MessageCircle size={15} /> Telegram Business
        </button>
      </div>

      {/* 1. TEAM & RBAC TAB */}
      {activeTab === 'overview' && <CompanyOverviewPanel data={overview} error={overviewError} reload={reloadOverview} />}
      {activeTab === 'audit' && <Alert message={auditError} />}
      {activeTab === 'team' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="panel padded">
              <h2>Jamoa a'zolari</h2>
              <Input aria-label="Xodimlarni qidirish" placeholder="Ism, email yoki telefon bo‘yicha qidirish…" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} className="my-3" />
              <p className="muted small mb-4">
                Kompaniyadagi xodimlar va ularning tizimdagi ruxsat darajalari (RBAC).
              </p>
              {!teamUsers && !teamError ? (
                <Loading />
              ) : (
                <div className="team-list space-y-3">
                  {teamUsers && !teamUsers.some((u) => `${u.fullName} ${u.email ?? ''} ${u.phone ?? ''}`.toLowerCase().includes(memberSearch.toLowerCase())) && <p className="text-sm text-slate-500">Xodim topilmadi.</p>}
                  {teamUsers?.filter((u) => `${u.fullName} ${u.email ?? ''} ${u.phone ?? ''}`.toLowerCase().includes(memberSearch.toLowerCase())).map((u) => {
                    const initials = u.fullName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();
                    return (
                      <div className="team-row flex flex-wrap gap-3 items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50/50" key={u.id}>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>{initials}</AvatarFallback>
                          </Avatar>
                          <div>
                            <strong className="text-sm font-semibold text-slate-800">{u.fullName}</strong>
                            <span className="block text-xs text-slate-500">{u.email || u.phone}</span>
                          </div>
                        </div>
                        <Badge
                          variant={u.role === 'ADMIN' ? 'default' : 'outline'}
                          className={u.role === 'ADMIN' ? 'bg-[#245e4f] text-white' : 'text-slate-700'}
                        >
                          {u.role}
                        </Badge>
                        {u.isActive === false && <Badge variant="outline" className="text-red-700">Bloklangan</Badge>}
                        <MemberAccessEditor member={u} onSaved={() => { reloadTeam(); reloadOverview(); reloadAudit(); }} />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="panel padded">
              <h2>Yangi a'zo taklif qilish</h2>
              <p className="muted small mb-4">
                Xodimga rol berib, bir martalik taklif havolasini shakllantiring.
              </p>
              <form onSubmit={submitInvite} className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Elektron pochta
                  <Input name="email" type="email" required maxLength={160} placeholder="colleague@company.com" className="mt-1" />
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  Ruxsat roli (RBAC)
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Rolni tanlang" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="HR">HR — Vakansiyalar va nomzodlarni to'liq boshqarish</SelectItem>
                        <SelectItem value="RECRUITER">Recruiter — Nomzodlar bilan ishlash va suhbatlar</SelectItem>
                        <SelectItem value="INTERVIEWER">Interviewer — Faqat suhbat scorecard to'ldirish</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </label>
                <Button type="submit" disabled={busy} className="bg-[#245e4f] text-white gap-2 w-full mt-2">
                  <UserPlus size={16} /> Taklif havolasini yaratish
                </Button>
              </form>

              {invite && (
                <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 text-xs">
                  <div className="font-semibold text-emerald-900 flex items-center gap-1.5">
                    <ShieldCheck size={16} /> Havola tayyor (24 soat amal qiladi):
                  </div>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={invite} className="text-xs font-mono bg-white" />
                    <Button
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(invite);
                        setCopied(true);
                        toast.success('Havola nusxalandi');
                      }}
                      className="shrink-0 bg-[#245e4f] text-white"
                    >
                      <Copy size={13} /> {copied ? 'Nusxalandi' : 'Nusxalash'}
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* 2. SECURITY & MFA TAB */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 border border-slate-200 bg-white shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <KeyRound size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Ikki bosqichli autentifikatsiya (2FA / TOTP)</h3>
                  <p className="text-xs text-slate-500">Google Authenticator, Microsoft Authenticator yoki Apple Passwords</p>
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Tizimga kirishda paroldan tashqari telefoningizdagi ilova orqali 6 xonali tasdiqlash kodini kiritish talab qilinadi. Bu hisobingizni ruxsatsiz kirishlardan to'liq himoyalaydi.
              </p>
              <div className="pt-2">
                <Button onClick={startMfaSetup} disabled={busy} className="bg-[#245e4f] hover:bg-[#1b4338] text-white gap-2">
                  <KeyRound size={16} /> 2FA'ni sozlash va yoqish
                </Button>
              </div>
            </Card>

            <Card className="p-6 border border-slate-200 bg-white shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Fayl xavfsizligi va Antivirus</h3>
                  <p className="text-xs text-slate-500">Real-vaqtli file signature va malware tekshiruvi</p>
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Yuklangan barcha CV fayllar (PDF, DOCX) magic byte signaturasi va zararli makroslar (VBA scripts, PDF exploits) bo'yicha avtomatik tekshiruvdan o'tadi. Bajariluvchi (.exe, ELF, shell) fayllar darhol bloklanadi.
              </p>
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 w-fit">
                <ShieldCheck size={15} /> Antivirus himoyasi: Faol va himoyalangan
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* 3. AUDIT LOGS TAB */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="panel padded">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4 mb-4">
              <div>
                <h2>Audit loglar (Faoliyat tarixi)</h2>
                <p className="muted small">Tizimdagi barcha muhim amallar, o'zgarishlar va kirishlar yozib boriladi.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadAuditExport('csv')}
                  className="text-xs gap-1.5 border-slate-300 hover:bg-slate-50"
                >
                  <FileSpreadsheet size={15} className="text-emerald-700" /> Export CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadAuditExport('json')}
                  className="text-xs gap-1.5 border-slate-300 hover:bg-slate-50"
                >
                  <FileText size={15} className="text-blue-700" /> Export JSON
                </Button>
                <Button size="sm" variant="ghost" onClick={() => reloadAudit()} className="text-xs gap-1">
                  <RefreshCw size={13} /> Yangilash
                </Button>
              </div>
            </div>

            {auditData?.items?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-700">
                      <th className="p-2.5 font-semibold">Vaqt</th>
                      <th className="p-2.5 font-semibold">Foydalanuvchi</th>
                      <th className="p-2.5 font-semibold">Rol</th>
                      <th className="p-2.5 font-semibold">Amal (Action)</th>
                      <th className="p-2.5 font-semibold">Resurs</th>
                      <th className="p-2.5 font-semibold">IP manzil</th>
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
                Hozircha audit loglar mavjud emas.
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
                <h3 className="text-base font-bold text-slate-900">Ma'lumotlar saqlanish muddati (Retention Policy)</h3>
                <p className="text-xs text-slate-500">GDPR Art. 17 va Shaxsiy ma'lumotlarni himoya qilish standartlari</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Rad etilgan yoki arxivlangan nomzodlarning shaxsiy ma'lumotlari belgilangan muddatdan so'ng avtomatik tarzda anonimlashtiriladi (ism, telefon, email va CV fayli butunlay o'chiriladi, ammo statistik ko'rsatkichlar saqlab qolinadi).
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700">Saqlanish muddati:</span>
                <Select
                  value={String(retentionDays)}
                  onValueChange={(val) => setRetentionDays(parseInt(val, 10))}
                >
                  <SelectTrigger className="w-[140px] text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="90">90 kun (3 oy)</SelectItem>
                    <SelectItem value="180">180 kun (6 oy)</SelectItem>
                    <SelectItem value="365">365 kun (1 yil)</SelectItem>
                    <SelectItem value="730">730 kun (2 yil)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={saveRetentionPolicy} disabled={busy} className="bg-[#245e4f] text-white text-xs h-9">
                Siyosatni saqlash
              </Button>
            </div>

            <div className="pt-4 border-t flex items-center justify-between">
              <div>
                <strong className="text-xs text-slate-800 block">Eskirgan ma'lumotlarni majburiy tozalash</strong>
                <span className="text-xs text-slate-500">Muddati o'tgan rad etilgan arizalarni hoziroq anonimlashtirish.</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={purgeExpired}
                disabled={purging}
                className="text-xs border-amber-300 text-amber-800 hover:bg-amber-50 gap-1.5"
              >
                <Trash2 size={14} /> {purging ? 'Tozalanmoqda…' : 'Tozalashni boshlash'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 5. TELEGRAM INTEGRATION TAB */}
      {activeTab === 'telegram' && (
        <div className="space-y-6">
          <Card className="p-6 border border-slate-200 bg-white shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                  telegramStatus?.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-700'
                }`}>
                  <MessageCircle size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    Telegram Business Integratsiyasi
                    {telegramStatus?.connected ? (
                      <Badge className={telegramStatus.connection?.canReply ? 'bg-emerald-600 text-white text-xs' : 'bg-amber-100 text-amber-900 text-xs'}>
                        {telegramStatus.connection?.canReply ? 'Faol va Ulangan ✅' : 'Ulangan · javob ruxsati yo‘q'}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-600 text-xs">Ulanmagan</Badge>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Bitta umumiy HR Secretary Bot orqali Telegram'dagi rezyumelarni avtomatik qabul qilish va javob berish.
                  </p>
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
                    <RefreshCw size={13} /> Yangilash
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDisconnectModalOpen(true)}
                    className="text-xs border-red-200 text-red-600 hover:bg-red-50 gap-1.5"
                  >
                    <Unlink size={14} /> Ulanishni uzish
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => reloadTelegram()} className="text-xs gap-1">
                    <RefreshCw size={13} /> Holatni tekshirish
                  </Button>
                  <Button
                    onClick={startTelegramConnect}
                    disabled={busy}
                    className="bg-[#245e4f] hover:bg-[#1b4338] text-white gap-2 font-semibold shadow-sm"
                  >
                    <MessageCircle size={16} /> Telegram orqali ulash
                  </Button>
                </div>
              )}
            </div>

            {telegramStatus?.connected ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">
                      Telegram Akkaunt
                    </span>
                    <strong className="text-sm text-slate-900 font-mono">
                      {telegramStatus.connection?.telegramUsername ? `@${telegramStatus.connection.telegramUsername}` : `ID: ${telegramStatus.connection?.telegramUserId}`}
                    </strong>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">
                      Ulanish holati
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 size={15} /> {telegramStatus.connection?.canReply ? 'Business Bot ulangan' : 'Javob berish ruxsatini yoqing'}
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">
                      Ulangan sana
                    </span>
                    <span className="text-xs text-slate-700 font-mono">
                      {telegramStatus.connection?.createdAt ? new Date(telegramStatus.connection.createdAt).toLocaleDateString() : '—'}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs space-y-2">
                  <strong className="text-emerald-900 block font-semibold">Berilgan ruxsatlar (Permissions):</strong>
                  <ul className="space-y-1 text-emerald-800">
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      <strong>O'qilgan deb belgilash (Read messages):</strong> {telegramStatus.connection?.canReadMessages ? 'Faol' : 'O‘chiq — CV qabul qilishga to‘sqinlik qilmaydi'}
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      <strong>Javob berish (Reply to messages):</strong> {telegramStatus.connection?.canReply ? 'Faol — ruxsat berilgan chatlarga javob yuboradi' : 'O‘chiq — avtomatik xabar yuborilmaydi'}
                    </li>
                  </ul>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500">
                  ℹ️ <strong>Telegram qoidasi:</strong> Rasmiy Telegram API chekloviga binoan, bitta shaxsiy Telegram profiliga bir vaqtning o'zida faqat bitta faol Business bot ulanishi mumkin.
                </div>
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  CV yoki javob kelmasa, Telegram Business → Chatbots bo‘limida <strong>Chats the bot can access</strong> sozlamasini tekshiring: sinov chatini Excluded chats'dan chiqaring yoki Only Selected Chats ro‘yxatiga qo‘shing. Business hisobidan javob faqat oxirgi 24 soatda xabar kelgan chatga yuboriladi.
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 text-center space-y-4">
                  <div className="max-w-md mx-auto space-y-2">
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Kompaniyangiz nomidan nomzodlar bilan avtomatik muloqot qilish va Telegram orqali yuborilgan CV fayllarni darhol platformaga yuklash uchun Telegram hisobingizni ulang.
                    </p>
                    <div className="pt-2">
                      <Button
                        onClick={startTelegramConnect}
                        disabled={busy}
                        className="bg-[#245e4f] hover:bg-[#1b4338] text-white gap-2 font-semibold"
                      >
                        <MessageCircle size={16} /> Telegram orqali ulash
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600">
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
                    <strong className="text-slate-900 block">1. Botni ochish</strong>
                    <p className="text-[11px] text-slate-500">
                      Tugma bir martalik ulanish havolasini yaratib, botni ochadi. Botda Start bosing.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
                    <strong className="text-slate-900 block">2. Telegram'da ruxsat berish</strong>
                    <p className="text-[11px] text-slate-500">
                      Telegram Sozlamalari → Chat-botlar bo'limida botga ruxsat bering.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
                    <strong className="text-slate-900 block">3. Avtomatik tasdiqlash</strong>
                    <p className="text-[11px] text-slate-500">
                      Ulangach, webhook orqali akkauntingiz saytga avtomatik bog'lanadi.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* MFA SETUP DIALOG */}
      <Dialog open={mfaModalOpen} onOpenChange={setMfaModalOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Ikki bosqichli autentifikatsiya (2FA)</DialogTitle>
            <DialogDescription>
              Google Authenticator yoki Microsoft Authenticator ilovasiga quyidagi kalitni qo'shing.
            </DialogDescription>
          </DialogHeader>

          {!recoveryCodes ? (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-slate-50 border rounded-lg text-center space-y-1.5">
                <span className="text-[11px] text-slate-500 uppercase tracking-wider block font-semibold">
                  Maxfiy sozlash kaliti (Secret Key)
                </span>
                <code className="text-sm font-bold text-slate-800 tracking-widest font-mono select-all">
                  {mfaSecretData?.secret}
                </code>
              </div>

              <label className="block text-xs font-semibold text-slate-700">
                Ilovadagi 6 xonali kodni kiriting:
                <Input
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  maxLength={6}
                  placeholder="123456"
                  className="mt-1 text-center font-mono text-base tracking-widest h-11"
                />
              </label>

              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setMfaModalOpen(false)}>
                  Bekor qilish
                </Button>
                <Button onClick={confirmMfaEnable} disabled={busy || mfaCode.length !== 6} className="bg-[#245e4f] text-white">
                  {busy ? 'Tekshirilmoqda…' : 'Tasdiqlash va yoqish'}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 space-y-2">
                <strong>✓ 2FA muvaffaqiyatli yoqildi!</strong>
                <p className="text-slate-600">
                  Telefoningiz yo'qolganda hisobingizga kirish uchun quyidagi 8 ta favqulodda tiklash kodini saqlab qo'ying:
                </p>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs p-2 bg-white rounded border border-emerald-200">
                  {recoveryCodes.map((c, i) => (
                    <span key={i} className="text-slate-800">{c}</span>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(recoveryCodes.join('\n'));
                    toast.success('Kodlar nusxalandi');
                    setMfaModalOpen(false);
                  }}
                  className="bg-[#245e4f] text-white w-full"
                >
                  Kodlarni nusxalash va yopish
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* TELEGRAM CONNECT ONBOARDING DIALOG */}
      <Dialog open={connectModalOpen} onOpenChange={setConnectModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle size={20} className="text-[#245e4f]" /> Telegram Business hisobini ulash
            </DialogTitle>
            <DialogDescription>
              Nomzodlar yuborgan rezyumelarni avtomatik qabul qilish uchun botni Telegram profilingizga ulang.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-3">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-700 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                  1
                </span>
                <div className="space-y-1.5 flex-1">
                  <strong className="text-slate-900 block text-xs">{setupStage?.telegramVerified ? 'Telegram hisobingiz aniqlandi' : 'Telegram botida Start bosing'}</strong>
                  <p className="text-slate-600 text-[11px]">
                    {setupStage?.telegramVerified
                      ? `${setupStage.telegramUsername ? `@${setupStage.telegramUsername}` : 'Hisobingiz'} tasdiqlandi. Endi botga Business ruxsatini bering.`
                      : 'Bot yangi oynada ochildi. Undagi Start tugmasini bosing:'}
                  </p>
                  {connectLinkData && (
                    <a
                      href={connectLinkData.connectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#245e4f] hover:bg-[#1b4338] text-white font-medium text-xs shadow-sm transition-all"
                    >
                      Botni qayta ochish <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3 pt-2 border-t border-emerald-200/60">
                <span className="w-6 h-6 rounded-full bg-slate-700 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                  2
                </span>
                <div className="space-y-1 text-slate-700 text-xs">
                  <strong className="text-slate-900 block">Telegram ilovangizda botga ruxsat bering</strong>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Telegram Sozlamalari (Settings) → <strong>Telegram Business</strong> → <strong>Chatbots</strong> (Chat-botlar) bo'limida <strong>@{connectLinkData?.botUsername || 'bot'}</strong>ni tanlang va <em>«Read Messages»</em> hamda <em>«Reply to Messages»</em> huquqlarini yoqing.
                  </p>
                  <a href="tg://settings/business" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-medium text-emerald-800 hover:bg-emerald-50">
                    Telegram Business sozlamalarini ochish <ExternalLink size={13} />
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3 pt-2 border-t border-emerald-200/60">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                  3
                </span>
                <div className="space-y-1 text-slate-700 text-xs">
                  <strong className="text-slate-900 block">Avtomatik tasdiqlash</strong>
                  <div className="flex items-center gap-2 text-blue-700 font-medium text-[11px] pt-0.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                    Telegram'dan ulanish signali kutilmoqda (jonli tekshiruv)…
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setConnectModalOpen(false)}>
                Yopish
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
              <ShieldAlert size={20} /> Telegram ulanishini uzish
            </DialogTitle>
            <DialogDescription>
              Haqiqatan ham Telegram Business ulanishini uzmoqchimisiz?
            </DialogDescription>
          </DialogHeader>

          <p className="text-xs text-slate-600 leading-relaxed py-2">
            Ulanish uzilgandan so'ng, nomzodlar Telegram orqali yuborgan yangi rezyumelar avtomatik tarzda platformaga kelib tushmaydi va ularga avtomatik xabarlar yuborilishi to'xtatiladi.
          </p>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDisconnectModalOpen(false)}>
              Bekor qilish
            </Button>
            <Button
              onClick={confirmDisconnect}
              disabled={disconnecting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {disconnecting ? 'Uzilmoqda…' : 'Ha, ulanishni uzish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
