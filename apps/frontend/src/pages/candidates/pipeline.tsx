import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  ShieldCheck,
  Trash2,
  ChevronDown,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, send } from '../../lib/api';
import { useAuth } from '../../features/auth';
import { InterviewReviewEditor } from '../../features/interview-generator';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  label,
  Loading,
  Modal,
  PageTitle,
  Pagination,
  ScrollArea,
  Select,
  SelectContent,
  SelectGroup,
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
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState('');
  const { data, error } = useData<Page<Candidate | Vacancy>>(
    `/${kind}?search=${encodeURIComponent(search)}&page=${page}`,
  );
  return (
    <div className="record-select">
      <label>
        Find a {kind === 'candidates' ? 'candidate' : 'vacancy'}
        <input
          value={search}
          placeholder="Type to search…"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </label>
      <Alert message={error} />
      <Select
        value={selected}
        onValueChange={(value) => {
          setSelected(value);
          onSelect(Number(value));
        }}
      >
        <SelectTrigger aria-label={kind} className="w-full">
          <SelectValue placeholder={`Select ${kind === 'candidates' ? 'candidate' : 'vacancy'}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {data?.items.map((x) => (
              <SelectItem key={x.id} value={String(x.id)}>
                {'fullName' in x ? x.fullName : x.title}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {data && data.total > 20 && <Pagination page={page} total={data.total} setPage={setPage} />}
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
    <Modal title="Create an application" close={close}>
      <form onSubmit={submit}>
        <Alert message={error} />
        <p className="muted">Connect a candidate to a vacancy to begin reviewing their evidence.</p>
        <RecordSelect kind="candidates" onSelect={setCandidate} />
        <RecordSelect kind="vacancies" onSelect={setVacancy} />
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={busy || !candidateId || !vacancyId}>
            {busy ? 'Creating…' : 'Create application'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export function Pipeline() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const { data, error, reload } = useData<Page<Application>>(
    `/applications?page=${page}&search=${encodeURIComponent(search)}`,
  );

  async function handleMoveStage(app: Application, newStage: Stage) {
    try {
      await send(
        `/applications/${app.id}/status`,
        { status: newStage, expectedStatus: app.status },
        'PUT',
      );
      toast.success(`Moved ${app.candidate.fullName} to ${label(newStage)}`);
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="pipeline-page">
      <PageTitle
        eyebrow="HIRING WORKFLOW"
        title="Hiring pipeline"
        text="Track every candidate and move applications through your hiring process."
      >
        <button className="primary" onClick={() => setOpen(true)}>
          <Plus size={17} /> New application
        </button>
      </PageTitle>
      <div className="pipeline-toolbar">
        <div className="pipeline-search search-field">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Search applications"
            placeholder="Search candidates in the pipeline…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="pipeline-total" aria-live="polite">
          <strong>{data?.total ?? '—'}</strong>
          <span>applications</span>
        </div>
      </div>
      <Alert message={error} />
      {!data && !error ? (
        <Loading />
      ) : (
        data && (
          <>
            {data.items.length ? (
              <div className="pipeline-board-shell">
                <div className="pipeline-board-heading">
                  <div>
                    <strong>Candidate journey</strong>
                    <span>Use the card menu to update a candidate's stage.</span>
                  </div>
                  <span className="pipeline-board-hint">
                    Scroll horizontally to see every stage
                  </span>
                </div>
                <div className="kanban" aria-label="Hiring pipeline board">
                  {stages.map((stage) => {
                    const applications = data.items.filter(
                      (application) => application.status === stage,
                    );
                    return (
                      <section className={`kanban-column stage-${stage.toLowerCase()}`} key={stage}>
                        <header>
                          <div className="pipeline-stage-title">
                            <Badge value={stage} />
                          </div>
                          <span className="stage-count">{applications.length}</span>
                        </header>
                        <div className="kanban-card-list">
                          {applications.map((a) => (
                            <article className="application-card" key={a.id}>
                              <div className="application-card-head">
                                <span className="avatar">
                                  {a.candidate.fullName.slice(0, 2).toUpperCase()}
                                </span>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      className="application-menu"
                                      aria-label={`Actions for ${a.candidate.fullName}`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <MoreHorizontal size={16} />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {stages.map((s) => (
                                      <DropdownMenuItem
                                        key={s}
                                        disabled={s === a.status}
                                        onClick={() => void handleMoveStage(a, s)}
                                      >
                                        {label(s)}
                                      </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem asChild>
                                      <Link to={`/applications/${a.id}`}>View application</Link>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                              <Link className="application-card-body" to={`/applications/${a.id}`}>
                                <h3 title={a.candidate.fullName}>{a.candidate.fullName}</h3>
                                <p title={a.vacancy.title}>{a.vacancy.title}</p>
                                <div className="application-review-state">
                                  <span className={a.analysis ? 'has-evidence' : ''} />
                                  {a.analysis ? 'Evidence available' : 'Ready for review'}
                                </div>
                                <footer>
                                  <span>Open application</span>
                                  <ArrowRight size={15} />
                                </footer>
                              </Link>
                            </article>
                          ))}
                          {!applications.length && (
                            <div className="empty-lane">
                              <span aria-hidden="true" />
                              <strong>No candidates yet</strong>
                              <p>Applications moved here will appear in this column.</p>
                            </div>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            ) : (
              <section className="panel">
                <Empty
                  title="Start a conversation"
                  text="Connect a candidate to a vacancy. Their application will begin in New."
                />
              </section>
            )}
            <Pagination page={page} total={data.total} setPage={setPage} />
            <p className="muted small">
              The board shows applications on the current page. Open an application to update its
              stage.
            </p>
          </>
        )
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
      toast.success(`Moved application to ${label(status)}`);
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
                <strong>Evidence informs. People decide.</strong>
                <span>
                  These labels describe what the CV supports. They are not a candidate score or a
                  hiring recommendation.
                </span>
              </div>
              <Link to={`/candidates/${a.candidateId}`}>
                View CV <ArrowRight size={16} />
              </Link>
            </div>
            <section className="panel padded">
              <AiConsent checked={consent} onChange={setConsent} configured={user.aiConfigured} />
              <div className="row wrap">
                <button
                  className="primary"
                  disabled={
                    !consent ||
                    !user.aiConfigured ||
                    !a.candidate.resumeText ||
                    Boolean(busy) ||
                    reviewDirty
                  }
                  onClick={() => void action('analyze')}
                >
                  <Sparkles size={16} />
                  {busy === 'analyze' ? 'Checking evidence…' : 'Match CV evidence'}
                </button>
                <button
                  className="secondary"
                  disabled={
                    !consent ||
                    !user.aiConfigured ||
                    !a.candidate.resumeText ||
                    Boolean(busy) ||
                    reviewDirty
                  }
                  onClick={() => void action('questions')}
                >
                  <Sparkles size={16} />
                  {busy === 'questions' ? 'Preparing questions…' : 'Generate interview questions'}
                </button>
                {!a.candidate.resumeText && (
                  <span className="muted">Upload a CV on the candidate profile first.</span>
                )}
              </div>
            </section>
            <section className="panel evidence-panel">
              <div className="panel-heading">
                <div>
                  <h2>Requirement evidence</h2>
                  <p>Exact CV excerpts alongside the requirements for this role.</p>
                </div>
                <span className="count-chip">{a.vacancy.requirements.length} requirements</span>
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
                              {r.required ? 'Required' : 'Nice to have'}
                            </span>
                          </h3>
                          {r.description && <p className="muted">{r.description}</p>}
                        </div>
                        {evidence ? (
                          <Badge value={evidence.status} />
                        ) : (
                          <span className="muted small">Not analyzed</span>
                        )}
                      </div>
                      {evidence && (
                        <>
                          <p>{evidence.explanation}</p>
                          {evidence.quotes.map((q, i) => (
                            <blockquote key={i}>
                              {q}
                              <small>Exact CV excerpt</small>
                            </blockquote>
                          ))}
                        </>
                      )}
                    </article>
                  );
                })
              ) : (
                <Empty
                  title="No requirements yet"
                  text="Edit this vacancy to add job-related requirements."
                />
              )}
              <div className="evidence-legend">
                <span>
                  <b>Supported</b> Explicit evidence
                </span>
                <span>
                  <b>Partial</b> Some evidence
                </span>
                <span>
                  <b>Not found</b> No statement in CV
                </span>
                <span>
                  <b>Unknown</b> Needs clarification
                </span>
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Interview guide</h2>
                  <p>Use these questions to explore experience and clarify gaps.</p>
                </div>
                <Sparkles size={19} />
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
