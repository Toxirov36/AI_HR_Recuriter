import { useState, useEffect, useMemo } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  FileCheck2,
  GripVertical,
  LayoutGrid,
  List as ListIcon,
  Mail,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Sparkles,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  ChevronDown,
  Check,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, send } from '../../lib/api';
import { useAuth } from '../../features/auth';
import { InterviewReviewEditor } from '../../features/interview-generator';
import {
  getEvidenceSummary,
  sortApplications,
  type PipelineSortOption,
} from '../../lib/match-score';
import {
  AiConsent,
  Alert,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  Input,
  label,
  Loading,
  Modal,
  PageTitle,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useData,
} from '../../components/ui';
import { stages, nextStage } from '../../types';
import type { Application, Candidate, Page, Stage, Vacancy } from '../../types';

function RecordSelect({
  kind,
  onSelect,
}: {
  kind: 'candidates' | 'vacancies';
  onSelect: (id: number) => void;
}) {
  const [selected, setSelected] = useState<Candidate | Vacancy | null>(null);
  const endpoint =
    kind === 'vacancies'
      ? `/vacancies?excludeClosed=true&pageSize=100`
      : `/candidates?pageSize=100`;
  const { data, error } = useData<Page<Candidate | Vacancy>>(endpoint);

  const rawItems = useMemo(() => {
    if (!data?.items) return [];
    return data.items.filter((x) => {
      if ('status' in x && x.status === 'CLOSED') return false;
      return true;
    });
  }, [data?.items]);

  const groupedData = useMemo<{ value: string; items: (Vacancy | Candidate)[] }[]>(() => {
    if (kind === 'vacancies') {
      const vacancies = rawItems as Vacancy[];
      const active = vacancies.filter((v) => v.status === 'ACTIVE');
      const draft = vacancies.filter((v) => v.status === 'DRAFT');
      const other = vacancies.filter((v) => v.status !== 'ACTIVE' && v.status !== 'DRAFT');
      const groups: { value: string; items: (Vacancy | Candidate)[] }[] = [];
      if (active.length > 0) groups.push({ value: 'Active Positions', items: active });
      if (draft.length > 0) groups.push({ value: 'Draft Positions', items: draft });
      if (other.length > 0) groups.push({ value: 'Other Positions', items: other });
      if (groups.length === 0 && vacancies.length > 0) {
        groups.push({ value: 'Available Positions', items: vacancies });
      }
      return groups;
    } else {
      const candidates = rawItems as Candidate[];
      const withCv = candidates.filter((c) => c.resumeName || c.resumeText);
      const withoutCv = candidates.filter((c) => !c.resumeName && !c.resumeText);
      const groups: { value: string; items: (Candidate | Vacancy)[] }[] = [];
      if (withCv.length > 0) groups.push({ value: 'Candidates with CV', items: withCv });
      if (withoutCv.length > 0) groups.push({ value: 'Other Candidates', items: withoutCv });
      if (groups.length === 0 && candidates.length > 0) {
        groups.push({ value: 'Available Candidates', items: candidates });
      }
      return groups;
    }
  }, [kind, rawItems]);

  const handleSelect = (item: Candidate | Vacancy | null) => {
    setSelected(item);
    onSelect(item ? item.id : 0);
  };

  const totalCount = rawItems.length;

  return (
    <div className="form-group mb-5">
      <div className="flex items-center justify-between mb-2">
        <label className="form-label text-sm font-semibold text-slate-800">
          <span>{kind === 'candidates' ? 'Select candidate' : 'Select vacancy'}</span>
          <span className="text-red-500 font-bold ml-1">*</span>
        </label>
        {totalCount > 0 && (
          <span className="text-xs text-slate-500 font-medium px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200/60">
            {totalCount} available
          </span>
        )}
      </div>

      <Alert message={error} />

      <Combobox items={groupedData} value={selected} onValueChange={handleSelect}>
        <ComboboxInput
          aria-label={kind === 'candidates' ? 'Search candidate' : 'Search vacancy'}
          placeholder={
            kind === 'candidates' ? 'Select or search a candidate…' : 'Select or search a vacancy…'
          }
        />
        <ComboboxContent>
          <ComboboxEmpty>
            {kind === 'candidates' ? 'No candidates found.' : 'No vacancies found.'}
          </ComboboxEmpty>
          <ComboboxList>
            {(group: { value: string; items: (Candidate | Vacancy)[] }, index: number) => (
              <ComboboxGroup key={group.value} items={group.items}>
                <ComboboxLabel>{group.value}</ComboboxLabel>
                <ComboboxCollection>
                  {(item: Candidate | Vacancy) => {
                    const title = 'fullName' in item ? item.fullName : item.title;
                    const subtitle =
                      'email' in item
                        ? item.email || (item.resumeName ? 'CV attached' : 'No CV')
                        : 'status' in item
                          ? item.status
                          : null;

                    return (
                      <ComboboxItem key={item.id} value={item}>
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-slate-900 truncate">{title}</span>
                          {subtitle && (
                            <span className="text-xs text-slate-400 truncate font-normal">
                              {subtitle}
                            </span>
                          )}
                        </div>
                      </ComboboxItem>
                    );
                  }}
                </ComboboxCollection>
                {index < groupedData.length - 1 && <ComboboxSeparator />}
              </ComboboxGroup>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

function ApplicationForm({ close, saved }: { close: () => void; saved: () => void }) {
  const [candidateId, setCandidate] = useState(0);
  const [vacancyId, setVacancy] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await send('/applications', { candidateId, vacancyId });
      toast.success('Application created successfully');
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Create an application"
      subtitle="Connect a candidate to a vacancy to begin reviewing their evidence."
      close={close}
      className="application-modal-custom"
    >
      <form onSubmit={submit} className="vacancy-modal-body">
        <Alert message={error} />
        <RecordSelect kind="candidates" onSelect={setCandidate} />
        <RecordSelect kind="vacancies" onSelect={setVacancy} />
        <div className="modal-footer-actions">
          <button type="button" className="btn-modal-cancel" onClick={close}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-modal-submit"
            disabled={busy || !candidateId || !vacancyId}
          >
            {busy ? 'Creating…' : 'Create application'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const stageDescriptions: Record<Stage, string> = {
  NEW: 'Just arrived, not reviewed yet',
  REVIEWING: 'Evidence and CV under review',
  INTERVIEW: 'Interview in progress',
  OFFER: 'Offer sent or being prepared',
  HIRED: 'Successfully joined the team',
  REJECTED: 'Closed applications',
};

function daysBetween(date?: string | null) {
  if (!date) return 0;
  const timestamp = new Date(date).getTime();
  if (Number.isNaN(timestamp)) return 0;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function applicationOwner(application: Application) {
  const history = application.stageHistory ?? [];
  const latest = [...history].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];
  return latest?.actorName || 'Unassigned';
}

function daysInCurrentStage(application: Application) {
  const history = application.stageHistory ?? [];
  const latestCurrentStage = [...history]
    .filter((entry) => entry.toStatus === application.status)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  return daysBetween(latestCurrentStage?.createdAt || application.createdAt);
}

function nextActionFor(application: Application) {
  const hasEvidence = Boolean(getEvidenceSummary(application.analysis));
  switch (application.status) {
    case 'NEW':
      return hasEvidence ? 'Review evidence' : 'Review the CV';
    case 'REVIEWING':
      return 'Complete HR review';
    case 'INTERVIEW':
      return application.interviewReview?.scorecard?.finalDecision &&
        application.interviewReview.scorecard.finalDecision !== 'UNDECIDED'
        ? 'Prepare decision'
        : 'Complete scorecard';
    case 'OFFER':
      return 'Follow up on offer';
    case 'HIRED':
      return 'Process completed';
    case 'REJECTED':
      return 'Application archived';
  }
}

function sourceLabel(candidate: Candidate) {
  if (!candidate.source) return 'Website';
  return candidate.source.charAt(0) + candidate.source.slice(1).toLowerCase();
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts.at(-1)![0] : name.slice(0, 2)).toUpperCase();
}

type PipelineViewMode = 'board' | 'list';

export function Pipeline() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const sortBy: PipelineSortOption = 'created_desc';
  const [selectedVacancy, setSelectedVacancy] = useState('all');
  const [selectedStage, setSelectedStage] = useState<'all' | Stage>('all');
  const [mobileStage, setMobileStage] = useState<Stage>('NEW');
  const [viewMode, setViewMode] = useState<PipelineViewMode>('board');
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<Stage | null>(null);
  const [pendingMove, setPendingMove] = useState<{ app: Application; stage: Stage } | null>(null);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, error, reload } = useData<Page<Application>>(
    `/applications?page=${page}&search=${encodeURIComponent(debouncedSearch)}`,
  );
  const { data: vacanciesData } = useData<Page<Vacancy>>(
    '/vacancies?excludeClosed=true&pageSize=100',
  );
  const [localItems, setLocalItems] = useState<Application[]>([]);

  useEffect(() => {
    if (data?.items) setLocalItems(data.items);
  }, [data?.items]);

  const vacanciesList = useMemo(() => {
    const vacancyMap = new Map<number, string>();
    for (const vacancy of vacanciesData?.items ?? []) {
      if (vacancy.status !== 'CLOSED') vacancyMap.set(vacancy.id, vacancy.title);
    }
    for (const application of localItems) {
      if (application.vacancy?.status !== 'CLOSED') {
        vacancyMap.set(application.vacancy.id, application.vacancy.title);
      }
    }
    return Array.from(vacancyMap, ([id, title]) => ({ id, title }));
  }, [localItems, vacanciesData?.items]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const filtered = localItems.filter((application) => {
      if (selectedVacancy !== 'all' && String(application.vacancyId) !== selectedVacancy) {
        return false;
      }
      if (selectedStage !== 'all' && application.status !== selectedStage) return false;
      if (!normalizedSearch) return true;
      return [
        application.candidate.fullName,
        application.candidate.email,
        application.candidate.phone,
        application.vacancy.title,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
    return sortApplications(filtered, sortBy);
  }, [localItems, search, selectedStage, selectedVacancy, sortBy]);

  const activeApplications = filteredItems.filter(
    (application) => application.status !== 'HIRED' && application.status !== 'REJECTED',
  );
  const interviewCutoff = Date.now() - 7 * 86_400_000;
  const interviewsThisWeek = filteredItems.filter((application) =>
    (application.stageHistory ?? []).some(
      (entry) =>
        entry.toStatus === 'INTERVIEW' && new Date(entry.createdAt).getTime() >= interviewCutoff,
    ),
  ).length;
  const offersPending = filteredItems.filter(
    (application) => application.status === 'OFFER',
  ).length;
  const averageDays = activeApplications.length
    ? Math.round(
        activeApplications.reduce(
          (sum, application) => sum + daysBetween(application.createdAt),
          0,
        ) / activeApplications.length,
      )
    : 0;

  const summaryCards = [
    {
      label: 'Active candidates',
      value: activeApplications.length,
      detail: 'In an open stage',
      icon: Users,
    },
    {
      label: 'Interviews this week',
      value: interviewsThisWeek,
      detail: 'Moved to Interview in 7 days',
      icon: CalendarDays,
    },
    {
      label: 'Offers pending',
      value: offersPending,
      detail: 'Awaiting a reply',
      icon: FileCheck2,
    },
    {
      label: 'Avg. time in process',
      value: `${averageDays}d`,
      detail: 'From application to today',
      icon: Clock3,
    },
  ];

  async function moveApplication(application: Application, newStage: Stage) {
    if (application.status === newStage) return;
    const originalStatus = application.status;
    setMoving(true);
    setLocalItems((items) =>
      items.map((item) => (item.id === application.id ? { ...item, status: newStage } : item)),
    );
    try {
      await send(
        `/applications/${application.id}/status`,
        { status: newStage, expectedStatus: originalStatus },
        'PUT',
      );
      toast.success(`${application.candidate.fullName} moved to ${label(newStage)}`);
      setPendingMove(null);
      reload();
    } catch (moveError) {
      setLocalItems((items) =>
        items.map((item) =>
          item.id === application.id ? { ...item, status: originalStatus } : item,
        ),
      );
      toast.error((moveError as Error).message || 'Failed to update stage');
    } finally {
      setMoving(false);
    }
  }

  function requestMove(application: Application, stage: Stage) {
    if (application.status !== stage) setPendingMove({ app: application, stage });
  }

  function handleDragStart(event: React.DragEvent, application: Application) {
    event.dataTransfer.setData('text/plain', String(application.id));
    event.dataTransfer.effectAllowed = 'move';
    setDraggingId(application.id);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverColumn(null);
  }

  function handleDrop(event: React.DragEvent, stage: Stage) {
    event.preventDefault();
    const applicationId = Number(event.dataTransfer.getData('text/plain'));
    const application = localItems.find((item) => item.id === applicationId);
    setDraggingId(null);
    setDragOverColumn(null);
    if (application) requestMove(application, stage);
  }

  function renderCard(application: Application) {
    const evidence = getEvidenceSummary(application.analysis);
    const owner = applicationOwner(application);
    const days = daysInCurrentStage(application);
    const isDragging = draggingId === application.id;
    return (
      <article
        className={`application-card pipeline-candidate-card ${isDragging ? 'is-dragging' : ''}`}
        key={application.id}
        draggable
        onDragStart={(event) => handleDragStart(event, application)}
        onDragEnd={handleDragEnd}
      >
        <div className="application-card-head">
          <span className="pipeline-drag-handle" aria-hidden="true">
            <GripVertical size={15} />
          </span>
          <span className="avatar">{initials(application.candidate.fullName)}</span>
          <div className="pipeline-card-person">
            <Link to={`/applications/${application.id}`}>{application.candidate.fullName}</Link>
            <span>{application.vacancy.title}</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="application-menu"
                aria-label={`Actions for ${application.candidate.fullName}`}
              >
                <MoreHorizontal size={17} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {stages.map((stage) => (
                <DropdownMenuItem
                  key={stage}
                  disabled={stage === application.status}
                  onClick={() => requestMove(application, stage)}
                >
                  {label(stage)}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to={`/applications/${application.id}`}>Open application</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="pipeline-card-meta">
          <span>{sourceLabel(application.candidate)}</span>
          <span>
            <UserRound size={12} /> {owner}
          </span>
          <span>
            <Clock3 size={12} /> {days}d in stage
          </span>
        </div>

        {(application.candidate.email || application.candidate.phone) && (
          <div className="pipeline-card-contacts">
            {application.candidate.email && (
              <span title={application.candidate.email}>
                <Mail size={12} />
                {application.candidate.email}
              </span>
            )}
            {application.candidate.phone && (
              <span title={application.candidate.phone}>
                <Phone size={12} />
                {application.candidate.phone}
              </span>
            )}
          </div>
        )}

        <div className="pipeline-card-review">
          <span className={evidence ? 'is-reviewed' : 'needs-review'}>
            {evidence ? 'Evidence reviewed' : 'Needs review'}
          </span>
          <span>{nextActionFor(application)}</span>
        </div>

        <Link className="pipeline-card-open" to={`/applications/${application.id}`}>
          Open details <ArrowRight size={15} />
        </Link>
      </article>
    );
  }

  return (
    <div className="pipeline-page pipeline-redesign">
      <PageTitle
        eyebrow="HIRING"
        title="Hiring pipeline"
        text="Every application in one board. Stage changes are made by a person and recorded."
      >
        <button className="primary" onClick={() => setOpen(true)}>
          <Plus size={17} /> Add candidate
        </button>
      </PageTitle>

      <section className="pipeline-summary-grid" aria-label="Pipeline summary">
        {summaryCards.map((card) => (
          <article key={card.label} className="pipeline-summary-card">
            <span className="pipeline-summary-icon">
              <card.icon size={18} />
            </span>
            <div>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.detail}</small>
            </div>
          </article>
        ))}
      </section>

      <section className="pipeline-filterbar" aria-label="Pipeline filters">
        <Select value={selectedVacancy} onValueChange={setSelectedVacancy}>
          <SelectTrigger
            value={selectedVacancy}
            className="h-10 w-full rounded-xl border border-[#e2e8f0] bg-white text-sm text-[#0f172a] shadow-none hover:border-[#cbd5e1] focus:border-[#1a5d4c] focus:ring-2 focus:ring-[#1a5d4c]/15"
            aria-label="Filter by vacancy"
          >
            <SelectValue placeholder="All vacancies" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">All vacancies</SelectItem>
            {vacanciesList.map((vacancy) => (
              <SelectItem key={vacancy.id} value={String(vacancy.id)}>
                {vacancy.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex items-center w-full">
          <Search size={16} className="absolute left-3 text-[#94a3b8] pointer-events-none" aria-hidden="true" />
          <Input
            id="pipeline-search-input"
            aria-label="Search the pipeline"
            placeholder="Search candidates…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="h-10 w-full pl-9 pr-8 rounded-xl border border-[#e2e8f0] bg-white text-sm text-[#0f172a] placeholder:text-[#94a3b8] shadow-none hover:border-[#cbd5e1] focus-visible:border-[#1a5d4c] focus-visible:ring-2 focus-visible:ring-[#1a5d4c]/15"
          />
          {search && (
            <button
              type="button"
              className="absolute right-2.5 flex items-center justify-center w-5 h-5 rounded-full text-[#64748b] hover:text-[#0f172a] hover:bg-[#e2e8f0] transition-colors"
              aria-label="Clear search"
              onClick={() => {
                setSearch('');
                setPage(1);
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        <Select value={selectedStage} onValueChange={(val) => setSelectedStage(val as 'all' | Stage)}>
          <SelectTrigger
            value={selectedStage}
            className="h-10 w-full rounded-xl border border-[#e2e8f0] bg-white text-sm text-[#0f172a] shadow-none hover:border-[#cbd5e1] focus:border-[#1a5d4c] focus:ring-2 focus:ring-[#1a5d4c]/15"
            aria-label="Filter by stage"
          >
            <SelectValue placeholder="All stages" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">All stages</SelectItem>
            {stages.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {label(stage)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="pipeline-view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={viewMode === 'board' ? 'active' : ''}
            aria-pressed={viewMode === 'board'}
            onClick={() => setViewMode('board')}
          >
            <LayoutGrid size={15} /> Board
          </button>
          <button
            type="button"
            className={viewMode === 'list' ? 'active' : ''}
            aria-pressed={viewMode === 'list'}
            onClick={() => setViewMode('list')}
          >
            <ListIcon size={15} /> List
          </button>
        </div>
      </section>

      <Alert message={error} />
      {!data && !localItems.length && !error ? (
        <Loading />
      ) : filteredItems.length ? (
        <>
          {viewMode === 'board' ? (
            <section className="pipeline-board-shell">
              <div className="pipeline-board-heading">
                <div>
                  <strong>Candidate journey</strong>
                  <span>Drag a card or use its menu. Every move asks for confirmation.</span>
                </div>
                <span className="pipeline-board-hint">
                  Scroll horizontally to see every stage →
                </span>
              </div>

              <div className="pipeline-mobile-stage">
                <span>Stage</span>
                <Select
                  value={mobileStage}
                  onValueChange={(val) => setMobileStage(val as Stage)}
                >
                  <SelectTrigger
                    value={mobileStage}
                    className="h-10 w-full rounded-xl border border-[#e2e8f0] bg-white text-sm text-[#0f172a] shadow-none hover:border-[#cbd5e1] focus:border-[#1a5d4c] focus:ring-2 focus:ring-[#1a5d4c]/15"
                    aria-label="Select stage view"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {stages.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {label(stage)} ·{' '}
                        {filteredItems.filter((item) => item.status === stage).length}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="kanban" aria-label="Hiring pipeline board">
                {stages.map((stage) => {
                  const applications = filteredItems.filter(
                    (application) => application.status === stage,
                  );
                  return (
                    <section
                      key={stage}
                      data-stage={stage}
                      data-mobile-active={mobileStage === stage}
                      className={`kanban-column stage-${stage.toLowerCase()} ${dragOverColumn === stage ? 'is-drag-over' : ''}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        setDragOverColumn(stage);
                      }}
                      onDragLeave={() => setDragOverColumn(null)}
                      onDrop={(event) => handleDrop(event, stage)}
                    >
                      <header>
                        <div className="pipeline-stage-heading">
                          <span className="pipeline-stage-dot" />
                          <div>
                            <strong>{label(stage)}</strong>
                            <small>{stageDescriptions[stage]}</small>
                          </div>
                        </div>
                        <span className="stage-count">{applications.length}</span>
                      </header>
                      <div className="kanban-card-list">
                        {applications.map(renderCard)}
                        {!applications.length && (
                          <div className="empty-lane">
                            <span aria-hidden="true">
                              <Users size={16} />
                            </span>
                            <strong>No candidates here</strong>
                            <p>Move a candidate here when they reach this stage.</p>
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="pipeline-list-shell" aria-label="Applications list">
              <div className="pipeline-list-head">
                <span>Candidate</span>
                <span>Vacancy</span>
                <span>Stage</span>
                <span>Owner</span>
                <span>Time</span>
                <span>Next action</span>
                <span />
              </div>
              {filteredItems.map((application) => (
                <article className="pipeline-list-row" key={application.id}>
                  <div className="pipeline-list-candidate">
                    <span className="avatar">{initials(application.candidate.fullName)}</span>
                    <div>
                      <Link to={`/applications/${application.id}`}>
                        {application.candidate.fullName}
                      </Link>
                      <small>
                        {application.candidate.email || sourceLabel(application.candidate)}
                      </small>
                    </div>
                  </div>
                  <span data-label="Vacancy">{application.vacancy.title}</span>
                  <span data-label="Stage">
                    <Badge value={application.status} />
                  </span>
                  <span data-label="Owner">{applicationOwner(application)}</span>
                  <span data-label="Time">{daysInCurrentStage(application)}d</span>
                  <span data-label="Next action">{nextActionFor(application)}</span>
                  <Link
                    className="pipeline-list-open"
                    to={`/applications/${application.id}`}
                    aria-label={`Open ${application.candidate.fullName}`}
                  >
                    <ArrowRight size={16} />
                  </Link>
                </article>
              ))}
            </section>
          )}
          <Pagination page={page} total={data?.total ?? filteredItems.length} setPage={setPage} />
        </>
      ) : (
        <section className="panel">
          <Empty
            title="No matching applications"
            text="Change the filters or add a candidate to a vacancy."
          />
        </section>
      )}

      {open && (
        <ApplicationForm
          close={() => setOpen(false)}
          saved={() => {
            setOpen(false);
            reload();
          }}
        />
      )}

      <AlertDialog
        open={Boolean(pendingMove)}
        onOpenChange={(isOpen) => !isOpen && !moving && setPendingMove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Move candidate to {pendingMove ? label(pendingMove.stage) : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingMove?.app.candidate.fullName} will move from{' '}
              {pendingMove ? label(pendingMove.app.status) : ''} to{' '}
              {pendingMove ? label(pendingMove.stage) : ''}. This change will be recorded in the
              stage history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={moving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={moving}
              onClick={(event) => {
                event.preventDefault();
                if (pendingMove) void moveApplication(pendingMove.app, pendingMove.stage);
              }}
            >
              {moving ? 'Moving…' : 'Confirm move'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function ApplicationDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: a, error, reload } = useData<Application>(`/applications/${id}`);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState('');
  const [actionError, setError] = useState('');
  const [reviewDirty, setReviewDirty] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const aiBlocked = Boolean(a?.candidate.publicSubmittedAt && !a?.candidate.aiConsentAt);

  async function action(kind: 'analyze' | 'questions') {
    setBusy(kind);
    setError('');
    try {
      await send(`/applications/${id}/${kind}`, { consent });
      toast.success(kind === 'analyze' ? 'CV evidence matched' : 'Interview questions generated');
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function changeStatus(status: Stage) {
    setBusy('status');
    setError('');
    try {
      await send(`/applications/${id}/status`, { status, expectedStatus: a?.status }, 'PUT');
      if (status === 'INTERVIEW') {
        toast.success(`Moved application to Interview · Auto-invitation sent`);
      } else if (status === 'REJECTED') {
        toast.success(`Moved application to Rejected · Rejection message sent`);
      } else {
        toast.success(`Moved application to ${label(status)}`);
      }
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function confirmDelete() {
    setBusy('delete');
    try {
      await api(`/applications/${id}`, { method: 'DELETE' });
      toast.success('Application deleted');
      window.location.assign('/pipeline');
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
    }
  }
  return (
    <>
      <Link to="/pipeline" className="back-link">
        <ArrowLeft size={16} /> Back to pipeline
      </Link>
      <Alert message={error || actionError} />
      {!a && !error ? (
        <Loading />
      ) : (
        a && (
          <>
            <PageTitle
              eyebrow="APPLICATION REVIEW"
              title={a.candidate.fullName}
              text={a.vacancy.title}
            >
              <div className="row wrap stage-actions">
                {nextStage[a.status] && (
                  <button
                    className="primary"
                    disabled={Boolean(busy) || reviewDirty}
                    onClick={() => void changeStatus(nextStage[a.status]!)}
                  >
                    {busy === 'status' ? 'Moving…' : 'Move to ' + label(nextStage[a.status]!)}{' '}
                    <ArrowRight size={16} />
                  </button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="vacancies-filter-trigger stage-filter-trigger"
                      aria-label="Pipeline stage"
                      disabled={Boolean(busy) || reviewDirty}
                    >
                      <span>{label(a.status)}</span>
                      <ChevronDown size={15} className="filter-chevron" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="vacancies-filter-popover w-[170px]">
                    {stages.map((s) => {
                      const isSelected = a.status === s;
                      return (
                        <DropdownMenuItem
                          key={s}
                          onClick={() => void changeStatus(s)}
                          className={`vacancies-filter-item ${isSelected ? 'active-filter' : ''}`}
                        >
                          <span>{label(s)}</span>
                          {isSelected && <Check size={15} className="filter-check-icon" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  className="icon-button danger"
                  aria-label="Delete application"
                  disabled={Boolean(busy) || reviewDirty}
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </PageTitle>
            <div className="stage-progress" aria-label="Application progress">
              <span>Current stage</span>
              <Badge value={a.status} />
              {nextStage[a.status] ? (
                <>
                  <ArrowRight size={16} />
                  <span>Next: {label(nextStage[a.status]!)}</span>
                </>
              ) : (
                <span>Final stage</span>
              )}
              {reviewDirty && (
                <span className="muted">
                  Save interview notes to change stage or regenerate AI results.
                </span>
              )}
            </div>
            <div className="review-notice">
              <ShieldCheck size={22} />
              <div>
                <strong>Faktik dalillar — Insoniy qaror</strong>
                <span>
                  Ushbu tahlil nomzod rezyumesidan olingan faktik dalillarni ko‘rsatadi. Bu ishga
                  qabul qilish bo‘yicha AI tavsiyasi emas — yakuniy qarorni faqat interviewer qabul
                  qiladi.
                </span>
              </div>
              <Link to={`/candidates/${a.candidateId}`}>
                CV ko‘rish <ArrowRight size={16} />
              </Link>
            </div>

            <section className="panel evidence-panel">
              <div className="panel-heading">
                <div>
                  <h2>AI topgan dalillar (CV Evidence Breakdown)</h2>
                  <p>
                    CV matnidan olingan faktik dalillar. AI nomzodlarni baholamaydi — qarorni faqat
                    inson qabul qiladi.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="primary"
                    disabled={
                      !consent ||
                      aiBlocked ||
                      !user?.aiConfigured ||
                      !a.candidate.resumeText ||
                      Boolean(busy) ||
                      reviewDirty
                    }
                    onClick={() => void action('analyze')}
                  >
                    <Sparkles size={15} />
                    {busy === 'analyze'
                      ? 'Tahlil qilinmoqda…'
                      : a.analysis
                        ? 'Qayta tahlil qilish'
                        : 'CV dalillarini tahlil qilish'}
                  </button>
                  <span className="count-chip">{a.vacancy.requirements.length} talab</span>
                </div>
              </div>
              <div className="px-4 py-2 bg-slate-50 border-b flex items-center justify-between">
                <AiConsent
                  checked={consent}
                  onChange={setConsent}
                  configured={Boolean(user?.aiConfigured)}
                />
                {aiBlocked && <span className="text-xs text-amber-700">Nomzod AI tahliliga rozilik bermagan.</span>}
                {!a.candidate.resumeText && (
                  <span className="text-xs text-amber-600">Avval nomzod profiliga CV yuklang.</span>
                )}
              </div>
              {a.vacancy.requirements.length ? (
                a.vacancy.requirements.map((r) => {
                  const evidence = a.analysis?.requirements.find((e) => e.requirementId === r.id);
                  return (
                    <article className="evidence-item" key={r.id}>
                      <div className="row between">
                        <div>
                          <h3>
                            {r.name}
                            <span className="required-label">
                              {r.required ? 'Majburiy' : 'Afzallik'}
                            </span>
                          </h3>
                          {r.description && <p className="muted">{r.description}</p>}
                        </div>
                        {evidence ? (
                          <Badge value={evidence.status} />
                        ) : (
                          <span className="muted small">Tahlil qilinmagan</span>
                        )}
                      </div>
                      {evidence && (
                        <>
                          <p>{evidence.explanation}</p>
                          {evidence.quotes.map((q, i) => (
                            <blockquote key={i}>
                              {q}
                              <small>CV matnidan aniq parcha</small>
                            </blockquote>
                          ))}
                        </>
                      )}
                    </article>
                  );
                })
              ) : (
                <Empty
                  title="Vakansiyada talablar kiritilmagan"
                  text="Ushbu vakansiyani tahrirlab, talablarni qo‘shing."
                />
              )}
              <div className="evidence-legend">
                <span>
                  <b>Supported</b> Aniq tasdiqlangan dalil
                </span>
                <span>
                  <b>Partial</b> Qisman dalil mavjud
                </span>
                <span>
                  <b>Not found</b> CV ichida dalil topilmadi (nomzod bilmaydi degani emas — suhbatda
                  aniqlashtirish zarur)
                </span>
                <span>
                  <b>Unknown</b> Aniq xulosa yo‘q, suhbatda aniqlash zarur
                </span>
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Interview guide & Scorecard</h2>
                  <p>Suhbat savollari bo‘yicha javoblar va strukturaviy baholash scorecard.</p>
                </div>
                <button
                  className="secondary"
                  disabled={
                    !consent ||
                    aiBlocked ||
                    !user?.aiConfigured ||
                    !a.candidate.resumeText ||
                    Boolean(busy) ||
                    reviewDirty
                  }
                  onClick={() => void action('questions')}
                >
                  <Sparkles size={15} />
                  {busy === 'questions'
                    ? 'Savollar tayyorlanmoqda…'
                    : a.interviewQuestions
                      ? 'Savollarni qayta yaratish'
                      : 'Suhbat savollarini yaratish'}
                </button>
              </div>
              <InterviewReviewEditor
                key={a.id + ':' + a.reviewRevision + ':' + JSON.stringify(a.interviewQuestions)}
                application={a}
                disabled={Boolean(busy)}
                onDirty={setReviewDirty}
                onSaving={(saving) => setBusy(saving ? 'review' : '')}
              />
            </section>
            <section className="panel padded stage-history">
              <h2>Stage history</h2>
              <p className="muted">Who moved this application, and when.</p>
              {a.stageHistory?.length ? (
                <ol>
                  {a.stageHistory.map((entry) => (
                    <li key={entry.id}>
                      <div className="row wrap">
                        <strong>
                          {entry.fromStatus
                            ? label(entry.fromStatus) + ' → ' + label(entry.toStatus)
                            : 'Application created · ' + label(entry.toStatus)}
                        </strong>
                      </div>
                      <span className="muted small">
                        {entry.actorName} ·{' '}
                        <time dateTime={entry.createdAt}>
                          {new Date(entry.createdAt).toLocaleString()}
                        </time>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">
                  No recorded changes yet. Earlier stage changes were not tracked.
                </p>
              )}
            </section>
            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete application?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete this application and its analysis. The candidate and vacancy
                    will be kept.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => void confirmDelete()}
                  >
                    {busy === 'delete' ? 'Deleting…' : 'Delete application'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )
      )}
    </>
  );
}
