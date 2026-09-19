import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  Plus,
  Search,
  Pencil,
  Trash2,
  Upload,
  Download,
  Sparkles,
  FileText,
} from 'lucide-react';
import { api, send } from '../../lib/api';
import { useAuth } from '../../features/auth';
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
  Avatar,
  AvatarFallback,
  Button,
  date,
  Empty,
  Input,
  Loading,
  Modal,
  PageTitle,
  Pagination,
  Progress,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useData,
} from '../../components/ui';
import { toast } from 'sonner';
import type { Candidate, Page } from '../../types';

function CandidateForm({
  value,
  close,
  saved,
}: {
  value: Candidate | null;
  close: () => void;
  saved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await send(
        `/candidates${value ? `/${value.id}` : ''}`,
        Object.fromEntries(new FormData(e.currentTarget)),
        value ? 'PUT' : 'POST',
      );
      toast.success(value ? 'Candidate updated successfully!' : 'Candidate added successfully!');
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={value ? 'Edit candidate' : 'Add a candidate'}
      subtitle="Enter candidate contact details. You can upload their CV right after."
      close={close}
      className="candidate-modal-custom"
    >
      <form onSubmit={submit} className="vacancy-modal-body">
        <Alert message={error} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="candidate-fullName">
              Full name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              id="candidate-fullName"
              required
              name="fullName"
              maxLength={160}
              defaultValue={value?.fullName || ''}
              placeholder="Candidate's full name"
              className="form-control-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="candidate-email">
              Email
            </label>
            <input
              id="candidate-email"
              type="email"
              name="email"
              maxLength={254}
              defaultValue={value?.email || ''}
              placeholder="candidate@example.com"
              className="form-control-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="candidate-phone">
              Phone
            </label>
            <input
              id="candidate-phone"
              name="phone"
              type="tel"
              maxLength={50}
              defaultValue={value?.phone || ''}
              placeholder="Optional (+998...)"
              className="form-control-input"
            />
          </div>
        </div>
        <p style={{ fontSize: '12.5px', color: '#64748b', marginTop: '16px', lineHeight: '1.5' }}>
          You can upload their CV and extract information from the candidate profile after saving.
        </p>
        <div className="modal-footer-actions">
          <button type="button" className="btn-modal-cancel" onClick={close}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-modal-submit"
            disabled={busy}
            aria-label={value ? 'Save candidate' : 'Add candidate'}
          >
            {busy ? 'Saving…' : value ? 'Save candidate' : 'Add candidate'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Candidates() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [deletingCandidate, setDeletingCandidate] = useState<Candidate | null>(null);
  const [open, setOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const { data, error, reload } = useData<Page<Candidate>>(
    `/candidates?page=${page}&search=${encodeURIComponent(search)}`,
  );
  const close = () => {
    setOpen(false);
    setEditing(null);
  };
  async function confirmDeleteCandidate(c: Candidate) {
    try {
      await api(`/candidates/${c.id}`, { method: 'DELETE' });
      toast.success(`Candidate "${c.fullName}" deleted`);
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setDeletingCandidate(null);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="PEOPLE, NOT PAPERWORK"
        title="Candidates"
        text="Your talent pool, with room for the whole story."
      >
        <Button
          onClick={() => setOpen(true)}
          className="bg-[#245e4f] hover:bg-[#1b4338] text-white flex items-center gap-1.5"
        >
          <Plus size={17} /> Add candidate
        </Button>
      </PageTitle>
      <div className="vacancies-toolbar candidates-toolbar">
        <div className="vacancies-search-box">
          <Search className="vacancies-search-icon" size={17} />
          <input
            type="text"
            aria-label="Search candidates"
            placeholder="Search by name or email…"
            value={search}
            className="vacancies-search-input"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="candidates-count-pill">
          <span>{data?.total ?? '—'} people</span>
        </div>
      </div>
      <Alert message={error || actionError} />
      {!data && !error ? (
        <Loading />
      ) : (
        data && (
          <>
            <section className="panel">
              {data.items.length ? (
                <div className="table-wrap">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Candidate</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>CV</TableHead>
                        <TableHead>Applications</TableHead>
                        <TableHead>Added</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.items.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell>
                            <Link
                              className="person inline-flex items-center gap-3 font-medium"
                              to={`/candidates/${c.id}`}
                            >
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-[#1b4338] text-white font-semibold text-xs">
                                  {c.fullName.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <strong>{c.fullName}</strong>
                                <small>{c.email || 'No email added'}</small>
                              </div>
                            </Link>
                          </TableCell>
                          <TableCell>
                            <span className="badge neutral">
                              {c.source === 'TELEGRAM' ? 'Telegram' : 'Website'}
                            </span>
                            {c.telegramUsername && (
                              <small className="block muted">@{c.telegramUsername}</small>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className={`file-state ${c.resumeName ? 'has-file' : ''}`}>
                              <FileText size={15} />
                              {c.resumeName ? 'Uploaded' : 'Not uploaded'}
                            </span>
                          </TableCell>
                          <TableCell>{c._count?.applications || 0}</TableCell>
                          <TableCell>{date(c.createdAt)}</TableCell>
                          <TableCell>
                            <div className="row">
                              <Link
                                className="icon-button"
                                aria-label={`View ${c.fullName}`}
                                to={`/candidates/${c.id}`}
                              >
                                <ArrowUpRight size={16} />
                              </Link>
                              <button
                                className="icon-button"
                                aria-label={`Edit ${c.fullName}`}
                                onClick={() => {
                                  setEditing(c);
                                  setOpen(true);
                                }}
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                className="icon-button danger"
                                aria-label={`Delete ${c.fullName}`}
                                onClick={() => setDeletingCandidate(c)}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <Empty
                  title={search ? 'No candidates found' : 'Meet your future team'}
                  text={
                    search
                      ? 'Try a different name or email.'
                      : 'Add your first candidate to start reviewing their experience.'
                  }
                />
              )}
            </section>
            <Pagination page={page} total={data.total} setPage={setPage} />
          </>
        )
      )}
      {open && (
        <CandidateForm
          value={editing}
          close={close}
          saved={() => {
            close();
            reload();
          }}
        />
      )}
      <AlertDialog
        open={Boolean(deletingCandidate)}
        onOpenChange={(open) => !open && setDeletingCandidate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete candidate?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingCandidate?.fullName}</strong>, their
              CV, and all applications? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#dc2626] text-white hover:bg-[#b91c1c]"
              onClick={() => deletingCandidate && void confirmDeleteCandidate(deletingCandidate)}
            >
              Delete candidate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function CandidateDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: c, error, reload } = useData<Candidate>(`/candidates/${id}`);
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const [consent, setConsent] = useState(false);
  const [editing, setEditing] = useState(false);
  async function upload(file: File | undefined) {
    if (!file) return;
    setActionError('');
    if (file.size > 5 * 1024 * 1024) {
      setActionError('Maximum CV file size is 5 MB.');
      return;
    }
    setBusy('upload');
    try {
      const f = new FormData();
      f.append('file', file);
      await api(`/candidates/${id}/resume`, { method: 'POST', body: f });
      setConsent(false);
      toast.success('CV uploaded and text extracted!');
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function parseResume() {
    setBusy('parse');
    setActionError('');
    try {
      await send(`/candidates/${id}/parse`, { consent });
      toast.success('Resume parsed with AI successfully!');
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <Link to="/candidates" className="back-link">
        <ArrowLeft size={16} /> All candidates
      </Link>
      <Alert message={error || actionError} />
      {!c && !error ? (
        <Loading />
      ) : (
        c && (
          <>
            <PageTitle
              eyebrow="CANDIDATE PROFILE"
              title={c.fullName}
              text={
                [
                  c.email,
                  c.phone,
                  c.source === 'TELEGRAM' ? 'Telegram' : null,
                  c.telegramUsername ? `@${c.telegramUsername}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Contact information not added'
              }
            >
              <Button
                variant="outline"
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5"
              >
                <Pencil size={16} /> Edit profile
              </Button>
            </PageTitle>
            <div className="detail-grid">
              <section className="panel padded">
                <div className="panel-heading flush">
                  <div>
                    <h2>Curriculum vitae</h2>
                    <p>The source behind every piece of evidence.</p>
                  </div>
                  <FileText size={20} />
                </div>
                <label className={`upload-zone ${busy ? 'disabled' : ''}`}>
                  <Upload size={27} />
                  <strong>
                    {busy === 'upload'
                      ? 'Extracting CV text…'
                      : c.resumeName
                        ? 'Replace CV'
                        : 'Upload a CV'}
                  </strong>
                  <span>PDF or DOCX · up to 5 MB · text-based documents</span>
                  <input
                    aria-label="Upload CV"
                    type="file"
                    accept=".pdf,.docx"
                    disabled={Boolean(busy)}
                    onChange={(e) => {
                      void upload(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
                {busy === 'upload' && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Extracting document text…</span>
                      <span>60%</span>
                    </div>
                    <Progress value={60} className="h-1.5 w-full" />
                  </div>
                )}
                {c.resumeName && (
                  <div className="file-row">
                    <FileText size={18} />
                    <span>{c.resumeName}</span>
                    <a
                      aria-label="Download CV"
                      href={`/api/candidates/${c.id}/resume`}
                      className="icon-button"
                    >
                      <Download size={18} />
                    </a>
                  </div>
                )}
                {c.resumeText && (
                  <details className="text-preview">
                    <summary>View extracted CV text</summary>
                    <pre>{c.resumeText}</pre>
                  </details>
                )}
                <p className="muted small">
                  Replacing a CV clears its previous AI analysis. Scanned PDFs need OCR before
                  upload.
                </p>
              </section>
              <section className="panel padded">
                <div className="panel-heading flush">
                  <div>
                    <h2>
                      <Sparkles size={19} /> Structured resume
                    </h2>
                    <p>Organize experience into a readable profile.</p>
                  </div>
                </div>
                <AiConsent checked={consent} onChange={setConsent} configured={user.aiConfigured} />
                <Button
                  className="bg-[#245e4f] hover:bg-[#1b4338] text-white flex items-center gap-1.5"
                  disabled={!consent || !user.aiConfigured || !c.resumeText || Boolean(busy)}
                  onClick={() => void parseResume()}
                >
                  <Sparkles size={16} />
                  {busy === 'parse'
                    ? 'Parsing resume…'
                    : c.parsedResume
                      ? 'Parse again'
                      : 'Parse resume with AI'}
                </Button>
                {busy === 'parse' && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Analyzing experience and skills with Gemini…</span>
                      <span>80%</span>
                    </div>
                    <Progress value={80} className="h-1.5 w-full" />
                  </div>
                )}
                {c.parsedResume ? (
                  <div className="parsed-profile">
                    <p>{c.parsedResume.summary}</p>
                    <Separator className="my-4" />
                    <h3>Skills</h3>
                    <div className="requirement-tags">
                      {c.parsedResume.skills.map((s, i) => (
                        <span key={i}>{s}</span>
                      ))}
                    </div>
                    <Separator className="my-4" />
                    <h3>Experience</h3>
                    {c.parsedResume.experience.map((x, i) => (
                      <article key={i}>
                        <strong>{x.title || 'Role not stated'}</strong>
                        <small>{[x.company, x.period].filter(Boolean).join(' · ')}</small>
                        <p>{x.description}</p>
                      </article>
                    ))}
                    <Separator className="my-4" />
                    <h3>Education</h3>
                    {c.parsedResume.education.map((x, i) => (
                      <p key={i}>
                        {[x.qualification, x.institution, x.period].filter(Boolean).join(' · ')}
                      </p>
                    ))}
                    <Separator className="my-4" />
                    <h3>Languages</h3>
                    <p>{c.parsedResume.languages.join(', ') || 'Not stated'}</p>
                  </div>
                ) : (
                  <div className="quiet-note">
                    {c.resumeText
                      ? "Your CV is ready. Parse it when you're ready to review."
                      : 'Upload a CV to start building this profile.'}
                  </div>
                )}
              </section>
            </div>
            {c.events && c.events.length > 0 && (
              <section className="panel padded mt-4">
                <div className="panel-heading flush">
                  <div>
                    <h2>Timeline</h2>
                    <p>Candidate and CV processing activity.</p>
                  </div>
                </div>
                <ol className="history-list">
                  {c.events.map((event) => (
                    <li key={event.id}>
                      <strong>{event.label}</strong>
                      <time>{new Date(event.createdAt).toLocaleString()}</time>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            {editing && (
              <CandidateForm
                value={c}
                close={() => setEditing(false)}
                saved={() => {
                  setEditing(false);
                  reload();
                }}
              />
            )}
          </>
        )
      )}
    </>
  );
}
