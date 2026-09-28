import { useState, type FormEvent } from 'react';
import { Building2, Search, ShieldCheck, RefreshCw, LockKeyhole, Activity } from 'lucide-react';
import { toast } from 'sonner';
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
  Textarea,
  useData,
} from '../components/ui';
import { send } from '../lib/api';
import { CompanyDeletionButton, PendingCompanyFiles } from './company-deletion';

type Company = {
  id: number;
  name: string;
  isActive: boolean;
  protected: boolean;
  createdAt: string;
  _count: { users: number; vacancies: number; applications: number };
};
type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
type Overview = {
  companies: number;
  activeCompanies: number;
  blockedCompanies: number;
  users: number;
  vacancies: number;
  applications: number;
  candidates: number;
};
type AuditItem = {
  id: number;
  actorName: string;
  companyId: number;
  companyName: string;
  action: string;
  reason: string;
  createdAt: string;
};
const auditLabels: Record<string, string> = {
  COMPANY_BLOCKED: 'Kompaniya bloklandi',
  COMPANY_REACTIVATED: 'Kompaniya faollashtirildi',
  PLATFORM_ADMIN_GRANTED: 'Platforma huquqi berildi',
  COMPANY_DELETED: 'Kompaniya o‘chirildi',
};
const formatDate = (date: string) =>
  new Date(date).toLocaleString('uz-UZ', { dateStyle: 'medium', timeStyle: 'short' });

function Pagination({
  page,
  total,
  size,
  onChange,
}: {
  page: number;
  total: number;
  size: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex flex-wrap gap-3 justify-between items-center border-t border-slate-100 pt-4 mt-5">
      <p className="text-xs text-slate-500">
        {total} ta natija · {page} / {pages} sahifa
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Oldingi
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Keyingi
        </Button>
      </div>
    </div>
  );
}

function PlatformAudit() {
  const [page, setPage] = useState(1);
  const { data, error, reload } = useData<Page<AuditItem>>(`/platform-admin/audit?page=${page}`);
  return (
    <section className="panel padded">
      <div className="flex justify-between items-center gap-3">
        <h2>Platforma amallari tarixi</h2>
        <Button variant="outline" size="sm" onClick={reload} aria-label="Auditni yangilash">
          <RefreshCw size={15} />
        </Button>
      </div>
      <p className="muted small mt-2 mb-5">
        Kim, qachon va nima sababdan kompaniya holatini o‘zgartirgani.
      </p>
      <Alert message={error} />
      {!data && !error && <Loading />}
      {data?.items.length === 0 && (
        <p className="py-10 text-center text-slate-500">Hozircha amallar yo‘q.</p>
      )}
      <div className="space-y-3">
        {data?.items.map((item) => (
          <article key={item.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <strong className="text-sm">{auditLabels[item.action] ?? item.action}</strong>
              <time className="text-xs text-slate-500">{formatDate(item.createdAt)}</time>
            </div>
            <p className="text-sm mt-2 break-words">
              {item.companyName} <span className="text-slate-400">#{item.companyId}</span>
            </p>
            <p className="mt-2 text-sm text-slate-600 break-words">{item.reason}</p>
            <p className="mt-3 text-xs text-slate-500">Mas’ul: {item.actorName}</p>
          </article>
        ))}
      </div>
      {data && (
        <Pagination page={page} total={data.total} size={data.pageSize} onChange={setPage} />
      )}
    </section>
  );
}

export function PlatformAdmin() {
  const [tab, setTab] = useState<'companies' | 'audit'>('companies');
  const [search, setSearch] = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Company | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [cleanupRevision, setCleanupRevision] = useState(0);
  const summary = useData<Overview>('/platform-admin/overview');
  const companies = useData<Page<Company>>(
    `/platform-admin/companies?page=${page}&status=${status}&search=${encodeURIComponent(search)}`,
  );
  async function changeStatus(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setActionError('');
    try {
      await send(
        `/platform-admin/companies/${selected.id}/status`,
        {
          isActive: !selected.isActive,
          expectedIsActive: selected.isActive,
          reason: reason.trim(),
        },
        'PUT',
      );
      toast.success(selected.isActive ? 'Kompaniya bloklandi' : 'Kompaniya qayta faollashtirildi');
      setSelected(null);
      companies.reload();
      summary.reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-[#183f35] p-6 sm:p-8 text-white flex flex-wrap justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-emerald-200 text-xs font-semibold uppercase tracking-widest">
            <ShieldCheck size={16} /> Platforma boshqaruvi
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold mt-3">Platforma admin paneli</h1>
          <p className="text-sm text-emerald-100/80 mt-3 max-w-xl">
            Barcha kompaniyalar holati, foydalanish ko‘rsatkichlari va boshqaruv amallari.
          </p>
        </div>
        <div className="self-start rounded-full border border-white/20 px-3 py-1.5 text-xs">
          Super admin
        </div>
      </header>
      <Alert message={summary.error} />
      <PendingCompanyFiles key={cleanupRevision} />
      {!summary.data && !summary.error && <Loading />}
      {summary.data && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            [
              'Kompaniyalar',
              summary.data.companies,
              `${summary.data.activeCompanies} faol · ${summary.data.blockedCompanies} bloklangan`,
            ],
            ['Foydalanuvchilar', summary.data.users, 'Barcha kompaniyalar bo‘yicha'],
            ['Faol vakansiyalar', summary.data.vacancies, 'Faol kompaniyalarda'],
            ['Arizalar', summary.data.applications, `${summary.data.candidates} ta nomzod profili`],
          ].map(([label, value, note]) => (
            <section key={label} className="panel padded">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-3xl font-semibold text-[#245e4f] my-2">{value}</p>
              <p className="text-xs text-slate-500">{note}</p>
            </section>
          ))}
        </div>
      )}
      <div className="flex gap-2" role="tablist" aria-label="Platforma bo‘limlari">
        <Button
          role="tab"
          aria-selected={tab === 'companies'}
          variant={tab === 'companies' ? 'default' : 'outline'}
          onClick={() => setTab('companies')}
        >
          <Building2 size={16} className="mr-2" /> Kompaniyalar
        </Button>
        <Button
          role="tab"
          aria-selected={tab === 'audit'}
          variant={tab === 'audit' ? 'default' : 'outline'}
          onClick={() => setTab('audit')}
        >
          <Activity size={16} className="mr-2" /> Amallar tarixi
        </Button>
      </div>
      {tab === 'audit' ? (
        <PlatformAudit />
      ) : (
        <section className="panel padded">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <h2>Kompaniyalar ro‘yxati</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                companies.reload();
                summary.reload();
              }}
            >
              <RefreshCw size={14} className="mr-2" /> Yangilash
            </Button>
          </div>
          <form
            className="flex flex-wrap gap-3 mt-5 mb-5"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(draftSearch.trim());
              setPage(1);
            }}
          >
            <Input
              aria-label="Kompaniya qidirish"
              placeholder="Kompaniya nomi bo‘yicha qidirish…"
              maxLength={160}
              value={draftSearch}
              onChange={(e) => setDraftSearch(e.target.value)}
              className="flex-1 min-w-0 w-full sm:min-w-60"
            />
            <select
              aria-label="Kompaniya holati"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="all">Barcha holatlar</option>
              <option value="active">Faol</option>
              <option value="blocked">Bloklangan</option>
            </select>
            <Button type="submit" variant="outline">
              <Search size={15} className="mr-2" /> Qidirish
            </Button>
          </form>
          <Alert message={companies.error} />
          {!companies.data && !companies.error && <Loading />}
          {companies.data?.items.length === 0 && (
            <p className="py-12 text-center text-slate-500">
              Kompaniya topilmadi. Qidiruv yoki filtrni o‘zgartiring.
            </p>
          )}
          <div className="space-y-3">
            {companies.data?.items.map((company) => (
              <article
                key={company.id}
                className="rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-4"
                aria-label={`${company.name} kompaniyasi`}
              >
                <div className="flex items-center gap-3 w-full sm:w-auto sm:flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                    <Building2 size={19} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm break-words">{company.name}</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      #{company.id} · {new Date(company.createdAt).toLocaleDateString('uz-UZ')}
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      {company._count.users} xodim · {company._count.vacancies} vakansiya ·{' '}
                      {company._count.applications} ariza
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    company.isActive
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-800'
                  }
                >
                  {company.isActive ? 'Faol' : 'Bloklangan'}
                </Badge>
                {company.protected ? (
                  <span className="text-xs text-slate-500 flex gap-1 items-center">
                    <LockKeyhole size={13} /> Himoyalangan
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelected(company);
                      setReason('');
                      setActionError('');
                    }}
                  >
                    {company.isActive ? 'Bloklash' : 'Faollashtirish'}
                  </Button>
                )}
                {!company.protected && (
                  <CompanyDeletionButton
                    company={company}
                    onDeleted={() => {
                      setPage(1);
                      companies.reload();
                      summary.reload();
                      setCleanupRevision((value) => value + 1);
                    }}
                  />
                )}
              </article>
            ))}
          </div>
          {companies.data && (
            <Pagination
              page={page}
              total={companies.data.total}
              size={companies.data.pageSize}
              onChange={setPage}
            />
          )}
        </section>
      )}
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open && !busy) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selected?.isActive ? 'Kompaniyani bloklash' : 'Kompaniyani faollashtirish'}
            </DialogTitle>
            <DialogDescription>{selected?.name}</DialogDescription>
          </DialogHeader>
          <form onSubmit={changeStatus} className="space-y-4">
            <Alert message={actionError} />
            <p className="text-sm text-slate-600">
              {selected?.isActive
                ? 'Xodimlarning kirishi va ochiq sessiyalari cheklanadi. Yangi ommaviy arizalar va Telegram CV qabul qilish to‘xtatiladi. Ma’lumotlar saqlanadi.'
                : 'Kompaniya xodimlari tizimdan yana foydalana oladi.'}
            </p>
            <label className="block text-sm font-medium">
              Sabab
              <Textarea
                required
                minLength={5}
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-2"
                placeholder="O‘zgarish sababini yozing…"
              />
            </label>
            <p className="text-xs text-slate-500">
              Bu amal ismingiz va sabab bilan platforma tarixiga yoziladi.
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                Bekor qilish
              </Button>
              <Button type="submit" disabled={busy || reason.trim().length < 5}>
                {busy ? 'Saqlanmoqda…' : 'Tasdiqlash'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
