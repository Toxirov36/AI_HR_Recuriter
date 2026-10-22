import { useState, useEffect, useMemo } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  FileCheck2,
  FileText,
  GripVertical,
  LayoutGrid,
  List as ListIcon,
  Mail,
  MoreHorizontal,
  Phone,
  Plus,
  Printer,
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
import { getEvidenceSummary } from '../../lib/match-score';
import { CandidateDossierModal } from '../../components/candidate-dossier-modal';
import { InterviewPanel } from '../../features/interviews/interview-panel';
import { TopCandidatesModal } from '../../features/ai-matching';
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
  Badge,
  Button,
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
  getStageLabel,
} from '../../components/ui';
import { getSystemLabel } from '../../i18n/utils';
import { stages, nextStage } from '../../types';
import type { Application, Candidate, Page, Stage, Vacancy } from '../../types';

function RecordSelect({
  kind,
  onSelect,
}: {
  kind: 'candidates' | 'vacancies';
  onSelect: (id: number) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Candidate | Vacancy | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const endpoint =
    kind === 'vacancies'
      ? `/vacancies?search=${encodeURIComponent(debouncedQuery)}`
      : `/candidates?search=${encodeURIComponent(debouncedQuery)}`;
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
      if (active.length > 0) groups.push({ value: t('pipeline.activePositions', 'Active Positions'), items: active });
      if (draft.length > 0) groups.push({ value: t('pipeline.draftPositions', 'Draft Positions'), items: draft });
      if (other.length > 0) groups.push({ value: t('pipeline.otherPositions', 'Other Positions'), items: other });
      if (groups.length === 0 && vacancies.length > 0) {
        groups.push({ value: t('pipeline.availablePositions', 'Available Positions'), items: vacancies });
      }
      return groups;
    } else {
      const candidates = rawItems as Candidate[];
      const withCv = candidates.filter((c) => c.resumeName || c.resumeText);
      const withoutCv = candidates.filter((c) => !c.resumeName && !c.resumeText);
      const groups: { value: string; items: (Candidate | Vacancy)[] }[] = [];
      if (withCv.length > 0) groups.push({ value: t('pipeline.candidatesWithCv', 'Candidates with CV'), items: withCv });
      if (withoutCv.length > 0) groups.push({ value: t('pipeline.otherCandidates', 'Other Candidates'), items: withoutCv });
      if (groups.length === 0 && candidates.length > 0) {
        groups.push({ value: t('pipeline.availableCandidates', 'Available Candidates'), items: candidates });
      }
      return groups;
    }
  }, [kind, rawItems, t]);

  const handleSelect = (item: Candidate | Vacancy | null) => {
    setSelected(item);
    if (!item) setQuery('');
    onSelect(item ? item.id : 0);
  };

  const totalCount = rawItems.length;

  return (
    <div className="form-group mb-5">
      <div className="flex items-center justify-between mb-2">
        <label className="form-label text-sm font-semibold text-slate-800">
          <span>{kind === 'candidates' ? t('pipeline.selectCandidate', 'Select candidate') : t('pipeline.selectVacancy', 'Select vacancy')}</span>
          <span className="text-red-500 font-bold ml-1">*</span>
        </label>
        {totalCount > 0 && (
          <span className="text-xs text-slate-500 font-medium px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200/60">
            {totalCount} {t('pipeline.available', 'available')}
          </span>
        )}
      </div>

      <Alert message={error} />

      <Combobox items={groupedData} value={selected} onValueChange={handleSelect}>
        <ComboboxInput
          onChange={(event) => setQuery(event.target.value)}
          aria-label={kind === 'candidates' ? t('pipeline.searchCandidate', 'Search candidate') : t('pipeline.searchVacancy', 'Search vacancy')}
          placeholder={
            kind === 'candidates' ? t('pipeline.selectOrSearchCandidate', 'Select or search a candidate…') : t('pipeline.selectOrSearchVacancy', 'Select or search a vacancy…')
          }
        />
        <ComboboxContent>
          <ComboboxEmpty>
            {kind === 'candidates' ? t('pipeline.noCandidatesFound', 'No candidates found.') : t('pipeline.noVacanciesFound', 'No vacancies found.')}
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
                        ? item.email || (item.resumeName ? t('pipeline.cvAttached', 'CV attached') : t('pipeline.noCv', 'No CV'))
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
  const { t } = useTranslation();
  const [candidateId, setCandidate] = useState(0);
  const [vacancyId, setVacancy] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await send('/applications', { candidateId, vacancyId });
      toast.success(t('pipeline.appCreatedSuccess', 'Application created successfully'));
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={t('pipeline.modalCreateTitle', 'Create an application')}
      subtitle={t('pipeline.createAppDesc', 'Connect a candidate to a vacancy to begin reviewing their evidence.')}
      close={close}
      className="application-modal-custom"
    >
      <form onSubmit={submit} className="vacancy-modal-body">
        <Alert message={error} />
        <RecordSelect kind="candidates" onSelect={setCandidate} />
        <RecordSelect kind="vacancies" onSelect={setVacancy} />
        <div className="modal-footer-actions">
          <button type="button" className="btn-modal-cancel" onClick={close}>
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            type="submit"
            className="btn-modal-submit"
            disabled={busy || !candidateId || !vacancyId}
          >
            {busy ? t('pipeline.creating', 'Creating…') : t('pipeline.createAppButton', 'Create application')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function getStageDescription(stage: Stage, t?: (key: string, def: string) => string) {
  const map: Record<Stage, { key: string; fallback: string }> = {
    NEW: { key: 'pipeline.stageDescNew', fallback: 'Just arrived, not reviewed yet' },
    REVIEWING: { key: 'pipeline.stageDescReviewing', fallback: 'Evidence and CV under review' },
    INTERVIEW: { key: 'pipeline.stageDescInterview', fallback: 'Interview in progress' },
    OFFER: { key: 'pipeline.stageDescOffer', fallback: 'Offer sent or being prepared' },
    HIRED: { key: 'pipeline.stageDescHired', fallback: 'Successfully joined the team' },
    REJECTED: { key: 'pipeline.stageDescRejected', fallback: 'Closed applications' },
  };
  return t ? t(map[stage].key, map[stage].fallback) : map[stage].fallback;
}

function daysBetween(date?: string | null) {
  if (!date) return 0;
  const timestamp = new Date(date).getTime();
  if (Number.isNaN(timestamp)) return 0;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function applicationOwner(application: Application, unassignedLabel = 'Unassigned') {
  const history = application.stageHistory ?? [];
  const latest = [...history].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];
  return latest?.actorName || unassignedLabel;
}

function daysInCurrentStage(application: Application) {
  const history = application.stageHistory ?? [];
  const latestCurrentStage = [...history]
    .filter((entry) => entry.toStatus === application.status)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  return daysBetween(latestCurrentStage?.createdAt || application.createdAt);
}

function nextActionFor(application: Application, t?: (key: string, def: string) => string) {
  const hasEvidence = Boolean(getEvidenceSummary(application.analysis));
  switch (application.status) {
    case 'NEW':
      return hasEvidence
        ? t ? t('pipeline.actionReviewEvidence', 'Review evidence') : 'Review evidence'
        : t ? t('pipeline.actionReviewCv', 'Review the CV') : 'Review the CV';
    case 'REVIEWING':
      return t ? t('pipeline.actionCompleteHrReview', 'Complete HR review') : 'Complete HR review';
    case 'INTERVIEW':
      return t ? t('pipeline.actionReviewOutcome', 'Review interview outcome') : 'Review interview outcome';
    case 'OFFER':
      return t ? t('pipeline.actionFollowUpOffer', 'Follow up on offer') : 'Follow up on offer';
    case 'HIRED':
      return t ? t('pipeline.actionProcessCompleted', 'Process completed') : 'Process completed';
    case 'REJECTED':
      return t ? t('pipeline.actionArchived', 'Application archived') : 'Application archived';
  }
}

function sourceLabel(candidate: Candidate) {
  if (!candidate.source) return getSystemLabel('WEBSITE');
  return getSystemLabel(candidate.source);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts.at(-1)![0] : name.slice(0, 2)).toUpperCase();
}

type PipelineViewMode = 'board' | 'list';

export function Pipeline() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const selectedVacancy = params.get('vacancyId') ?? 'all';
  const selectedStage = (params.get('stage') ?? 'all') as 'all' | Stage;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [vacancySearch, setVacancySearch] = useState('');
  const [debouncedVacancySearch, setDebouncedVacancySearch] = useState('');
  const [open, setOpen] = useState(false);
  const [dossierApp, setDossierApp] = useState<Application | null>(null);
  const [topCandidatesVacancyId, setTopCandidatesVacancyId] = useState<number | null>(null);
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
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedVacancySearch(vacancySearch), 250);
    return () => clearTimeout(timer);
  }, [vacancySearch]);
  const updateParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  };

  const { data, error, reload } = useData<Page<Application> & { stageCounts: Partial<Record<Stage, number>> }>(
    `/applications?page=${page}&search=${encodeURIComponent(debouncedSearch)}${selectedStage !== 'all' ? `&stage=${selectedStage}` : ''}${selectedVacancy !== 'all' ? `&vacancyId=${selectedVacancy}` : ''}&sort=newest`,
  );
  const { data: vacanciesData } = useData<Page<Vacancy>>(
    `/vacancies?search=${encodeURIComponent(debouncedVacancySearch)}`,
  );
  const [selectedVacancyData, setSelectedVacancyData] = useState<Vacancy | null>(null);
  useEffect(() => {
    if (selectedVacancy === 'all') { setSelectedVacancyData(null); return; }
    let active = true;
    void api<Vacancy>(`/vacancies/${selectedVacancy}`).then((item) => { if (active) setSelectedVacancyData(item); }).catch(() => { if (active) setSelectedVacancyData(null); });
    return () => { active = false; };
  }, [selectedVacancy]);
  const [localItems, setLocalItems] = useState<Application[]>([]);

  useEffect(() => {
    setLocalItems(data?.items ?? []);
  }, [data?.items]);

  const vacanciesList = useMemo(() => {
    const vacancyMap = new Map<number, string>();
    for (const vacancy of vacanciesData?.items ?? []) {
      if (vacancy.status !== 'CLOSED') vacancyMap.set(vacancy.id, vacancy.title);
    }
    if (selectedVacancyData) vacancyMap.set(selectedVacancyData.id, selectedVacancyData.title);
    for (const application of localItems) {
      if (application.vacancy?.status !== 'CLOSED') {
        vacancyMap.set(application.vacancy.id, application.vacancy.title);
      }
    }
    return Array.from(vacancyMap, ([id, title]) => ({ id, title }));
  }, [localItems, vacanciesData?.items, selectedVacancyData]);

  const filteredItems = localItems;
  const stageCounts = data?.stageCounts ?? {};
  const activeCount = (stageCounts.NEW ?? 0) + (stageCounts.REVIEWING ?? 0) + (stageCounts.INTERVIEW ?? 0) + (stageCounts.OFFER ?? 0);

  const summaryCards = [
    {
      label: t('pipeline.activeCandidates', 'Active candidates'),
      value: activeCount,
      detail: t('pipeline.inOpenStage', 'In an open stage'),
      icon: Users,
    },
    {
      label: t('pipeline.interviewStage', 'Interview stage'),
      value: stageCounts.INTERVIEW ?? 0,
      detail: t('pipeline.allMatchingApps', 'All matching applications'),
      icon: CalendarDays,
    },
    {
      label: t('pipeline.offersPending', 'Offers pending'),
      value: stageCounts.OFFER ?? 0,
      detail: t('pipeline.awaitingReply', 'Awaiting a reply'),
      icon: FileCheck2,
    },
    {
      label: t('pipeline.newStage', 'New applications'),
      value: stageCounts.NEW ?? 0,
      detail: t('pipeline.allMatchingApps', 'All matching applications'),
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
      toast.success(
        t('applications.movedSuccess', {
          stage: getStageLabel(newStage, t),
          defaultValue: `${application.candidate.fullName} moved to ${getStageLabel(newStage, t)}`,
        }),
      );
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
    const owner = applicationOwner(application, t('pipeline.unassigned', 'Unassigned'));
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
              <DropdownMenuLabel>{t('pipeline.moveToStage', 'Move to stage')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {stages.map((stage) => (
                <DropdownMenuItem
                  key={stage}
                  disabled={stage === application.status}
                  onClick={() => requestMove(application, stage)}
                >
                  {getStageLabel(stage, t)}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              {application.status !== 'REJECTED' && application.status !== 'HIRED' && (
                <DropdownMenuItem asChild>
                  <Link to={`/applications/${application.id}?schedule=1`}>{t('interviews.scheduleButton', 'Schedule interview')}</Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link to={`/applications/${application.id}`}>{t('pipeline.openApplication', 'Open application')}</Link>
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
            <Clock3 size={12} /> {t('pipeline.inStageDays', { days, defaultValue: `${days}d in stage` })}
          </span>
        </div>

        {application.assessmentScore != null && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-[11px] font-semibold my-1.5">
            <Sparkles size={12} className="text-emerald-600 shrink-0" />
            <span>AI Test: {application.assessmentScore}%</span>
            {application.assessmentResult?.hardSkillScore != null && (
              <span className="text-[10px] text-emerald-600 font-normal ml-auto">
                Hard: {application.assessmentResult.hardSkillScore}% · Soft: {application.assessmentResult.softSkillScore}%
              </span>
            )}
          </div>
        )}

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
            {evidence ? t('pipeline.evidenceReviewed', 'Evidence reviewed') : t('pipeline.needsReview', 'Needs review')}
          </span>
          <span>{nextActionFor(application, t)}</span>
        </div>

        <div className="flex items-center gap-1.5 mt-2">
          <Link className="pipeline-card-open flex-1" to={`/applications/${application.id}`}>
            {t('pipeline.openDetails', 'Open details')} <ArrowRight size={15} />
          </Link>
          <button
            type="button"
            className="p-1.5 rounded-lg text-slate-400 hover:text-[#1a5d4c] dark:hover:text-[#58c0a0] hover:bg-[#1a5d4c]/10 transition-colors border border-transparent hover:border-[#1a5d4c]/20"
            title={t('pipeline.dossierTooltip', 'Nomzod A4 dosyesini ko‘rish va chop etish')}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDossierApp(application);
            }}
          >
            <Printer size={15} />
          </button>
        </div>
      </article>
    );
  }

  return (
    <div className="pipeline-page pipeline-redesign">
      <PageTitle
        eyebrow={t('pipeline.eyebrow', 'HIRING')}
        title={t('pipeline.title', 'Hiring pipeline')}
        text={t('pipeline.subtitle', 'Every application in one board. Stage changes are made by a person and recorded.')}
      >
        <button className="primary" onClick={() => setOpen(true)}>
          <Plus size={17} /> {t('pipeline.addCandidate', 'Add candidate')}
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
        <Select value={selectedVacancy} onValueChange={(value) => updateParams({ vacancyId: value === 'all' ? null : value, page: null })}>
          <SelectTrigger
            value={selectedVacancy}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white text-sm text-slate-900 shadow-none hover:border-slate-300 focus:border-[#1a5d4c] focus:ring-2 focus:ring-[#1a5d4c]/15"
            aria-label={t('pipeline.filterVacancy', 'Filter by vacancy')}
          >
            <SelectValue placeholder={t('pipeline.allVacancies', 'All vacancies')} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <div className="p-2">
              <input aria-label={t('pipeline.searchVacancy')} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus-visible:outline-[#1a5d4c]" placeholder={t('pipeline.searchVacancy')} value={vacancySearch} onChange={(event) => setVacancySearch(event.target.value)} onKeyDown={(event) => event.stopPropagation()} />
            </div>
            <SelectItem value="all">{t('pipeline.allVacancies', 'All vacancies')}</SelectItem>
            {vacanciesList.map((vacancy) => (
              <SelectItem key={vacancy.id} value={String(vacancy.id)}>
                {vacancy.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex items-center w-full">
          <Search size={16} className="absolute left-3 text-slate-400 pointer-events-none" aria-hidden="true" />
          <Input
            id="pipeline-search-input"
            aria-label={t('pipeline.searchCandidates', 'Search the pipeline')}
            placeholder={t('pipeline.searchPlaceholder', 'Search candidates…')}
            value={search}
            onChange={(event) => {
              updateParams({ search: event.target.value, page: null });
            }}
            className="h-10 w-full pl-9 pr-8 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 shadow-none hover:border-slate-300 focus-visible:border-[#1a5d4c] focus-visible:ring-2 focus-visible:ring-[#1a5d4c]/15"
          />
          {search && (
            <button
              type="button"
              className="absolute right-2.5 flex items-center justify-center w-5 h-5 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors"
              aria-label="Clear search"
              onClick={() => {
                updateParams({ search: null, page: null });
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        <Select value={selectedStage} onValueChange={(val) => updateParams({ stage: val === 'all' ? null : val, page: null })}>
          <SelectTrigger
            value={selectedStage}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white text-sm text-slate-900 shadow-none hover:border-slate-300 focus:border-[#1a5d4c] focus:ring-2 focus:ring-[#1a5d4c]/15"
            aria-label={t('pipeline.filterStage', 'Filter by stage')}
          >
            <SelectValue placeholder={t('pipeline.allStages', 'All stages')} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">{t('pipeline.allStages', 'All stages')}</SelectItem>
            {stages.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {getStageLabel(stage, t)}
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
            <LayoutGrid size={15} /> {t('pipeline.viewBoard', 'Board')}
          </button>
          <button
            type="button"
            className={viewMode === 'list' ? 'active' : ''}
            aria-pressed={viewMode === 'list'}
            onClick={() => setViewMode('list')}
          >
            <ListIcon size={15} /> {t('pipeline.viewList', 'List')}
          </button>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (selectedVacancy === 'all') {
              if (vacanciesList.length === 1) {
                setTopCandidatesVacancyId(vacanciesList[0].id);
              } else if (vacanciesList.length > 1) {
                setTopCandidatesVacancyId(vacanciesList[0].id);
                updateParams({ vacancyId: String(vacanciesList[0].id), page: null });
              } else {
                toast.info(t('pipeline.selectVacancyFirst', "Tahlil qilish uchun avval biror vakansiyani tanlang"));
              }
            } else {
              setTopCandidatesVacancyId(Number(selectedVacancy));
            }
          }}
          className="pipeline-top-candidates-button h-10 px-3.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-sm font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 flex items-center gap-1.5 shadow-none shrink-0"
          title="Vakansiya bo'yicha eng yaxshi 3 ta nomzodni AI tahlili orqali ko'rish"
        >
          <Sparkles size={15} className="text-emerald-600 dark:text-emerald-400" /> {t('pipeline.topCandidatesBtn', 'Top 3 Nomzodlar (AI)')}
        </Button>
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
                  <strong>{t('pipeline.candidateJourney', 'Candidate journey')}</strong>
                  <span>{t('pipeline.dragHint', 'Drag a card or use its menu. Every move asks for confirmation.')}</span>
                </div>
                <span className="pipeline-board-hint">
                  {t('pipeline.scrollHint', 'Scroll horizontally to see every stage →')}
                </span>
              </div>

              <div className="pipeline-mobile-stage">
                <span>{t('pipeline.tableStage', 'Stage')}</span>
                <Select
                  value={mobileStage}
                  onValueChange={(val) => setMobileStage(val as Stage)}
                >
                  <SelectTrigger
                    value={mobileStage}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white text-sm text-slate-900 shadow-none hover:border-slate-300 focus:border-[#1a5d4c] focus:ring-2 focus:ring-[#1a5d4c]/15"
                    aria-label="Select stage view"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {stages.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {getStageLabel(stage, t)} ·{' '}
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
                            <strong>{getStageLabel(stage, t)}</strong>
                            <small>{getStageDescription(stage, t)}</small>
                          </div>
                        </div>
                        <span className="stage-count" title={t('pipeline.allMatchingApps')}>{stageCounts[stage] ?? 0}</span>
                      </header>
                      <div className="kanban-card-list">
                        {applications.map(renderCard)}
                        {!applications.length && (
                          <div className="empty-lane">
                            <span aria-hidden="true">
                              <Users size={16} />
                            </span>
                            <strong>{t('pipeline.noCandidatesHere', 'No candidates here')}</strong>
                            <p>{t('pipeline.noCandidatesDesc', 'Move a candidate here when they reach this stage.')}</p>
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
                <span>{t('pipeline.tableCandidate', 'Candidate')}</span>
                <span>{t('pipeline.tableVacancy', 'Vacancy')}</span>
                <span>{t('pipeline.tableStage', 'Stage')}</span>
                <span>{t('pipeline.tableOwner', 'Owner')}</span>
                <span>{t('pipeline.tableTime', 'Time')}</span>
                <span>{t('pipeline.nextAction', 'Next action')}</span>
                <span />
              </div>
              {filteredItems.map((application) => (
                <article className="pipeline-list-row" key={application.id}>
                  <div className="pipeline-list-candidate">
                    <span className="avatar">{initials(application.candidate.fullName)}</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Link to={`/applications/${application.id}`}>
                          {application.candidate.fullName}
                        </Link>
                        {application.assessmentScore != null && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            <Sparkles size={10} /> {application.assessmentScore}%
                          </span>
                        )}
                      </div>
                      <small>
                        {application.candidate.email || sourceLabel(application.candidate)}
                      </small>
                    </div>
                  </div>
                  <span data-label="Vacancy">{application.vacancy.title}</span>
                  <span data-label="Stage">
                    <Badge value={application.status} />
                  </span>
                  <span data-label="Owner">{applicationOwner(application, t('pipeline.unassigned', 'Unassigned'))}</span>
                  <span data-label="Time">{t('pipeline.inStageDays', { days: daysInCurrentStage(application), defaultValue: `${daysInCurrentStage(application)}d` })}</span>
                  <span data-label="Next action">{nextActionFor(application, t)}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-[#1a5d4c] dark:hover:text-[#58c0a0] hover:bg-[#1a5d4c]/10 transition-colors"
                      title={t('pipeline.dossierTooltip', 'Nomzod A4 dosyesini ko‘rish va chop etish')}
                      onClick={() => setDossierApp(application)}
                    >
                      <Printer size={15} />
                    </button>
                    <Link
                      className="pipeline-list-open"
                      to={`/applications/${application.id}`}
                      aria-label={`Open ${application.candidate.fullName}`}
                    >
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                </article>
              ))}
            </section>
          )}
          <Pagination page={page} total={data?.total ?? 0} setPage={(nextPage) => updateParams({ page: nextPage === 1 ? null : String(nextPage) })} />
        </>
      ) : (
        <section className="panel">
          <Empty
            title={t('pipeline.noMatchingApps', 'No matching applications')}
            text={t('pipeline.noMatchingAppsDesc', 'Change the filters or add a candidate to a vacancy.')}
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

      <CandidateDossierModal
        open={Boolean(dossierApp)}
        onClose={() => setDossierApp(null)}
        application={dossierApp}
      />

      <TopCandidatesModal
        vacancyId={topCandidatesVacancyId}
        open={Boolean(topCandidatesVacancyId)}
        onClose={() => setTopCandidatesVacancyId(null)}
        onApplicationStageChanged={() => reload()}
        onOpenDossier={(app) => setDossierApp(app)}
      />

      <AlertDialog
        open={Boolean(pendingMove)}
        onOpenChange={(isOpen) => !isOpen && !moving && setPendingMove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('pipeline.confirmMoveTitle', { stage: pendingMove ? getStageLabel(pendingMove.stage, t) : '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('pipeline.confirmMoveDesc', {
                name: pendingMove?.app.candidate.fullName,
                from: pendingMove ? getStageLabel(pendingMove.app.status, t) : '',
                to: pendingMove ? getStageLabel(pendingMove.stage, t) : '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={moving}>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={moving}
              onClick={(event) => {
                event.preventDefault();
                if (pendingMove) void moveApplication(pendingMove.app, pendingMove.stage);
              }}
            >
              {moving ? t('pipeline.moving', 'Moving…') : t('pipeline.confirmMoveButton', 'Confirm move')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function ApplicationDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { user } = useAuth();
  const { data: a, error, reload } = useData<Application>(`/applications/${id}`);
  const [busy, setBusy] = useState('');
  const [actionError, setError] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [dossierOpen, setDossierOpen] = useState(false);
  const aiBlocked = Boolean(a?.candidate.publicSubmittedAt && !a?.candidate.aiConsentAt);

  async function analyzeCv() {
    setBusy('analyze');
    setError('');
    try {
      await send(`/applications/${id}/analyze`, { consent: true });
      toast.success('CV evidence matched');
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
        toast.success(t('applications.autoInvitationSent', 'Moved application to Interview · Auto-invitation sent'));
      } else if (status === 'REJECTED') {
        toast.success(t('applications.rejectionMessageSent', 'Moved application to Rejected · Rejection message sent'));
      } else {
        toast.success(t('applications.movedSuccess', { stage: getStageLabel(status, t), defaultValue: `Moved application to ${getStageLabel(status, t)}` }));
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
      toast.success(t('applications.appDeletedSuccess', 'Application deleted'));
      window.location.assign('/pipeline');
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
    }
  }
  return (
    <>
      <Link to="/pipeline" className="back-link">
        <ArrowLeft size={16} /> {t('applications.backToPipeline', 'Back to pipeline')}
      </Link>
      <Alert message={error || actionError} />
      {!a && !error ? (
        <Loading />
      ) : (
        a && (
          <>
            <PageTitle
              eyebrow={t('pipeline.eyebrow', 'APPLICATION REVIEW')}
              title={a.candidate.fullName}
              text={a.vacancy.title}
            >
              <div className="row wrap stage-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDossierOpen(true)}
                  className="flex items-center gap-1.5 border-slate-300 text-slate-800 hover:bg-slate-50 font-medium"
                >
                  <Printer size={16} /> {t('candidateDossier.title', 'Dossier (A4 PDF)')}
                </Button>
                {nextStage[a.status] && (
                  <button
                    className="primary"
                    disabled={Boolean(busy)}
                    onClick={() => void changeStatus(nextStage[a.status]!)}
                  >
                    {busy === 'status' ? t('pipeline.moving', 'Moving…') : `${t('pipeline.moveToStage', 'Move to')} ` + getStageLabel(nextStage[a.status]!, t)}{' '}
                    <ArrowRight size={16} />
                  </button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="vacancies-filter-trigger stage-filter-trigger"
                      aria-label="Pipeline stage"
                      disabled={Boolean(busy)}
                    >
                      <span>{getStageLabel(a.status, t)}</span>
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
                          <span>{getStageLabel(s, t)}</span>
                          {isSelected && <Check size={15} className="filter-check-icon" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  className="icon-button danger"
                  aria-label="Delete application"
                  disabled={Boolean(busy)}
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </PageTitle>
            <div className="stage-progress" aria-label="Application progress">
              <span>{t('applications.currentStage', 'Current stage')}</span>
              <Badge value={a.status} />
              {nextStage[a.status] ? (
                <>
                  <ArrowRight size={16} />
                  <span>{t('applications.nextStage', { stage: getStageLabel(nextStage[a.status]!, t), defaultValue: `Next: ${getStageLabel(nextStage[a.status]!, t)}` })}</span>
                </>
              ) : (
                <span>{t('applications.finalStage', 'Final stage')}</span>
              )}
            </div>
            <div className="review-notice">
              <ShieldCheck size={22} />
              <div>
                <strong>{t('applications.factEvidenceTitle', 'Faktik dalillar — Insoniy qaror')}</strong>
                <span>
                  {t('applications.factEvidenceDesc', 'Ushbu tahlil nomzod rezyumesidan olingan faktik dalillarni ko‘rsatadi. Bu ishga qabul qilish bo‘yicha AI tavsiyasi emas — yakuniy qarorni faqat interviewer qabul qiladi.')}
                </span>
              </div>
              <Link to={`/candidates/${a.candidateId}`}>
                {t('applications.viewCv', 'CV ko‘rish')} <ArrowRight size={16} />
              </Link>
            </div>

            {a.candidate.source === 'TELEGRAM' && a.assessmentScore == null && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 mb-4">Test ishlamagan. Arizani qo‘lda ko‘rib chiqing.</p>
            )}
            {a.assessmentScore != null && (
              <section className="panel padded mb-4 bg-emerald-50/20 border-emerald-200">
                <div className="flex items-center justify-between mb-3 border-b border-emerald-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Sparkles size={18} className="text-emerald-600" />
                    <div>
                      <h2 className="text-base font-bold text-slate-900 leading-tight">
                        {t('applications.assessmentTitle', 'AI Saralash Testi Natijalari (Telegram Assessment)')}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {t('applications.assessmentSubtitle', 'Nomzod bot orqali topshirgan saralash testi.')}
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Ball: {a.assessmentScore}% · {a.assessmentResult?.passed !== false ? 'O‘tgan (>=70%)' : 'O‘tmagan'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-xs">
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Umumiy natija</span>
                    <strong className="text-emerald-800 text-base font-bold">
                      {a.assessmentScore}% ({a.assessmentResult?.correctCount ?? Math.round((a.assessmentScore / 10))}/10 to‘g‘ri)
                    </strong>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">💡 Hard Skills</span>
                    <strong className="text-slate-800 text-base font-bold">
                      {a.assessmentResult?.hardSkillScore ?? '-'}%
                    </strong>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">🤝 Soft Skills</span>
                    <strong className="text-slate-800 text-base font-bold">
                      {a.assessmentResult?.softSkillScore ?? '-'}%
                    </strong>
                  </div>
                </div>
                {a.assessmentResult?.answers?.length ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-xs bg-white">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-700 text-left border-b border-slate-200">
                          <th className="p-2.5 font-semibold w-12 text-center">#</th>
                          <th className="p-2.5 font-semibold w-32">Yo‘nalish</th>
                          <th className="p-2.5 font-semibold w-28">Natija</th>
                          <th className="p-2.5 font-semibold">Tanlangan javob</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {a.assessmentResult.answers.map((ans, idx) => (
                          <tr key={idx} className={ans.isCorrect ? 'hover:bg-emerald-50/20' : 'hover:bg-rose-50/20'}>
                            <td className="p-2.5 text-center font-mono font-medium text-slate-500">{idx + 1}</td>
                            <td className="p-2.5 font-medium">
                              {ans.type === 'HARD_SKILL' ? '💡 Hard Skill' : '🤝 Soft Skill'}
                            </td>
                            <td className="p-2.5">
                              {ans.isCorrect ? (
                                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  ✓ To‘g‘ri
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                                  ✗ Noto‘g‘ri
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 text-slate-700">
                              Variant {String.fromCharCode(65 + ans.selectedIndex)}
                              {!ans.isCorrect && (
                                <span className="text-slate-400 ml-1.5">(To‘g‘ri variant: {String.fromCharCode(65 + ans.correctIndex)})</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            )}

            <section className="panel evidence-panel">
              <div className="panel-heading">
                <div>
                  <h2>{t('applications.evidenceBreakdownTitle', 'AI topgan dalillar (CV Evidence Breakdown)')}</h2>
                  <p>
                    {t('applications.evidenceBreakdownSubtitle', 'CV matnidan olingan faktik dalillar. AI nomzodlarni baholamaydi — qarorni faqat inson qabul qiladi.')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="primary"
                    disabled={
                      aiBlocked ||
                      !user?.aiConfigured ||
                      !a.candidate.resumeText ||
                      Boolean(busy)
                    }
                    onClick={() => void analyzeCv()}
                  >
                    <Sparkles size={15} />
                    {busy === 'analyze'
                      ? t('common.loading', 'Tahlil qilinmoqda…')
                      : a.analysis
                        ? t('applications.reanalyze', 'Qayta tahlil qilish')
                        : t('applications.analyzeCv', 'CV dalillarini tahlil qilish')}
                  </button>
                  <span className="count-chip">{a.vacancy.requirements.length} {t('vacancies.cardRequirements', 'talab')}</span>
                </div>
              </div>
              {(aiBlocked || !a.candidate.resumeText) && (
                <div className="px-4 py-2 bg-slate-50 border-b flex items-center justify-between">
                  {aiBlocked && <span className="text-xs text-amber-700">{t('applications.noConsentWarning', 'Nomzod AI tahliliga rozilik bermagan.')}</span>}
                  {!a.candidate.resumeText && (
                    <span className="text-xs text-amber-600">{t('applications.noCvWarning', 'Avval nomzod profiliga CV yuklang.')}</span>
                  )}
                </div>
              )}
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
                              {r.required ? t('vacancyGenerator.required', 'Majburiy') : t('vacancyGenerator.niceToHave', 'Afzallik')}
                            </span>
                          </h3>
                          {r.description && <p className="muted">{r.description}</p>}
                        </div>
                        {evidence ? (
                          <Badge value={evidence.status} />
                        ) : (
                          <span className="muted small">{t('applications.notAnalyzed', 'Tahlil qilinmagan')}</span>
                        )}
                      </div>
                      {evidence && (
                        <>
                          <p>{evidence.explanation}</p>
                          {evidence.quotes.map((q, i) => (
                            <blockquote key={i}>
                              {q}
                              <small>{t('applications.cvExactQuote', 'CV matnidan aniq parcha')}</small>
                            </blockquote>
                          ))}
                        </>
                      )}
                    </article>
                  );
                })
              ) : (
                <Empty
                  title={t('applications.noRequirements', 'Vakansiyada talablar kiritilmagan')}
                  text={t('applications.noRequirementsDesc', 'Ushbu vakansiyani tahrirlab, talablarni qo‘shing.')}
                />
              )}
              <div className="evidence-legend">
                <span>
                  <b>Supported</b> {t('applications.legendSupported', 'Aniq tasdiqlangan dalil')}
                </span>
                <span>
                  <b>Partial</b> {t('applications.legendPartial', 'Qisman dalil mavjud')}
                </span>
                <span>
                  <b>Not found</b> {t('applications.legendNotFound', 'CV ichida dalil topilmadi (nomzod bilmaydi degani emas — suhbatda aniqlashtirish zarur)')}
                </span>
                <span>
                  <b>Unknown</b> {t('applications.legendUnknown', 'Aniq xulosa yo‘q, suhbatda aniqlash zarur')}
                </span>
              </div>
            </section>
            <InterviewPanel applicationId={a.id} status={a.status} onChanged={reload} />
            <section className="panel padded stage-history">
              <h2>{t('applications.stageHistoryTitle', 'Stage history')}</h2>
              <p className="muted">{t('applications.stageHistoryDesc', 'Who moved this application, and when.')}</p>
              {a.stageHistory?.length ? (
                <ol>
                  {a.stageHistory.map((entry) => (
                    <li key={entry.id}>
                      <div className="row wrap">
                        <strong>
                          {entry.fromStatus
                            ? getStageLabel(entry.fromStatus, t) + ' → ' + getStageLabel(entry.toStatus, t)
                            : t('applications.appCreated', 'Application created') + ' · ' + getStageLabel(entry.toStatus, t)}
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
                  {t('applications.noRecordedChanges', 'No recorded changes yet. Earlier stage changes were not tracked.')}
                </p>
              )}
            </section>
            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('applications.deleteTitle', 'Delete application?')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('applications.deleteDesc', 'This will delete this application and its analysis. The candidate and vacancy will be kept.')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => void confirmDelete()}
                  >
                    {busy === 'delete' ? t('applications.deleting', 'Deleting…') : t('applications.deleteButton', 'Delete application')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <CandidateDossierModal
              open={dossierOpen}
              onClose={() => setDossierOpen(false)}
              application={a}
            />
          </>
        )
      )}
    </>
  );
}
