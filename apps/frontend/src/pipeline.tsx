import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Plus, Search, Sparkles, ShieldCheck, Trash2 } from 'lucide-react';
import { api, send } from './api';
import { useAuth } from './auth';
import {
  AiConsent,
  Alert,
  Badge,
  Empty,
  label,
  Loading,
  Modal,
  PageTitle,
  Pagination,
  useData,
} from './ui';
import { stages, nextStage } from './types';
import { InterviewReviewEditor } from './interview-review';
import type { Application, Candidate, Page, Stage, Vacancy } from './types';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  return (
    <>
      <PageTitle
        eyebrow="FROM FIRST LOOK TO NEXT CHAPTER"
        title="Hiring pipeline"
        text="Move every conversation forward, one thoughtful step at a time."
      >
        <button className="primary" onClick={() => setOpen(true)}>
          <Plus size={17} /> New application
        </button>
      </PageTitle>
      <div className="toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search applications"
            placeholder="Search candidate names…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <span>{data?.total ?? '—'} applications</span>
      </div>
      <Alert message={error} />
      {!data && !error ? (
        <Loading />
      ) : (
        data && (
          <>
            {data.items.length ? (
              <div className="kanban">
                {stages.map((stage) => (
                  <section className="kanban-column" key={stage}>
                    <header>
                      <Badge value={stage} />
                      <span>{data.items.filter((a) => a.status === stage).length}</span>
                    </header>
                    {data.items
                      .filter((a) => a.status === stage)
                      .map((a) => (
                        <Link className="application-card" to={`/applications/${a.id}`} key={a.id}>
                          <span className="avatar">
                            {a.candidate.fullName.slice(0, 2).toUpperCase()}
                          </span>
                          <h3>{a.candidate.fullName}</h3>
                          <p>{a.vacancy.title}</p>
                          <footer>
                            {a.analysis ? 'Evidence available' : 'Ready for review'}
                            <ArrowRight size={15} />
                          </footer>
                        </Link>
                      ))}
                    {!data.items.some((a) => a.status === stage) && (
                      <div className="empty-lane">No applications on this page</div>
                    )}
                  </section>
                ))}
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
    </>
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
  async function action(kind: 'analyze' | 'questions') {
    setBusy(kind);
    setError('');
    try {
      await send(`/applications/${id}/${kind}`, { consent });
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function changeStatus(status: Stage) {
    if (!window.confirm(`Move this application to ${label(status)}? This is your team’s decision.`))
      return;
    setBusy('status');
    setError('');
    try {
      await send(`/applications/${id}/status`, { status, expectedStatus: a?.status }, 'PUT');
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function remove() {
    if (
      !window.confirm(
        'Delete this application and its analysis? The candidate and vacancy will be kept.',
      )
    )
      return;
    setBusy('delete');
    try {
      await api(`/applications/${id}`, { method: 'DELETE' });
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
                <Select
                  value={a.status}
                  disabled={Boolean(busy) || reviewDirty}
                  onValueChange={(value) => void changeStatus(value as Stage)}
                >
                  <SelectTrigger aria-label="Pipeline stage" className="stage-select">
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {stages.map((s) => (
                        <SelectItem key={s} value={s}>
                          {label(s)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <button
                  className="icon-button danger"
                  aria-label="Delete application"
                  disabled={Boolean(busy) || reviewDirty}
                  onClick={() => void remove()}
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
          </>
        )
      )}
    </>
  );
}
