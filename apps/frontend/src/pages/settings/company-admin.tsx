import { useState, type FormEvent } from 'react';
import { Building2, CheckCircle2, Settings2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Loading } from '../../components/ui';
import { send } from '../../lib/api';
import { useAuth } from '../../features/auth';
import type { User } from '../../types';

export type CompanyOverview = {
  company: { id: number; name: string; retentionDays: number; createdAt: string };
  stats: { members: number; activeMembers: number; vacancies: number; candidates: number; applications: number; invitations: number };
  stages: { status: string; _count: number }[];
  integrations: { emailConfigured: boolean; aiConfigured: boolean; telegramConnected: boolean; storageConfigured: boolean };
};

const stageLabels: Record<string, string> = { NEW: 'Yangi', REVIEWING: 'Ko‘rib chiqilmoqda', INTERVIEW: 'Suhbat', OFFER: 'Taklif', HIRED: 'Ishga olindi', REJECTED: 'Rad etildi' };

export function CompanyOverviewPanel({ data, error, reload }: { data: CompanyOverview | null | undefined; error: string; reload: () => unknown }) {
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true); setSaveError('');
    try {
      await send('/company-admin/settings', { name: fields.get('name'), retentionDays: Number(fields.get('retentionDays')) }, 'PUT');
      reload(); await refresh(); toast.success('Kompaniya sozlamalari saqlandi');
    } catch (e) { setSaveError((e as Error).message); }
    finally { setBusy(false); }
  }
  if (error) return <Alert message={error} />;
  if (!data) return <Loading />;
  const integrationRows = [
    ['Email', data.integrations.emailConfigured, 'SMTP sozlangan', 'Sozlanmagan'],
    ['AI tahlil', data.integrations.aiConfigured, 'Kalit sozlangan', 'Sozlanmagan'],
    ['Telegram', data.integrations.telegramConnected, 'Ulangan', 'Ulanmagan'],
    ['CV saqlash', data.integrations.storageConfigured, 'R2 sozlangan', 'Mahalliy baza'],
  ] as const;
  return <div className="space-y-6">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {[
        ['Faol xodimlar', data.stats.activeMembers, `${data.stats.members} ta jami a’zo`],
        ['Ochiq vakansiyalar', data.stats.vacancies, 'Faol vakansiyalar'],
        ['Nomzodlar', data.stats.candidates, 'Asosiy, faol profillar'],
        ['Arizalar', data.stats.applications, `${data.stats.invitations} ta faol jamoa taklifi`],
      ].map(([label, value, note]) => <section key={label} className="panel padded">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-3xl font-semibold tracking-tight text-[#245e4f] my-2">{value}</p>
        <p className="text-xs text-slate-500">{note}</p>
      </section>)}
    </div>
    <div className="grid lg:grid-cols-2 gap-6">
      <section className="panel padded">
        <h2 className="flex items-center gap-2"><Building2 size={19} /> Kompaniya sozlamalari</h2>
        <p className="muted small mb-5">Kompaniya nomi va nomzod ma’lumotlarini saqlash muddati.</p>
        <form key={`${data.company.name}-${data.company.retentionDays}`} onSubmit={save} className="space-y-4">
          <Alert message={saveError} />
          <label className="block text-sm font-medium">Kompaniya nomi<Input className="mt-1.5" name="name" required minLength={2} maxLength={160} defaultValue={data.company.name} /></label>
          <label className="block text-sm font-medium">Saqlash muddati (kun)<Input className="mt-1.5" name="retentionDays" type="number" required min={30} max={3650} defaultValue={data.company.retentionDays} /></label>
          <p className="text-xs text-slate-500">30–3650 kun. Muddatni saqlash ma’lumotlarni darhol o‘chirmaydi.</p>
          <Button type="submit" disabled={busy}>{busy ? 'Saqlanmoqda…' : 'Sozlamalarni saqlash'}</Button>
        </form>
      </section>
      <section className="panel padded">
        <h2 className="flex items-center gap-2"><Settings2 size={19} /> Integratsiyalar</h2>
        <p className="muted small mb-5">Sozlamalar holati. Xizmatlarning jonli ulanishi bu yerda tekshirilmaydi.</p>
        <div className="space-y-3">{integrationRows.map(([name, configured, yes, no]) => <div key={name} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
          <span className="text-sm font-medium">{name}</span><Badge variant="outline" className={configured ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500'}>{configured ? yes : no}</Badge>
        </div>)}</div>
        <p className="mt-4 text-xs text-slate-500 flex items-center gap-2"><ShieldCheck size={15} /> Maxfiy kalitlar ko‘rsatilmaydi.</p>
      </section>
    </div>
    <section className="panel padded">
      <h2 className="flex items-center gap-2"><CheckCircle2 size={19} /> Ishga olish bosqichlari</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mt-4">{Object.entries(stageLabels).map(([key, label]) => <div key={key} className="bg-slate-50 rounded-xl p-4">
        <p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-semibold mt-2">{data.stages.find((stage) => stage.status === key)?._count ?? 0}</p>
      </div>)}</div>
    </section>
  </div>;
}

export function MemberAccessEditor({ member, onSaved }: { member: User; onSaved: () => unknown }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(member.role);
  const [active, setActive] = useState(member.isActive !== false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await send(`/company-admin/members/${member.id}`, { role, isActive: active }, 'PUT');
      setOpen(false); onSaved(); toast.success('Xodim ruxsatlari yangilandi');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  if (member.id === user.id) return <span className="text-xs text-slate-500">Siz</span>;
  if (member.platformRole === 'SUPER_ADMIN') return <span className="text-xs text-slate-500">Platforma admini</span>;
  return <>
    <Button size="sm" variant="outline" aria-label={`${member.fullName} ruxsatlarini boshqarish`} onClick={() => { setRole(member.role); setActive(member.isActive !== false); setError(''); setOpen(true); }}>Boshqarish</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}><DialogContent>
      <DialogHeader><DialogTitle>Xodim ruxsatlari</DialogTitle><DialogDescription>{member.fullName} — {member.email || member.phone}</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4">
        <Alert message={error} />
        <label className="block text-sm font-medium" htmlFor={`member-role-${member.id}`}>Rol</label>
        <select id={`member-role-${member.id}`} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-3" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="ADMIN">Admin — kompaniyani boshqarish</option><option value="HR">HR — ishga olish jarayoni</option><option value="RECRUITER">Recruiter — nomzodlar bilan ishlash</option><option value="INTERVIEWER">Interviewer — suhbat va baholash</option>
        </select>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Tizimga kirishga ruxsat berish</label>
        {!active && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Xodim tizimga kira olmaydi. Ochiq sessiyadagi keyingi so‘rovi ham rad etiladi.</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Bekor qilish</Button><Button type="submit" disabled={busy}>{busy ? 'Saqlanmoqda…' : 'O‘zgarishlarni tasdiqlash'}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
  </>;
}
