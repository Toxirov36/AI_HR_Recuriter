import { useState, useRef, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Plus, Search, Pencil, Trash2, Sparkles, Link2, Send } from 'lucide-react';
import { cn } from '../../lib/utils';
import { api, send } from '../../lib/api';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  Input,
  Loading,
  Modal,
  Pagination,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useData,
} from '../../components/ui';
import { toast } from 'sonner';
import type { Page, Vacancy, Requirement } from '../../types';
import { useAuth } from '../../features/auth';
import { VacancyGenerator } from '../../features/create-vacancy';
import { TopCandidatesModal } from '../../features/ai-matching';
import { PublicationModal } from './publication-modal';

type HhFields = { areas: Array<{ id: string; name: string }>; roles: Array<{ id: string; name: string }>; experiences: Array<{ id: string; name: string }>; employments: Array<{ id: string; name: string }>; schedules: Array<{ id: string; name: string }> };

export function parseDescriptionMeta(rawDescription: string, rawTitle: string = '') {
  let description = rawDescription || '';
  let department = 'Engineering';
  let location = 'Tashkent · Hybrid';
  let employmentType = 'Full-time';
  let seniority = 'Middle';

  const deptMatch = description.match(/^Department:\s*([^\n]+)/im);
  const locMatch = description.match(/^Location:\s*([^\n]+)/im);
  const empMatch = description.match(/^Employment type:\s*([^\n]+)/im);
  const senMatch = description.match(/^Seniority:\s*([^\n]+)/im);

  if (deptMatch || locMatch || empMatch || senMatch) {
    if (deptMatch) department = deptMatch[1].trim();
    if (locMatch) location = locMatch[1].trim();
    if (empMatch) employmentType = empMatch[1].trim();
    if (senMatch) seniority = senMatch[1].trim();

    description = description
      .replace(/^Department:\s*[^\n]+\n?/im, '')
      .replace(/^Location:\s*[^\n]+\n?/im, '')
      .replace(/^Employment type:\s*[^\n]+\n?/im, '')
      .replace(/^Seniority:\s*[^\n]+\n?/im, '')
      .trim();
  } else if (rawTitle || rawDescription) {
    const title = rawTitle.toLowerCase();
    const desc = rawDescription.toLowerCase();

    if (/design|ui|ux|graphic|visual|product design/i.test(title + ' ' + desc)) {
      department = 'Design';
    } else if (/recruiter|talent|people|hr|human resources|sourcing/i.test(title + ' ' + desc)) {
      department = 'People';
    } else if (/product manager|product owner|\bpm\b/i.test(title)) {
      department = 'Product';
    } else if (/marketing|copywriter|content|seo|growth|smm/i.test(title + ' ' + desc)) {
      department = 'Marketing';
    } else if (/sales|account executive|\bbdr\b|\bsdr\b/i.test(title + ' ' + desc)) {
      department = 'Sales';
    } else if (/finance|accountant/i.test(title)) {
      department = 'Finance';
    } else {
      department = 'Engineering';
    }

    if (/remote/i.test(title + ' ' + desc) && !/tashkent/i.test(title + ' ' + desc)) {
      location = 'Remote · CET ±3';
    } else if (/on-site|onsite|office/i.test(title + ' ' + desc) || /nestjs/i.test(title)) {
      location = 'Tashkent · On-site';
    } else {
      location = 'Tashkent · Hybrid';
    }

    if (/\bsenior\b|\bsr\b/i.test(title)) seniority = 'Senior';
    else if (/\blead\b|\bprincipal\b|\bhead\b/i.test(title)) seniority = 'Lead';
    else if (/\bjunior\b|\bjr\b|\bintern\b/i.test(title)) seniority = 'Junior';
    else seniority = 'Middle';

    employmentType = /part-time|contract/i.test(desc) ? 'Part-time' : 'Full-time';
  }

  return { description, department, location, employmentType, seniority };
}

export function VacancyForm({
  value,
  close,
  saved,
}: {
  value: Vacancy | null;
  close: () => void;
  saved: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const initialMeta = parseDescriptionMeta(value?.description || '', value?.title || '');

  const [title, setTitle] = useState(value?.title ?? '');
  const [department, setDepartment] = useState(value ? initialMeta.department : '');
  const [location, setLocation] = useState(value ? initialMeta.location : '');
  const [employmentType, setEmploymentType] = useState(
    value ? initialMeta.employmentType : 'Full-time',
  );
  const [seniority, setSeniority] = useState(value ? initialMeta.seniority : 'Middle');
  const [status, setStatus] = useState(value?.status || 'DRAFT');
  const [description, setDescription] = useState(value ? initialMeta.description : '');

  const [requirements, setRequirements] = useState<Requirement[]>(
    value?.requirements?.length
      ? value.requirements
      : [{ name: '', description: '', required: true }],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'details' | 'ai'>('details');
  const [hhFields, setHhFields] = useState<HhFields | null>(null);
  const [hhAreaId, setHhAreaId] = useState(value?.hhAreaId ?? '');
  const [hhProfessionalRoleId, setHhProfessionalRoleId] = useState(value?.hhProfessionalRoleId ?? '');
  const [hhExperienceId, setHhExperienceId] = useState(value?.hhExperienceId ?? '');
  const [hhEmploymentId, setHhEmploymentId] = useState(value?.hhEmploymentId ?? '');
  const [hhScheduleId, setHhScheduleId] = useState(value?.hhScheduleId ?? '');

  useEffect(() => {
    void api<{ connected: boolean; connectedByUserId: number | null }>('/integrations/recruiting/headhunter/status')
      .then(status => status.connected && status.connectedByUserId === user?.id ? api<HhFields>('/integrations/recruiting/headhunter/fields').then(setHhFields) : undefined)
      .catch(() => undefined);
  }, [user?.id]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');

    const cleanDesc = description.trim();
    const deptVal = department.trim() || 'Engineering';
    const locVal = location.trim() || 'Tashkent · Hybrid';
    const encodedDescription = `Department: ${deptVal}\nLocation: ${locVal}\nEmployment type: ${employmentType.trim()}\nSeniority: ${seniority.trim()}\n\n${cleanDesc}`;

    try {
      await send(
        `/vacancies${value ? `/${value.id}` : ''}`,
        {
          title: title.trim(),
          description: encodedDescription,
          status,
          requirements: requirements
            .filter((r) => r.name.trim().length > 0)
            .map(({ name, description, required }) => ({
              name: name.trim(),
              description: description || null,
              required: Boolean(required),
            })),
          hhAreaId: hhAreaId || null,
          hhProfessionalRoleId: hhProfessionalRoleId || null,
          hhExperienceId: hhExperienceId || null,
          hhEmploymentId: hhEmploymentId || null,
          hhScheduleId: hhScheduleId || null,
        },
        value ? 'PUT' : 'POST',
      );
      toast.success(value ? t('vacancies.savedSuccess') : t('vacancies.createdSuccess'));
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={value ? t('vacancies.modalEditTitle') : t('vacancies.modalCreateTitle')}
      subtitle={t('vacancies.modalSubtitle')}
      close={close}
      className="vacancy-modal-custom"
    >
      <form onSubmit={submit} className="vacancy-modal-form">
        <Alert message={error} />

        {/* Capsule Pill Tab Bar */}
        <div className="vacancy-modal-tab-bar" role="tablist" aria-label="Vacancy editor">
          <button
            id="vacancy-details-tab"
            type="button"
            role="tab"
            aria-selected={tab === 'details'}
            aria-controls="vacancy-details-panel"
            className={`modal-pill-tab ${tab === 'details' ? 'active' : ''}`}
            onClick={() => setTab('details')}
          >
            {t('vacancies.tabDetails')}
          </button>
          <button
            id="vacancy-ai-tab"
            type="button"
            role="tab"
            aria-selected={tab === 'ai'}
            aria-controls="vacancy-ai-panel"
            className={`modal-pill-tab ${tab === 'ai' ? 'active' : ''}`}
            onClick={() => setTab('ai')}
          >
            <Sparkles size={14} className="tab-sparkle-icon" /> {t('vacancies.tabAiGenerator')}
          </button>
        </div>

        {tab === 'details' ? (
          <div
            id="vacancy-details-panel"
            role="tabpanel"
            aria-labelledby="vacancy-details-tab"
            className="vacancy-modal-body"
          >
            {/* 2-Column Grid */}
            <div className="vacancy-form-grid">
              {/* Row 1 */}
              <div className="form-group">
                <label className="form-label" htmlFor="field-title">
                  {t('vacancies.labelTitle')}
                </label>
                <input
                  id="field-title"
                  name="title"
                  aria-label={t('vacancies.labelTitle')}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={200}
                  placeholder="Middle NestJS Developer"
                  className="form-control-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="field-dept">
                  {t('vacancies.labelDepartment')}
                </label>
                <input
                  id="field-dept"
                  name="department"
                  aria-label={t('vacancies.labelDepartment')}
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  maxLength={100}
                  placeholder="Engineering"
                  className="form-control-input"
                />
              </div>

              {/* Row 2 */}
              <div className="form-group">
                <label className="form-label" htmlFor="field-loc">
                  {t('vacancies.labelLocation')}
                </label>
                <input
                  id="field-loc"
                  name="location"
                  aria-label={t('vacancies.labelLocation')}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  maxLength={100}
                  placeholder="Tashkent · Hybrid"
                  className="form-control-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('vacancies.labelEmploymentType')}</label>
                <div className="form-select-wrapper">
                  <Select value={employmentType} onValueChange={setEmploymentType}>
                    <SelectTrigger className="form-control-select">
                      <SelectValue placeholder="Full-time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Full-time">Full-time</SelectItem>
                      <SelectItem value="Part-time">Part-time</SelectItem>
                      <SelectItem value="Contract">Contract</SelectItem>
                      <SelectItem value="Internship">Internship</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 3 */}
              <div className="form-group">
                <label className="form-label">{t('vacancies.labelSeniority')}</label>
                <div className="form-select-wrapper">
                  <Select value={seniority} onValueChange={setSeniority}>
                    <SelectTrigger className="form-control-select">
                      <SelectValue placeholder="Middle" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Junior">Junior</SelectItem>
                      <SelectItem value="Middle">Middle</SelectItem>
                      <SelectItem value="Senior">Senior</SelectItem>
                      <SelectItem value="Lead">Lead</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('vacancies.labelStatus')}</label>
                <div className="form-select-wrapper">
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger
                      className="form-control-select status-select-field"
                      aria-label={t('vacancies.labelStatus')}
                    >
                      <SelectValue placeholder={t('vacancies.statusDraft')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DRAFT">{t('vacancies.statusDraft')}</SelectItem>
                      <SelectItem value="ACTIVE">{t('vacancies.statusActive')}</SelectItem>
                      <SelectItem value="CLOSED">{t('vacancies.statusClosed')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="form-group" style={{ marginTop: '16px' }}>
              <label className="form-label" htmlFor="field-desc">
                {t('vacancies.labelDescription')}
              </label>
              <textarea
                id="field-desc"
                name="description"
                aria-label={t('vacancies.labelDescription')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                maxLength={14000}
                rows={4}
                placeholder="What the role owns, what the team does, what you offer..."
                className="form-control-textarea"
              />
            </div>

            {/* Requirements Section */}
            <div className="form-requirements-section">
              <div className="requirements-header-row">
                <h3 className="requirements-title">{t('vacancies.requirementsHeading')}</h3>
                <button
                  type="button"
                  className="add-requirement-btn"
                  aria-label={t('vacancies.addRequirement')}
                  disabled={requirements.length >= 40}
                  onClick={() =>
                    setRequirements((v) => [...v, { name: '', description: '', required: true }])
                  }
                >
                  <Plus size={15} /> {t('common.add')}
                </button>
              </div>

              <div className="requirements-list">
                {requirements.map((r, i) => (
                  <div className="requirement-row-card" key={i}>
                    <div className="requirement-fields">
                      <input
                        aria-label={`Requirement ${i + 1}`}
                        maxLength={200}
                        value={r.name}
                        placeholder={t('vacancies.reqNamePlaceholder')}
                        className="requirement-name-input"
                        onChange={(e) =>
                          setRequirements((v) =>
                            v.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                          )
                        }
                      />
                      <input
                        aria-label={`Requirement ${i + 1} details`}
                        maxLength={1000}
                        value={r.description || ''}
                        placeholder={t('vacancies.reqDescPlaceholder')}
                        className="requirement-details-input"
                        onChange={(e) =>
                          setRequirements((v) =>
                            v.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)),
                          )
                        }
                      />
                    </div>

                    <button
                      type="button"
                      className={`must-have-toggle ${r.required ? 'checked' : ''}`}
                      onClick={() =>
                        setRequirements((v) =>
                          v.map((x, j) => (j === i ? { ...x, required: !x.required } : x)),
                        )
                      }
                    >
                      <div className="must-have-circle">
                        <Check size={11} className="check-mark" />
                      </div>
                      <span>{t('vacancies.reqRequired')}</span>
                    </button>

                    <button
                      type="button"
                      className="requirement-delete-btn"
                      aria-label={`Remove requirement ${i + 1}`}
                      onClick={() =>
                        setRequirements((v) =>
                          v.length > 1
                            ? v.filter((_, j) => j !== i)
                            : [{ name: '', description: '', required: true }],
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {hhFields && <div className="mt-5 rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">hh.uz maydonlari</h3>
              <p className="mt-1 text-sm text-slate-500">HeadHunter’da e’lon qilish uchun to‘ldiring. Telegram e’loni uchun talab qilinmaydi.</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  { label: 'Hudud', value: hhAreaId, set: setHhAreaId, options: hhFields.areas },
                  { label: 'Kasb yo‘nalishi', value: hhProfessionalRoleId, set: setHhProfessionalRoleId, options: hhFields.roles },
                  { label: 'Tajriba', value: hhExperienceId, set: setHhExperienceId, options: hhFields.experiences },
                  { label: 'Bandlik', value: hhEmploymentId, set: setHhEmploymentId, options: hhFields.employments },
                  { label: 'Ish jadvali', value: hhScheduleId, set: setHhScheduleId, options: hhFields.schedules },
                ].map(field => <label key={field.label} className="text-sm text-slate-700">{field.label}<select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" value={field.value} onChange={event => field.set(event.target.value)}><option value="">Tanlang</option>{field.options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>)}
              </div>
            </div>}
          </div>
        ) : (
          <div
            id="vacancy-ai-panel"
            role="tabpanel"
            aria-labelledby="vacancy-ai-tab"
            className="vacancy-editor-ai"
            style={{ padding: '16px 0' }}
          >
            <VacancyGenerator
              configured={Boolean(user?.aiConfigured)}
              disabled={busy}
              apply={(draft) => {
                setTitle(draft.title);
                setDescription(draft.description);
                setRequirements(draft.requirements);
                const parsed = parseDescriptionMeta(draft.description, draft.title);
                setDepartment(parsed.department);
                setLocation(parsed.location);
                setEmploymentType(parsed.employmentType);
                setSeniority(parsed.seniority);
                setTab('details');
                toast.success(t('vacancyGenerator.draftApplied'));
              }}
            />
          </div>
        )}

        {/* Modal Footer Actions */}
        <div className="modal-footer-actions">
          <button type="button" className="btn-modal-cancel" onClick={close}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="btn-modal-submit"
            aria-label={value ? t('vacancies.saveVacancy') : t('vacancies.createVacancy')}
            disabled={busy}
          >
            {busy ? t('vacancies.saving') : value ? t('vacancies.saveVacancy') : t('vacancies.createVacancy')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface VacancyMeta {
  department: string;
  location: string;
  workModel: string;
  seniority: string;
  employmentType: string;
  openedDate: string;
  cleanDescription: string;
}

function getVacancyMeta(v: Vacancy): VacancyMeta {
  const parsed = parseDescriptionMeta(v.description || '', v.title || '');
  const department = parsed.department;

  const loc = parsed.location;
  let location = 'Tashkent';
  let workModel = 'Hybrid';

  if (loc.includes('·')) {
    const parts = loc.split('·').map((s) => s.trim());
    location = parts[0] || 'Tashkent';
    workModel = parts[1] || 'Hybrid';
  } else if (loc.toLowerCase().includes('remote')) {
    location = 'Remote';
    workModel = 'CET ±3';
  } else {
    location = loc;
    workModel = /on-site|onsite/i.test(v.title) ? 'On-site' : 'Hybrid';
  }

  const openedDate = `Opened ${new Date(v.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;

  return {
    department,
    location,
    workModel,
    seniority: parsed.seniority,
    employmentType: parsed.employmentType,
    openedDate,
    cleanDescription: parsed.description,
  };
}

export function Vacancies() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Vacancy | null>(null);
  const [deletingVacancy, setDeletingVacancy] = useState<Vacancy | null>(null);
  const [topModalVacancyId, setTopModalVacancyId] = useState<number | null>(null);
  const [publishing, setPublishing] = useState<Vacancy | null>(null);
  const [open, setOpen] = useState(params.has('new'));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [openStatusAccordion, setOpenStatusAccordion] = useState<string>('');
  const statusAccordionRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState('');

  const statusOptions = [
    { label: t('vacancies.statusAll'), value: 'ALL' },
    { label: t('vacancies.statusActive'), value: 'ACTIVE' },
    { label: t('vacancies.statusDraft'), value: 'DRAFT' },
    { label: t('vacancies.statusClosed'), value: 'CLOSED' },
  ];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (statusAccordionRef.current && !statusAccordionRef.current.contains(e.target as Node)) {
        setOpenStatusAccordion('');
      }
    }
    if (openStatusAccordion) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [openStatusAccordion]);
  const { data, error, reload } = useData<Page<Vacancy>>(
    `/vacancies?page=${page}&search=${encodeURIComponent(search)}`,
  );

  const rawList = data?.items ?? [];

  const filteredItems = rawList.filter((vacancy) => {
    const matchesStatus = statusFilter === 'ALL' || vacancy.status === statusFilter;
    if (!matchesStatus) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const meta = getVacancyMeta(vacancy);
    return (
      vacancy.title.toLowerCase().includes(q) ||
      vacancy.description.toLowerCase().includes(q) ||
      meta.department.toLowerCase().includes(q) ||
      meta.location.toLowerCase().includes(q) ||
      meta.workModel.toLowerCase().includes(q) ||
      meta.seniority.toLowerCase().includes(q)
    );
  });

  const close = () => {
    setOpen(false);
    setEditing(null);
    setParams({});
  };

  async function confirmDelete(v: Vacancy) {
    try {
      await api(`/vacancies/${v.id}`, { method: 'DELETE' });
      toast.success(`"${v.title}" ${t('vacancies.deletedSuccess')}`);
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setDeletingVacancy(null);
    }
  }

  return (
    <div className="vacancies-page-root">
      {/* Page Header matching screenshot */}
      <div className="vacancies-page-header">
        <div className="vacancies-header-text">
          <div className="vacancies-eyebrow">{t('pipeline.eyebrow')}</div>
          <h1 className="vacancies-title">{t('vacancies.title')}</h1>
          <p className="vacancies-subtitle">{t('vacancies.subtitle')}</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          className="vacancies-create-btn"
        >
          <Plus size={16} /> {t('vacancies.createVacancy')}
        </Button>
      </div>

      {/* Filter Toolbar matching screenshot */}
      <div className="vacancies-toolbar">
        <div className="vacancies-search-box">
          <Search className="vacancies-search-icon" size={17} />
          <input
            type="text"
            aria-label={t('vacancies.searchPlaceholder')}
            placeholder={t('vacancies.searchToolbarPlaceholder')}
            value={search}
            className="vacancies-search-input"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="relative w-[170px]" ref={statusAccordionRef}>
          <Accordion
            type="single"
            collapsible
            value={openStatusAccordion}
            onValueChange={setOpenStatusAccordion}
            className="w-full"
          >
            <AccordionItem value="status" className="border-none">
              <AccordionTrigger className="vacancies-filter-trigger h-10 px-3.5 py-0 text-xs font-normal text-slate-800 rounded-xl bg-white border border-slate-200 hover:no-underline hover:border-slate-300 shadow-sm transition-all flex items-center justify-between data-[state=open]:border-[#1a5d4c] data-[state=open]:ring-2 data-[state=open]:ring-[#1a5d4c]/15">
                <span className="truncate pr-2 text-left">
                  {statusOptions.find((opt) => opt.value === statusFilter)?.label || t('vacancies.statusAll')}
                </span>
              </AccordionTrigger>
              <AccordionContent
                containerClassName="absolute right-0 top-[calc(100%+6px)] z-50 w-[170px] rounded-xl border border-slate-200 bg-white shadow-2xl animate-in fade-in-0 zoom-in-95"
                className="p-1.5 space-y-0.5"
              >
                {statusOptions.map((opt) => {
                  const isSelected = statusFilter === opt.value;
                  return (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => {
                        setStatusFilter(opt.value);
                        setOpenStatusAccordion('');
                      }}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg text-left transition-colors cursor-pointer',
                        isSelected
                          ? 'bg-[#eaf5ef] text-[#165b4c] font-medium active-filter'
                          : 'text-slate-700 hover:bg-slate-50',
                      )}
                    >
                      <span>{opt.label}</span>
                      {isSelected && (
                        <Check size={14} className="text-[#1a5d4c] filter-check-icon shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>

      <Alert message={error || actionError} />

      {!data && !error ? (
        <Loading />
      ) : (
        <>
          {filteredItems.length ? (
            <div className="vacancies-cards-grid">
              {filteredItems.map((v) => {
                const meta = getVacancyMeta(v);
                const appCount = v._count?.applications ?? (v.status === 'DRAFT' ? 1 : 1);
                return (
                  <div className="vacancy-clean-card group" key={v.id}>
                    <div className="vacancy-card-top">
                      <h2 className="vacancy-card-heading">{v.title}</h2>
                      <span className={`vacancy-pill-badge status-${v.status.toLowerCase()}`}>
                        {v.status === 'ACTIVE'
                          ? t('vacancies.statusActive')
                          : v.status === 'DRAFT'
                            ? t('vacancies.statusDraft')
                            : t('vacancies.statusClosed')}
                      </span>
                    </div>

                    <div className="vacancy-card-meta-line">
                      {meta.department} · {meta.location} · {meta.workModel}
                    </div>

                    <p className="vacancy-card-blurb">{meta.cleanDescription || v.description}</p>

                    <div className="vacancy-card-bottom">
                      <div className="vacancy-footer-meta-tags">
                        <span className="tag-item">{meta.seniority}</span>
                        <span className="tag-item">{meta.employmentType}</span>
                        <span className="tag-item">{t('vacancies.applicationsCount', { count: appCount })}</span>
                        <span className="tag-item">{meta.openedDate}</span>
                      </div>

                      <div className="vacancy-quick-actions">
                        <button
                          type="button"
                          className="quick-action-btn"
                          aria-label={`${t('vacancies.publishPlatform')}: ${v.title}`}
                          title={t('vacancies.publishPlatform')}
                          onClick={() => setPublishing(v)}
                        ><Send size={14} /></button>
                        {v.status === 'ACTIVE' && v.publicToken && (
                          <button
                            type="button"
                            className="quick-action-btn"
                            aria-label={`${t('vacancies.copyApplyLink')} for ${v.title}`}
                            title={t('vacancies.copyApplyLink')}
                            onClick={() => {
                              void navigator.clipboard.writeText(`${window.location.origin}/apply/${v.publicToken}`)
                                .then(() => toast.success(t('vacancies.copyApplySuccess')))
                                .catch(() => setActionError(t('vacancies.copyApplyFailed')));
                            }}
                          >
                            <Link2 size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="quick-action-btn text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200"
                          aria-label={`${t('vacancies.viewTop3')} for ${v.title}`}
                          title={t('vacancies.viewTop3')}
                          onClick={() => setTopModalVacancyId(v.id)}
                        >
                          <Sparkles size={14} className="text-emerald-600" />
                        </button>
                        <button
                          type="button"
                          className="quick-action-btn"
                          aria-label={`${t('common.edit')} ${v.title}`}
                          title={`${t('common.edit')} ${v.title}`}
                          onClick={() => {
                            setEditing(v);
                            setOpen(true);
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="quick-action-btn danger"
                          aria-label={`${t('common.delete')} ${v.title}`}
                          title={`${t('common.delete')} ${v.title}`}
                          onClick={() => setDeletingVacancy(v)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <section className="panel">
              <Empty
                title={
                  search || statusFilter !== 'ALL'
                    ? t('vacancies.emptySearchTitle')
                    : t('vacancies.makeFirstTitle')
                }
                text={
                  search || statusFilter !== 'ALL'
                    ? t('vacancies.emptySearchSubtitle')
                    : t('vacancies.makeFirstSubtitle')
                }
              >
                <Button onClick={() => setOpen(true)}>
                  <Plus size={16} /> {t('vacancies.createVacancy')}
                </Button>
              </Empty>
            </section>
          )}
          {data && (
            <Pagination
              page={page}
              total={statusFilter === 'ALL' && !search ? data.total : filteredItems.length}
              setPage={setPage}
            />
          )}
        </>
      )}

      {open && (
        <VacancyForm
          value={editing}
          close={close}
          saved={() => {
            close();
            reload();
          }}
        />
      )}

      <AlertDialog
        open={Boolean(deletingVacancy)}
        onOpenChange={(open) => !open && setDeletingVacancy(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('vacancies.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('vacancies.deleteConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#dc2626] text-white hover:bg-[#b91c1c]"
              onClick={() => deletingVacancy && void confirmDelete(deletingVacancy)}
            >
              {t('vacancies.deleteVacancy')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TopCandidatesModal
        vacancyId={topModalVacancyId}
        open={Boolean(topModalVacancyId)}
        onClose={() => setTopModalVacancyId(null)}
        onApplicationStageChanged={() => reload()}
      />
      {publishing && <PublicationModal vacancy={publishing} close={() => { setPublishing(null); reload(); }} />}
    </div>
  );
}
