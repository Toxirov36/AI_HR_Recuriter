import { useState, useRef, useEffect } from 'react';
import { Building2, Search, ShieldCheck, RefreshCw, LockKeyhole, Activity, ChevronDown, Check } from 'lucide-react';
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


type StatusOption = { value: string; label: string; color: string; dot: string; count?: number };

function StatusFilter({
  value,
  onChange,
  summary,
}: {
  value: string;
  onChange: (v: string) => void;
  summary?: Overview | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Tashqarida klik yoki Escape — yopish
  useEffect(() => {
    function handle(e: MouseEvent | KeyboardEvent) {
      if (e instanceof KeyboardEvent && e.key === 'Escape') { setOpen(false); return; }
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handle);
    return () => { document.removeEventListener('mousedown', handle); document.removeEventListener('keydown', handle); };
  }, []);

  const options: StatusOption[] = [
    {
      value: 'all',
      label: 'Barcha holatlar',
      color: 'text-slate-700 bg-slate-50 hover:bg-slate-100',
      dot: 'bg-slate-400',
      count: summary?.companies,
    },
    {
      value: 'active',
      label: 'Faol',
      color: 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100',
      dot: 'bg-emerald-500',
      count: summary?.activeCompanies,
    },
    {
      value: 'blocked',
      label: 'Bloklangan',
      color: 'text-amber-700 bg-amber-50 hover:bg-amber-100',
      dot: 'bg-amber-500',
      count: summary?.blockedCompanies,
    },
  ];

  const active = options.find((o) => o.value === value) ?? options[0];

  return (
    <div ref={ref} className="relative" aria-label="Holat filtri">
      {/* Trigger tugmasi */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((p) => !p)}
        className={`
          flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium
          transition-all duration-150 select-none cursor-pointer
          ${open
            ? 'border-emerald-400 ring-2 ring-emerald-100 bg-white shadow-sm'
            : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'}
        `}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${active.dot}`} />
        <span>{active.label}</span>
        {active.count !== undefined && (
          <span className="ml-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 font-normal">
            {active.count}
          </span>
        )}
        <ChevronDown
          size={14}
          className={`ml-1 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Accordion panel */}
      <div
        role="listbox"
        aria-label="Holat tanlash"
        className={`
          absolute left-0 z-30 mt-2 w-52 rounded-xl border border-slate-200
          bg-white shadow-lg overflow-hidden
          transition-all duration-200 origin-top
          ${open ? 'opacity-100 scale-y-100 pointer-events-auto' : 'opacity-0 scale-y-95 pointer-events-none'}
        `}
        style={{ transformOrigin: 'top' }}
      >
        <div className="py-1.5">
          {options.map((opt) => (
            <button
              key={opt.value}
              role="option"
              type="button"
              aria-selected={value === opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left
                transition-colors duration-100
                ${value === opt.value ? opt.color : 'hover:bg-slate-50 text-slate-700'}
              `}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`} />
              <span className="flex-1 font-medium">{opt.label}</span>
              {opt.count !== undefined && (
                <span className="rounded-full bg-white/70 border border-current/10 px-2 py-0.5 text-xs opacity-75">
                  {opt.count}
                </span>
              )}
              {value === opt.value && (
                <Check size={13} className="shrink-0 text-emerald-600" />
              )}
            </button>
          ))}
        </div>
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
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [cleanupRevision, setCleanupRevision] = useState(0);
  const summary = useData<Overview>('/platform-admin/overview');
  const companies = useData<Page<Company>>(
    `/platform-admin/companies?page=${page}&status=${status}&search=${encodeURIComponent(search)}`,
  );
  async function changeStatus() {
    if (!selected) return;
    setBusy(true);
    setActionError('');
    try {
      await send(
        `/platform-admin/companies/${selected.id}/status`,
        {
          isActive: !selected.isActive,
          expectedIsActive: selected.isActive,
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
            {/* Accordion holat filtri */}
            <StatusFilter
              value={status}
              onChange={(val) => { setStatus(val); setPage(1); }}
              summary={summary.data}
            />
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
          <div className="space-y-4">
            <Alert message={actionError} />
            <p className="text-sm text-slate-600">
              {selected?.isActive
                ? 'Xodimlarning kirishi va ochiq sessiyalari cheklanadi. Yangi ommaviy arizalar va Telegram CV qabul qilish to‘xtatiladi. Ma’lumotlar saqlanadi.'
                : 'Kompaniya xodimlari tizimdan yana foydalana oladi.'}
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
              <Button type="button" disabled={busy} variant={selected?.isActive ? 'destructive' : 'default'} onClick={changeStatus}>
                {busy ? 'Saqlanmoqda…' : selected?.isActive ? 'Bloklash' : 'Faollashtirish'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
