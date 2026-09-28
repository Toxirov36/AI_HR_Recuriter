import { useState, useRef, useEffect } from 'react';
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
  Mail,
  Phone,
  ShieldAlert,
} from 'lucide-react';
import { api, send } from '../../lib/api';
import { useAuth } from '../../features/auth';
import { ParseProgress, type ParseStatusResponse } from '../../components/parse-progress';
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
  ResumeDropzone,
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
                            <div className="candidate-identity">
                              <Link
                                className="candidate-avatar-link"
                                to={`/candidates/${c.id}`}
                                aria-label={`View ${c.fullName}`}
                              >
                                <Avatar className="h-9 w-9">
                                  <AvatarFallback className="bg-[#1b4338] text-white font-semibold text-xs">
                                    {c.fullName.slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                              </Link>
                              <div className="candidate-identity-content">
                                <Link className="candidate-name-link" to={`/candidates/${c.id}`}>
                                  {c.fullName}
                                </Link>
                                <div className="candidate-contact-lines">
                                  {c.email ? (
                                    <a href={`mailto:${c.email}`} title={c.email}>
                                      <Mail size={12} /> <span>{c.email}</span>
                                    </a>
                                  ) : (
                                    <span className="missing-contact">
                                      <Mail size={12} /> No email
                                    </span>
                                  )}
                                  {c.phone ? (
                                    <a href={`tel:${c.phone}`} title={c.phone}>
                                      <Phone size={12} /> <span>{c.phone}</span>
                                    </a>
                                  ) : (
                                    <span className="missing-contact">
                                      <Phone size={12} /> No phone
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
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
  const { data: duplicates, reload: reloadDuplicates } = useData<Array<Pick<Candidate, 'id' | 'fullName' | 'email' | 'phone' | 'source' | 'resumeName'>>>(`/candidates/${id}/duplicates`);
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const [consent, setConsent] = useState(false);
  const [editing, setEditing] = useState(false);
  const [anonymizeOpen, setAnonymizeOpen] = useState(false);
  const [mergeCandidate, setMergeCandidate] = useState<NonNullable<typeof duplicates>[number] | null>(null);
  const [parseProgress, setParseProgress] = useState<ParseStatusResponse | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  async function confirmAnonymize() {
    setBusy('anonymize');
    try {
      await send(`/v1/candidates/${id}/anonymize`, {});
      toast.success('Nomzod shaxsiy ma‘lumotlari anonimlashtirildi (GDPR)');
      setAnonymizeOpen(false);
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function confirmMerge() {
    if (!mergeCandidate) return;
    setBusy('merge');
    setActionError('');
    try {
      await send(`/candidates/${id}/merge`, { duplicateId: mergeCandidate.id });
      toast.success('Nomzod profillari birlashtirildi');
      setMergeCandidate(null);
      reload();
      reloadDuplicates();
    } catch (cause) {
      setActionError((cause as Error).message);
    } finally {
      setBusy('');
    }
  }

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
    setParseProgress({
      status: 'PENDING',
      step: 1,
      totalSteps: 4,
      message: "Navbatga qo'yildi va tahlilga tayyorlanmoqda…",
      percent: 0,
    });

    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    try {
      await send(`/candidates/${id}/parse-async`, { consent });

      const pollInterval = 800;
      let attempts = 0;
      const maxAttempts = 60;

      pollTimerRef.current = setInterval(async () => {
        attempts++;
        try {
          const status = await api<ParseStatusResponse>(`/candidates/${id}/parse-status`);
          if (status && status.status) {
            setParseProgress(status);

            if (status.status === 'COMPLETED') {
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
              setBusy('');
              toast.success("Rezyume AI orqali to'liq tahlil qilindi!");
              reload();
            } else if (status.status === 'FAILED') {
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
              setBusy('');
              setActionError(status.error || 'Rezyumeni tahlil qilishda xatolik yuz berdi.');
            }
          }
        } catch {
          // Ignore transient polling failure
        }

        if (attempts >= maxAttempts) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setBusy('');
          setActionError("Tahlil vaqti tugadi. Qayta urinib ko'ring.");
        }
      }, pollInterval);
    } catch (e) {
      setBusy('');
      setParseProgress(null);
      setActionError((e as Error).message);
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
              text={[
                c.source === 'TELEGRAM' ? 'Telegram candidate' : 'Website candidate',
                c.telegramUsername ? `@${c.telegramUsername}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              <div className="flex items-center gap-2">
                {(c as any).isAnonymized && (
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    Anonimlashtirilgan (GDPR)
                  </span>
                )}
                {(c as any).isOcrProcessed && (
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    OCR orqali o'qilgan
                  </span>
                )}
                {!(c as any).isAnonymized && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setEditing(true)}
                      className="flex items-center gap-1.5"
                    >
                      <Pencil size={16} /> Edit profile
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setAnonymizeOpen(true)}
                      className="flex items-center gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <ShieldAlert size={16} /> PII Anonymize
                    </Button>
                  </>
                )}
              </div>
            </PageTitle>
            {c.mergedIntoId && (
              <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Bu profil boshqa nomzod profiliga birlashtirilgan. <Link className="font-semibold underline" to={`/candidates/${c.mergedIntoId}`}>Asosiy profilni ochish</Link>
              </section>
            )}
            {!c.mergedIntoId && Boolean(duplicates?.length) && (
              <section className="mb-5 rounded-xl border border-[#cce3d7] bg-[#f4faf6] p-5" aria-label="Potential duplicate candidates">
                <h2 className="text-base font-semibold text-[#183d30]">O‘xshash nomzod profillari</h2>
                <p className="mt-1 text-sm text-[#60736b]">Email yoki telefon bir xil. Ma’lumotlarni tekshiring; birlashtirish faqat siz tasdiqlaganingizdan keyin amalga oshadi.</p>
                <div className="mt-3 space-y-2">
                  {duplicates?.map((match) => (
                    <div key={match.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#dce7e0] bg-white p-3 text-sm">
                      <div><Link className="font-semibold text-[#245e4f] underline" to={`/candidates/${match.id}`}>{match.fullName}</Link><p className="text-xs text-[#60736b]">{match.source} · {match.email || match.phone} {match.resumeName ? '· CV mavjud' : ''}</p></div>
                      <Button variant="outline" disabled={Boolean(busy)} onClick={() => setMergeCandidate(match)}>Shu profilga birlashtirish</Button>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {Boolean(c.mergedCandidates?.length) && (
              <section className="mb-5 rounded-xl border border-[#dce7e0] bg-white p-4 text-sm">
                <strong>Birlashtirilgan eski profillar</strong>
                <p className="mt-1 text-[#60736b]">Eski CV va tarixni tekshirish uchun profilni oching.</p>
                <div className="mt-2 flex flex-wrap gap-3">{c.mergedCandidates?.map((source) => <Link key={source.id} className="text-[#245e4f] underline" to={`/candidates/${source.id}`}>{source.fullName} #{source.id}</Link>)}</div>
              </section>
            )}
            <section className="candidate-contact-panel" aria-label="Candidate contact information">
              <div className="candidate-contact-item">
                <span className="candidate-contact-icon">
                  <Mail size={17} />
                </span>
                <div>
                  <small>Email address</small>
                  {c.email ? (
                    <a href={`mailto:${c.email}`}>{c.email}</a>
                  ) : (
                    <strong className="missing-contact">Not added</strong>
                  )}
                </div>
              </div>
              <div className="candidate-contact-item">
                <span className="candidate-contact-icon">
                  <Phone size={17} />
                </span>
                <div>
                  <small>Phone number</small>
                  {c.phone ? (
                    <a href={`tel:${c.phone}`}>{c.phone}</a>
                  ) : (
                    <strong className="missing-contact">Not added</strong>
                  )}
                </div>
              </div>
            </section>
            <div className="detail-grid">
              <section className="panel padded">
                <div className="panel-heading flush">
                  <div>
                    <h2>Curriculum vitae</h2>
                    <p>The source behind every piece of evidence.</p>
                  </div>
                  <FileText size={20} />
                </div>
                <ResumeDropzone
                  onFileSelect={(file) => void upload(file)}
                  disabled={Boolean(busy)}
                  uploading={busy === 'upload'}
                  hasExistingFile={Boolean(c.resumeName)}
                  fileName={c.resumeName}
                />
                {c.resumeName && (
                  <div className="flex items-center justify-between p-3.5 mt-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-[#1a5d4c]/10 text-[#1a5d4c] flex items-center justify-center shrink-0">
                        <FileText size={18} />
                      </div>
                      <span className="text-xs font-semibold truncate text-slate-700">{c.resumeName}</span>
                    </div>
                    <a
                      aria-label="Download CV"
                      href={`/api/candidates/${c.id}/resume`}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors shrink-0 ml-2"
                      title="Yuklab olish"
                    >
                      <Download size={17} />
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
                <AiConsent checked={consent} onChange={setConsent} configured={Boolean(user?.aiConfigured)} />
                {c.publicSubmittedAt && !c.aiConsentAt && <p className="mt-2 text-sm text-amber-700">Nomzod AI tahliliga rozilik bermagan. CV faqat HR tomonidan ko‘rib chiqiladi.</p>}
                <Button
                  className="bg-[#245e4f] hover:bg-[#1b4338] text-white flex items-center gap-1.5"
                  disabled={!consent || !user?.aiConfigured || !c.resumeText || Boolean(busy) || Boolean(c.publicSubmittedAt && !c.aiConsentAt)}
                  onClick={() => void parseResume()}
                >
                  <Sparkles size={16} />
                  {busy === 'parse'
                    ? 'Parsing resume…'
                    : c.parsedResume
                      ? 'Parse again'
                      : 'Parse resume with AI'}
                </Button>
                {parseProgress && (
                  <div className="mt-4">
                    <ParseProgress
                      progress={parseProgress}
                      onRetry={() => void parseResume()}
                    />
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
            <AlertDialog open={anonymizeOpen} onOpenChange={setAnonymizeOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Nomzod ma‘lumotlarini anonimlashtirish?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Ushbu amal nomzodning ism-familiyasi, telefoni, emaili, Telegram ma'lumotlari va barcha yuklangan rezyume fayllarini butunlay o'chiradi. Bu jarayonni ortga qaytarib bo'lmaydi (GDPR Art. 17).
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 text-white hover:bg-red-700"
                    onClick={() => void confirmAnonymize()}
                  >
                    {busy === 'anonymize' ? 'Anonimlashtirilmoqda…' : 'Anonimlashtirish'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog open={Boolean(mergeCandidate)} onOpenChange={(open) => !open && setMergeCandidate(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Nomzod profillarini birlashtirish?</AlertDialogTitle>
                  <AlertDialogDescription>
                    <strong>{mergeCandidate?.fullName}</strong> profilidagi arizalar va CV yozuvlari <strong>{c.fullName}</strong> profiliga o‘tkaziladi. Eski profil tarix uchun saqlanadi. Ikkala profil bir vakansiyaga ariza yuborgan bo‘lsa, birlashtirish to‘xtatiladi.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
                  <AlertDialogAction disabled={busy === 'merge'} className="bg-[#245e4f] text-white hover:bg-[#1b4338]" onClick={() => void confirmMerge()}>
                    {busy === 'merge' ? 'Birlashtirilmoqda…' : 'Birlashtirish'}
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
