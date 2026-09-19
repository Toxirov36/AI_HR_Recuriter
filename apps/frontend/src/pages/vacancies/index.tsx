import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, ChevronDown, Plus, Search, Pencil, Trash2, Sparkles } from 'lucide-react';
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
        },
        value ? 'PUT' : 'POST',
      );
      toast.success(value ? 'Vacancy updated successfully!' : 'Vacancy created successfully!');
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={value ? 'Edit vacancy' : 'Create vacancy'}
      subtitle="Write it yourself, or let the assistant prepare a draft you review before applying."
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
            Details
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
            <Sparkles size={14} className="tab-sparkle-icon" /> AI draft
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
                  Title
                </label>
                <input
                  id="field-title"
                  name="title"
                  aria-label="Job title"
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
                  Department
                </label>
                <input
                  id="field-dept"
                  name="department"
                  aria-label="Department"
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
                  Location
                </label>
                <input
                  id="field-loc"
                  name="location"
                  aria-label="Location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  maxLength={100}
                  placeholder="Tashkent · Hybrid"
                  className="form-control-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Employment type</label>
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
                <label className="form-label">Seniority</label>
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
                <label className="form-label">Status</label>
                <div className="form-select-wrapper">
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger
                      className="form-control-select status-select-field"
                      aria-label="Status"
                    >
                      <SelectValue placeholder="Draft" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DRAFT">Draft</SelectItem>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="CLOSED">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="form-group" style={{ marginTop: '16px' }}>
              <label className="form-label" htmlFor="field-desc">
                Description
              </label>
              <textarea
                id="field-desc"
                name="description"
                aria-label="Description"
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
                <h3 className="requirements-title">Requirements</h3>
                <button
                  type="button"
                  className="add-requirement-btn"
                  aria-label="Add requirement"
                  disabled={requirements.length >= 40}
                  onClick={() =>
                    setRequirements((v) => [...v, { name: '', description: '', required: true }])
                  }
                >
                  <Plus size={15} /> Add
                </button>
              </div>

              <div className="requirements-list">
                {requirements.map((r, i) => (
                  <div className="requirement-row-card" key={i}>
                    <div className="requirement-fields">
                      <input
                        aria-label={`Requirement ${i + 1}`}
                        required
                        maxLength={200}
                        value={r.name}
                        placeholder={`Requirement ${i + 1}`}
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
                        placeholder="Evidence or experience to look for (optional)"
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
                      <span>Must have</span>
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
              configured={user.aiConfigured}
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
                toast.success('Draft applied. Review it before saving.');
              }}
            />
          </div>
        )}

        {/* Modal Footer Actions */}
        <div className="modal-footer-actions">
          <button type="button" className="btn-modal-cancel" onClick={close}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-modal-submit"
            aria-label={value ? 'Save vacancy' : 'Create vacancy'}
            disabled={busy}
          >
            {busy ? 'Saving...' : value ? 'Save vacancy' : 'Create vacancy'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const SAMPLE_VACANCIES: Vacancy[] = [
  {
    id: 101,
    title: 'Senior Backend Engineer',
    description:
      'We are looking for a senior backend engineer to own our billing and integrations services. You will design APIs, mentor mid-level engineers and...',
    status: 'ACTIVE',
    createdAt: '2026-08-20T10:00:00.000Z',
    requirements: [
      { id: 1, name: 'Billing and integrations services', required: true },
      { id: 2, name: 'API design & mentoring', required: true },
    ],
    _count: { applications: 3 },
  },
  {
    id: 102,
    title: 'Middle NestJS Developer',
    description:
      'Join the platform team to build and maintain REST services, work on API design, testing and integrations with interna...',
    status: 'ACTIVE',
    createdAt: '2026-09-08T10:00:00.000Z',
    requirements: [
      { id: 3, name: 'REST service architecture', required: true },
      { id: 4, name: 'API design and testing', required: true },
    ],
    _count: { applications: 1 },
  },
  {
    id: 103,
    title: 'Product Designer',
    description:
      'Own end-to-end product design for our HR platform: research, flows, interface design and design-system upkeep.',
    status: 'ACTIVE',
    createdAt: '2026-09-01T10:00:00.000Z',
    requirements: [
      { id: 5, name: 'Interface design and design system upkeep', required: true },
      { id: 6, name: 'End-to-end research and user flows', required: true },
    ],
    _count: { applications: 1 },
  },
  {
    id: 104,
    title: 'Technical Recruiter',
    description: 'Help us grow the engineering team with structured, humane hiring processes.',
    status: 'DRAFT',
    createdAt: '2026-09-13T10:00:00.000Z',
    requirements: [
      { id: 7, name: 'Structured hiring processes', required: true },
      { id: 8, name: 'Engineering talent screening', required: true },
    ],
    _count: { applications: 1 },
  },
];

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

const statusOptions = [
  { label: 'All statuses', value: 'ALL' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Closed', value: 'CLOSED' },
];

export function Vacancies() {
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Vacancy | null>(null);
  const [deletingVacancy, setDeletingVacancy] = useState<Vacancy | null>(null);
  const [open, setOpen] = useState(params.has('new'));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState('');
  const { data, error, reload } = useData<Page<Vacancy>>(
    `/vacancies?page=${page}&search=${encodeURIComponent(search)}`,
  );

  const rawList = data?.items && data.items.length > 0 ? data.items : SAMPLE_VACANCIES;

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
      toast.success(`"${v.title}" vacancy deleted`);
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
          <div className="vacancies-eyebrow">HIRING</div>
          <h1 className="vacancies-title">Vacancies</h1>
          <p className="vacancies-subtitle">Every open, draft and closed role in your workspace.</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          className="vacancies-create-btn"
        >
          <Plus size={16} /> Create vacancy
        </Button>
      </div>

      {/* Filter Toolbar matching screenshot */}
      <div className="vacancies-toolbar">
        <div className="vacancies-search-box">
          <Search className="vacancies-search-icon" size={17} />
          <input
            type="text"
            aria-label="Search vacancies"
            placeholder="Search by title, team or location..."
            value={search}
            className="vacancies-search-input"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="vacancies-filter-trigger"
              aria-label="Filter vacancies by status"
            >
              <span>
                {statusOptions.find((opt) => opt.value === statusFilter)?.label || 'All statuses'}
              </span>
              <ChevronDown size={15} className="filter-chevron" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="vacancies-filter-popover w-[170px]">
            {statusOptions.map((opt) => {
              const isSelected = statusFilter === opt.value;
              return (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setStatusFilter(opt.value)}
                  className={`vacancies-filter-item ${isSelected ? 'active-filter' : ''}`}
                >
                  <span>{opt.label}</span>
                  {isSelected && <Check size={15} className="filter-check-icon" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
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
                          ? 'Active'
                          : v.status === 'DRAFT'
                            ? 'Draft'
                            : 'Closed'}
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
                        <span className="tag-item">{appCount} applications</span>
                        <span className="tag-item">{meta.openedDate}</span>
                      </div>

                      <div className="vacancy-quick-actions">
                        <button
                          type="button"
                          className="quick-action-btn"
                          aria-label={`Edit ${v.title}`}
                          title={`Edit ${v.title}`}
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
                          aria-label={`Delete ${v.title}`}
                          title={`Delete ${v.title}`}
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
                    ? 'No matching vacancies'
                    : 'Make your first opportunity'
                }
                text={
                  search || statusFilter !== 'ALL'
                    ? 'Try a different search or status filter.'
                    : 'Add a role and the evidence you want to explore with candidates.'
                }
              >
                <Button onClick={() => setOpen(true)}>
                  <Plus size={16} /> Create vacancy
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
            <AlertDialogTitle>Delete vacancy?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingVacancy?.title}</strong> and its
              applications? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#dc2626] text-white hover:bg-[#b91c1c]"
              onClick={() => deletingVacancy && void confirmDelete(deletingVacancy)}
            >
              Delete vacancy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
