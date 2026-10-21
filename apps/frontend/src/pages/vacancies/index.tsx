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
  Badge,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
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
import type { Page, Vacancy, VacancyField, Requirement } from '../../types';
import { useAuth } from '../../features/auth';
import { VacancyGenerator } from '../../features/create-vacancy';
import { TopCandidatesModal } from '../../features/ai-matching';
import { PublicationModal } from './publication-modal';

type HhFields = { areas: Array<{ id: string; name: string }>; roles: Array<{ id: string; name: string }>; experiences: Array<{ id: string; name: string }>; employments: Array<{ id: string; name: string }>; schedules: Array<{ id: string; name: string }> };

export function parseDescriptionMeta(rawDescription: string) {
  const match = rawDescription.match(/^Department: ([^\r\n]+)\r?\nLocation: ([^\r\n]+)\r?\nEmployment type: ([^\r\n]+)\r?\nSeniority: ([^\r\n]+)\r?\n\r?\n/);
  if (!match) return { description: rawDescription, department: '', location: '', workModel: '', employmentType: '', seniority: '' };
  const locationParts = match[2].trim().match(/^(.*?) · (Hybrid|On-site|Remote)$/);
  return {
    description: rawDescription.slice(match[0].length),
    department: match[1].trim(),
    location: locationParts ? locationParts[1] : match[2].trim(),
    workModel: locationParts ? locationParts[2] : '',
    employmentType: match[3].trim(),
    seniority: match[4].trim(),
  };
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
  const initialMeta = parseDescriptionMeta(value?.description || '');

  const [title, setTitle] = useState(value?.title ?? '');
  const [department, setDepartment] = useState(value?.department ?? initialMeta.department);
  const [fieldId, setFieldId] = useState(value?.fieldId ? String(value.fieldId) : '');
  const [fieldOptions, setFieldOptions] = useState<VacancyField[]>([]);
  const [location, setLocation] = useState(value?.location ?? initialMeta.location);
  const [workModel, setWorkModel] = useState(value?.workModel ?? initialMeta.workModel);
  const [employmentType, setEmploymentType] = useState(value?.employmentType ?? initialMeta.employmentType);
  const [seniority, setSeniority] = useState(value?.seniority ?? initialMeta.seniority);
  const [confirmMetadataReview, setConfirmMetadataReview] = useState(false);
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
    void api<VacancyField[]>('/vacancy-fields')
      .then((list) => Array.isArray(list) && setFieldOptions(list))
      .catch(() => undefined);
  }, []);

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

    try {
      await send(
        `/vacancies${value ? `/${value.id}` : ''}`,
        {
          title: title.trim(),
          description: cleanDesc,
          department: department.trim() || null,
          fieldId: fieldId ? Number(fieldId) : null,
          location: location.trim() || null,
          workModel: workModel || null,
          employmentType: employmentType || null,
          seniority: seniority || null,
          confirmMetadataReview,
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
        {error && <p className="text-sm text-amber-900">{t('vacancies.fixFormError')}</p>}

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
                  placeholder={t('vacancies.optionalPlaceholder')}
                  className="form-control-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="field-bot-field">{t('vacancies.labelField')}</label>
                <select id="field-bot-field" className="form-control-select" value={fieldId} onChange={(e) => setFieldId(e.target.value)}>
                  <option value="">{t('vacancies.fieldOther')}</option>
                  {fieldOptions.filter((f) => f.isActive || String(f.id) === fieldId).map((f) => (<option key={f.id} value={String(f.id)}>{f.name}</option>))}
                </select>
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
                  placeholder={t('vacancies.optionalPlaceholder')}
                  className="form-control-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="field-work-model">{t('vacancies.labelWorkModel')}</label>
                <select id="field-work-model" className="form-control-select" value={workModel} onChange={(e) => setWorkModel(e.target.value)}>
                  <option value="">{t('vacancies.notSpecified')}</option>
                  <option value="On-site">{t('vacancies.workModelOnSite', 'On-site')}</option>
                  <option value="Hybrid">{t('vacancies.workModelHybrid', 'Hybrid')}</option>
                  <option value="Remote">{t('vacancies.workModelRemote', 'Remote')}</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="field-employment">{t('vacancies.labelEmploymentType')}</label>
                <select id="field-employment" className="form-control-select" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
                  <option value="">{t('vacancies.notSpecified')}</option>
                  <option value="Full-time">{t('vacancies.empFullTime', 'Full-time')}</option>
                  <option value="Part-time">{t('vacancies.empPartTime', 'Part-time')}</option>
                  <option value="Contract">{t('vacancies.empContract', 'Contract')}</option>
                  <option value="Internship">{t('vacancies.empInternship', 'Internship')}</option>
                </select>
              </div>

              {/* Row 3 */}
              <div className="form-group">
                <label className="form-label" htmlFor="field-seniority">{t('vacancies.labelSeniority')}</label>
                <select id="field-seniority" className="form-control-select" value={seniority} onChange={(e) => setSeniority(e.target.value)}>
                  <option value="">{t('vacancies.notSpecified')}</option>
                  <option value="Junior">{t('vacancies.seniorityJunior', 'Junior')}</option>
                  <option value="Middle">{t('vacancies.seniorityMiddle', 'Middle')}</option>
                  <option value="Senior">{t('vacancies.senioritySenior', 'Senior')}</option>
                  <option value="Lead">{t('vacancies.seniorityLead', 'Lead')}</option>
                </select>
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
            {value?.metadataReviewRequired && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900" role="status">
                <strong>{t('vacancies.reviewRequired')}</strong>
                <p className="text-sm mt-1">{t('vacancies.reviewExplanation')}</p>
                <label className="mt-2 flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={confirmMetadataReview} onChange={(event) => setConfirmMetadataReview(event.target.checked)} />
                  {t('vacancies.confirmMetadata')}
                </label>
              </div>
            )}
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
                placeholder={t('vacancies.descPlaceholder', 'What the role owns, what the team does, what you offer...')}
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
              <h3 className="font-semibold text-slate-900">{t('vacancies.hhFieldsTitle', 'hh.uz maydonlari')}</h3>
              <p className="mt-1 text-sm text-slate-500">{t('vacancies.hhFieldsDesc', 'HeadHunter’da e’lon qilish uchun to‘ldiring. Telegram e’loni uchun talab qilinmaydi.')}</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  { label: t('vacancies.hhArea', 'Hudud'), value: hhAreaId, set: setHhAreaId, options: hhFields.areas },
                  { label: t('vacancies.hhRole', 'Kasb yo‘nalishi'), value: hhProfessionalRoleId, set: setHhProfessionalRoleId, options: hhFields.roles },
                  { label: t('vacancies.hhExperience', 'Tajriba'), value: hhExperienceId, set: setHhExperienceId, options: hhFields.experiences },
                  { label: t('vacancies.hhEmployment', 'Bandlik'), value: hhEmploymentId, set: setHhEmploymentId, options: hhFields.employments },
                  { label: t('vacancies.hhSchedule', 'Ish jadvali'), value: hhScheduleId, set: setHhScheduleId, options: hhFields.schedules },
                ].map(field => <label key={field.label} className="text-sm text-slate-700">{field.label}<select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" value={field.value} onChange={event => field.set(event.target.value)}><option value="">{t('common.select', 'Tanlang')}</option>{field.options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>)}
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
                setRequirements(draft.requirements);
                const parsed = parseDescriptionMeta(draft.description);
                setDescription(parsed.description);
                if (parsed.department) setDepartment(parsed.department);
                if (parsed.location) setLocation(parsed.location);
                if (parsed.workModel) setWorkModel(parsed.workModel);
                if (parsed.employmentType) setEmploymentType(parsed.employmentType);
                if (parsed.seniority) setSeniority(parsed.seniority);
                setTab('details');
                toast.success(t('vacancyGenerator.draftApplied'));
              }}
            />
          </div>
        )}

        {/* Modal Footer Actions */}
        <div className="modal-footer-actions">
          <Button type="button" variant="outline" className="btn-modal-cancel" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            className="btn-modal-submit"
            aria-label={value ? t('vacancies.saveVacancy') : t('vacancies.createVacancy')}
            disabled={busy}
          >
            {busy ? t('vacancies.saving') : value ? t('vacancies.saveVacancy') : t('vacancies.createVacancy')}
          </Button>
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
  const parsed = parseDescriptionMeta(v.description || '');

  const openedDate = new Date(v.createdAt).toLocaleDateString();

  return {
    department: v.department ?? parsed.department,
    location: v.location ?? parsed.location,
    workModel: v.workModel ?? parsed.workModel,
    seniority: v.seniority ?? parsed.seniority,
    employmentType: v.employmentType ?? parsed.employmentType,
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
  const search = params.get('search') ?? '';
  const statusFilter = params.get('status') ?? 'ALL';
  const [openStatusAccordion, setOpenStatusAccordion] = useState<string>('');
  const statusAccordionRef = useRef<HTMLDivElement>(null);
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [actionError, setActionError] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const updateParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  };

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
    `/vacancies?page=${page}&search=${encodeURIComponent(debouncedSearch)}${statusFilter !== 'ALL' ? `&status=${encodeURIComponent(statusFilter)}` : ''}`,
  );

  const filteredItems = data?.items ?? [];

  const close = () => {
    setOpen(false);
    setEditing(null);
    updateParams({ new: null });
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
          <Input
            type="text"
            aria-label={t('vacancies.searchPlaceholder')}
            placeholder={t('vacancies.searchToolbarPlaceholder')}
            value={search}
            className="vacancies-search-input"
            onChange={(e) => {
              updateParams({ search: e.target.value, page: null });
            }}
          />
        </div>

        <div className="relative h-[44px] w-[170px]" ref={statusAccordionRef}>
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
                        updateParams({ status: opt.value === 'ALL' ? null : opt.value, page: null });
                        setOpenStatusAccordion('');
                      }}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg text-left transition-colors cursor-pointer',
                        isSelected
                          ? 'bg-[#eaf5ef] dark:bg-[#17302a] text-[#165b4c] dark:text-[#58c0a0] font-medium active-filter'
                          : 'text-slate-700 hover:bg-slate-50',
                      )}
                    >
                      <span>{opt.label}</span>
                      {isSelected && (
                        <Check size={14} className="text-[#1a5d4c] dark:text-[#58c0a0] filter-check-icon shrink-0 ml-2" />
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
                const appCount = v._count?.applications ?? 0;
                return (
                  <Card className="vacancy-clean-card group" key={v.id}>
                    <div className="vacancy-card-top">
                      <h2 className="vacancy-card-heading">{v.title}</h2>
                      <span className={`vacancy-pill-badge status-${v.status.toLowerCase()}`}>
                        {v.status === 'ACTIVE'
                          ? t('vacancies.statusActive')
                          : v.status === 'DRAFT'
                            ? t('vacancies.statusDraft')
                            : t('vacancies.statusClosed')}
                      </span>
                      {v.metadataReviewRequired && <Badge className="border-amber-300 bg-amber-50 text-amber-900">{t('vacancies.reviewRequired')}</Badge>}
                    </div>

                    <div className="vacancy-card-meta-line">
                      {[meta.department, meta.location, meta.workModel].map((item) => item || t('vacancies.notSpecified')).join(' · ')}
                    </div>

                    <p className="vacancy-card-blurb">{meta.cleanDescription || v.description}</p>

                    <div className="vacancy-card-bottom">
                      <div className="vacancy-footer-meta-tags">
                        {v.field && <span className="tag-item">{v.field.name}</span>}
                        <span className="tag-item">{meta.seniority || t('vacancies.notSpecified')}</span>
                        <span className="tag-item">{meta.employmentType || t('vacancies.notSpecified')}</span>
                        <span className="tag-item">{t('vacancies.applicationsCount', { count: appCount })}</span>
                        <span className="tag-item">{t('vacancies.openedDate', { date: meta.openedDate })}</span>
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
                  </Card>
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
              total={data.total}
              setPage={(nextPage) => updateParams({ page: nextPage === 1 ? null : String(nextPage) })}
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
