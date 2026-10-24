import { useState, type FormEvent } from 'react';
import { Building2, CheckCircle2, Settings2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Loading,
} from '../../components/ui';
import { send } from '../../lib/api';
import { useAuth } from '../../features/auth';
import type { User } from '../../types';

export type CompanyOverview = {
  company: { id: number; name: string; retentionDays: number; createdAt: string };
  stats: {
    members: number;
    activeMembers: number;
    vacancies: number;
    candidates: number;
    applications: number;
    invitations: number;
  };
  stages: { status: string; _count: number }[];
  integrations: {
    emailConfigured: boolean;
    aiConfigured: boolean;
    telegramConnected: boolean;
    storageConfigured: boolean;
  };
};

export function CompanyOverviewPanel({
  data,
  error,
  reload,
}: {
  data: CompanyOverview | null | undefined;
  error: string;
  reload: () => unknown;
}) {
  const { t } = useTranslation();
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setSaveError('');
    try {
      await send(
        '/company-admin/settings',
        { name: fields.get('name'), retentionDays: Number(fields.get('retentionDays')) },
        'PUT',
      );
      reload();
      await refresh();
      toast.success(t('admin.settingsSaved'));
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Alert message={error} />;
  if (!data) return <Loading />;

  const integrationRows = [
    [
      t('admin.integrationEmail'),
      data.integrations.emailConfigured,
      t('admin.smtpConfigured'),
      t('admin.notConfigured'),
    ],
    [
      t('admin.integrationAi'),
      data.integrations.aiConfigured,
      t('admin.keyConfigured'),
      t('admin.notConfigured'),
    ],
    [
      t('admin.integrationTelegram'),
      data.integrations.telegramConnected,
      t('admin.connected'),
      t('admin.notConnected'),
    ],
    [
      t('admin.integrationStorage'),
      data.integrations.storageConfigured,
      t('admin.r2Configured'),
      t('admin.localDatabase'),
    ],
  ] as const;

  const stageLabels: Record<string, string> = {
    NEW: t('admin.stageNew'),
    REVIEWING: t('admin.stageReviewing'),
    INTERVIEW: t('admin.stageInterview'),
    OFFER: t('admin.stageOffer'),
    HIRED: t('admin.stageHired'),
    REJECTED: t('admin.stageRejected'),
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          [
            t('admin.activeEmployees'),
            data.stats.activeMembers,
            t('admin.totalMembersNote', { count: data.stats.members }),
          ],
          [t('admin.openVacancies'), data.stats.vacancies, t('admin.activeVacanciesNote')],
          [t('admin.candidates'), data.stats.candidates, t('admin.activeProfilesNote')],
          [
            t('admin.applications'),
            data.stats.applications,
            t('admin.activeInvitesNote', { count: data.stats.invitations }),
          ],
        ].map(([label, value, note]) => (
          <section key={label} className="panel padded">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="text-3xl font-semibold tracking-tight text-[#245e4f] dark:text-[#58c0a0] my-2">{value}</p>
            <p className="text-xs text-slate-500">{note}</p>
          </section>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <section className="panel padded">
          <h2 className="flex items-center gap-2">
            <Building2 size={19} /> {t('admin.companySettings')}
          </h2>
          <p className="muted small mb-5">{t('admin.companySettingsDesc')}</p>
          <form
            key={`${data.company.name}-${data.company.retentionDays}`}
            onSubmit={save}
            className="space-y-4"
          >
            <Alert message={saveError} />
            <label className="block text-sm font-medium">
              {t('admin.companyName')}
              <Input
                className="mt-1.5"
                name="name"
                required
                minLength={2}
                maxLength={160}
                defaultValue={data.company.name}
              />
            </label>
            <label className="block text-sm font-medium">
              {t('admin.retentionDays')}
              <Input
                className="mt-1.5"
                name="retentionDays"
                type="number"
                required
                min={30}
                max={3650}
                defaultValue={data.company.retentionDays}
              />
            </label>
            <p className="text-xs text-slate-500">{t('admin.retentionDaysHint')}</p>
            <Button type="submit" disabled={busy}>
              {busy ? t('admin.saving') : t('admin.saveSettings')}
            </Button>
          </form>
        </section>
        <section className="panel padded">
          <h2 className="flex items-center gap-2">
            <Settings2 size={19} /> {t('admin.integrations')}
          </h2>
          <p className="muted small mb-5">{t('admin.integrationsDesc')}</p>
          <div className="space-y-3">
            {integrationRows.map(([name, configured, yes, no]) => (
              <div
                key={name}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
              >
                <span className="text-sm font-medium">{name}</span>
                <Badge
                  variant="outline"
                  className={configured ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500'}
                >
                  {configured ? yes : no}
                </Badge>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500 flex items-center gap-2">
            <ShieldCheck size={15} /> {t('admin.secretsHidden')}
          </p>
        </section>
      </div>
      <section className="panel padded">
        <h2 className="flex items-center gap-2">
          <CheckCircle2 size={19} /> {t('admin.hiringStages')}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mt-4">
          {Object.entries(stageLabels).map(([key, label]) => (
            <div key={key} className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-2xl font-semibold mt-2">
                {data.stages.find((stage) => stage.status === key)?._count ?? 0}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function MemberAccessEditor({
  member,
  onSaved,
}: {
  member: User;
  onSaved: () => unknown;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(member.role);
  const [active, setActive] = useState(member.isActive !== false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await send(`/company-admin/members/${member.id}`, { role, isActive: active }, 'PUT');
      setOpen(false);
      onSaved();
      toast.success(t('admin.permissionsUpdated'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (member.id === user.id)
    return <span className="text-xs text-slate-500">{t('admin.you')}</span>;
  if (member.platformRole === 'SUPER_ADMIN')
    return <span className="text-xs text-slate-500">{t('admin.platformAdmin')}</span>;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        aria-label={t('admin.manageAccessAria', { name: member.fullName })}
        onClick={() => {
          setRole(member.role);
          setActive(member.isActive !== false);
          setError('');
          setOpen(true);
        }}
      >
        {t('admin.manageAccess')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.memberPermissions')}</DialogTitle>
            <DialogDescription>
              {member.fullName} — {member.email || member.phone}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <Alert message={error} />
            <label className="block text-sm font-medium" htmlFor={`member-role-${member.id}`}>
              {t('admin.roleLabel')}
            </label>
            <select
              id={`member-role-${member.id}`}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-3"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="ADMIN">{t('admin.roleAdminDesc')}</option>
              <option value="HR">{t('admin.roleHrDesc')}</option>
            </select>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />{' '}
              {t('admin.allowAccess')}
            </label>
            {!active && (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                {t('admin.blockedAccessWarning')}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                {t('admin.cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? t('admin.saving') : t('admin.confirmChanges')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
