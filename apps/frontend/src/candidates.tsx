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
import { api, send } from './api';
import { useAuth } from './auth';
import {
  AiConsent,
  Alert,
  date,
  Empty,
  Loading,
  Modal,
  PageTitle,
  Pagination,
  useData,
} from './ui';
import type { Candidate, Page } from './types';
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
  const [open, setOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const { data, error, reload } = useData<Page<Candidate>>(
    `/candidates?page=${page}&search=${encodeURIComponent(search)}`,
  );
  const close = () => {
    setOpen(false);
    setEditing(null);
  };
  async function remove(c: Candidate) {
    if (
      !window.confirm(
        `Delete ${c.fullName}, their CV, and all applications? This cannot be undone.`,
      )
    )
      return;
    try {
      await api(`/candidates/${c.id}`, { method: 'DELETE' });
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="PEOPLE, NOT PAPERWORK"
        title="Candidates"
        text="Your talent pool, with room for the whole story."
      >
        <button className="primary" onClick={() => setOpen(true)}>
          <Plus size={17} /> Add candidate
        </button>
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
                  <table>
                    <thead>
                      <tr>
                        <th>Candidate</th>
                        <th>CV</th>
                        <th>Applications</th>
                        <th>Added</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <Link className="person" to={`/candidates/${c.id}`}>
                              <span className="avatar">{c.fullName.slice(0, 2).toUpperCase()}</span>
                              <div>
                                <strong>{c.fullName}</strong>
                                <small>{c.email || 'No email added'}</small>
                              </div>
                            </Link>
                          </td>
                          <td>
                            <span className={`file-state ${c.resumeName ? 'has-file' : ''}`}>
                              <FileText size={15} />
                              {c.resumeName ? 'Uploaded' : 'Not uploaded'}
                            </span>
                          </td>
                          <td>{c._count?.applications || 0}</td>
                          <td>{date(c.createdAt)}</td>
                          <td>
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
                                onClick={() => void remove(c)}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                [c.email, c.phone].filter(Boolean).join(' · ') || 'Contact information not added'
              }
            >
              <button className="secondary" onClick={() => setEditing(true)}>
                <Pencil size={16} /> Edit profile
              </button>
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
                <button
                  className="primary"
                  disabled={!consent || !user.aiConfigured || !c.resumeText || Boolean(busy)}
                  onClick={() => void parseResume()}
                >
                  <Sparkles size={16} />
                  {busy === 'parse'
                    ? 'Parsing resume…'
                    : c.parsedResume
                      ? 'Parse again'
                      : 'Parse resume with AI'}
                </button>
                {c.parsedResume ? (
                  <div className="parsed-profile">
                    <p>{c.parsedResume.summary}</p>
                    <h3>Skills</h3>
                    <div className="requirement-tags">
                      {c.parsedResume.skills.map((s, i) => (
                        <span key={i}>{s}</span>
                      ))}
                    </div>
                    <h3>Experience</h3>
                    {c.parsedResume.experience.map((x, i) => (
                      <article key={i}>
                        <strong>{x.title || 'Role not stated'}</strong>
                        <small>{[x.company, x.period].filter(Boolean).join(' · ')}</small>
                        <p>{x.description}</p>
                      </article>
                    ))}
                    <h3>Education</h3>
                    {c.parsedResume.education.map((x, i) => (
                      <p key={i}>
                        {[x.qualification, x.institution, x.period].filter(Boolean).join(' · ')}
                      </p>
                    ))}
                    <h3>Languages</h3>
                    <p>{c.parsedResume.languages.join(', ') || 'Not stated'}</p>
                  </div>
                ) : (
                  <div className="quiet-note">
                    {c.resumeText
                      ? 'Your CV is ready. Parse it when you’re ready to review.'
                      : 'Upload a CV to start building this profile.'}
                  </div>
                )}
              </section>
            </div>
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
