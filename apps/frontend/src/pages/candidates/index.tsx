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
  Printer,
  Sparkles,
  FileText,
  Mail,
  Phone,
  ShieldAlert,
} from 'lucide-react';
import { api, send } from '../../lib/api';
import { useAuth } from '../../features/auth';
import { ParseProgress, type ParseStatusResponse } from '../../components/parse-progress';
import { exportCandidatesToCsv } from '../../lib/export';
import { CandidateDossierModal } from '../../components/candidate-dossier-modal';
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
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      toast.success(value ? t('candidates.updatedSuccess') : t('candidates.addedSuccess'));
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={value ? t('candidates.modalEditTitle') : t('candidates.modalAddTitle')}
      subtitle={t('candidates.modalSubtitle')}
      close={close}
      className="candidate-modal-custom"
    >
      <form onSubmit={submit} className="vacancy-modal-body">
        <Alert message={error} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="candidate-fullName">
              {t('candidates.labelFullName')} <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              id="candidate-fullName"
              required
              name="fullName"
              maxLength={160}
              defaultValue={value?.fullName || ''}
              placeholder={t('candidates.labelFullName')}
              className="form-control-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="candidate-email">
              {t('candidates.labelEmail')}
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
              {t('candidates.labelPhone')}
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
          {t('candidates.emptySubtitle')}
        </p>
        <div className="modal-footer-actions">
          <button type="button" className="btn-modal-cancel" onClick={close}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="btn-modal-submit"
            disabled={busy}
            aria-label={value ? t('candidates.editCandidate') : t('candidates.addCandidate')}
          >
            {busy ? t('common.saving') : value ? t('candidates.editCandidate') : t('candidates.addCandidate')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Candidates() {
  const { t } = useTranslation();
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
      toast.success(`Candidate "${c.fullName}" ${t('candidates.deletedSuccess')}`);
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
        eyebrow={t('pipeline.eyebrow')}
        title={t('candidates.title')}
        text={t('candidates.subtitle')}
      >
        <Button
          onClick={() => setOpen(true)}
          className="bg-[#245e4f] hover:bg-[#1b4338] text-white flex items-center gap-1.5"
        >
          <Plus size={17} /> {t('candidates.addCandidate')}
        </Button>
      </PageTitle>
      <div className="vacancies-toolbar candidates-toolbar">
        <div className="vacancies-search-box">
          <Search className="vacancies-search-icon" size={17} />
          <input
            type="text"
            aria-label={t('candidates.searchPlaceholder')}
            placeholder={t('candidates.searchPlaceholder')}
            value={search}
            className="vacancies-search-input"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="candidates-count-pill">
          <span>{data?.total ?? '—'} {t('common.records')}</span>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (!data?.items?.length) {
              toast.error(t('candidates.emptyTitle'));
              return;
            }
            exportCandidatesToCsv(data.items);
            toast.success(`${data.items.length} ${t('common.exportCsv')}`);
          }}
          className="flex items-center gap-1.5 h-10 px-3.5 rounded-xl border border-slate-200 text-slate-800 bg-white hover:bg-slate-50 font-medium text-sm shadow-none shrink-0"
          title={t('common.exportCsv')}
        >
          <Download size={15} /> {t('common.exportCsv')}
        </Button>
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
                        <TableHead>{t('candidates.tableFullName')}</TableHead>
                        <TableHead>{t('candidates.tableSource')}</TableHead>
                        <TableHead>{t('candidates.tableResume')}</TableHead>
                        <TableHead>{t('candidates.tableApplications')}</TableHead>
                        <TableHead>{t('candidates.tableCreated')}</TableHead>
                        <TableHead>{t('common.actions')}</TableHead>
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
                                aria-label={`${t('candidates.viewDossier')} ${c.fullName}`}
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
                                      <Mail size={12} /> {t('candidates.noEmail')}
                                    </span>
                                  )}
                                  {c.phone ? (
                                    <a href={`tel:${c.phone}`} title={c.phone}>
                                      <Phone size={12} /> <span>{c.phone}</span>
                                    </a>
                                  ) : (
                                    <span className="missing-contact">
                                      <Phone size={12} /> {t('candidates.noPhone')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="badge neutral">
                              {c.source === 'TELEGRAM' ? t('candidates.sourceTelegram') : t('candidates.sourceWebsite')}
                            </span>
                            {c.telegramUsername && (
                              <small className="block muted">@{c.telegramUsername}</small>
                            )}
                            {c.source === 'TELEGRAM' && (() => {
                              const app = c.applications?.[0];
                              const score = app?.assessmentScore;
                              if (score === null || score === undefined) {
                                return (
                                  <small className="block muted" style={{ marginTop: '3px', fontSize: '11px' }}>
                                    {t('candidates.testNoScore')}
                                  </small>
                                );
                              }
                              const passed = score >= 70;
                              return (
                                <small
                                  className="block"
                                  style={{
                                    marginTop: '3px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: passed ? '#15803d' : '#dc2626',
                                  }}
                                >
                                  {t(passed ? 'candidates.testPassed' : 'candidates.testFailed', { score })}
                                </small>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            <span className={`file-state ${c.resumeName ? 'has-file' : ''}`}>
                              <FileText size={15} />
                              {c.resumeName ? t('candidates.resumeUploaded') : t('candidates.resumeNotUploaded')}
                            </span>
                          </TableCell>
                          <TableCell>{c._count?.applications || 0}</TableCell>
                          <TableCell>{date(c.createdAt)}</TableCell>
                          <TableCell>
                            <div className="row">
                              <Link
                                className="icon-button"
                                aria-label={`${t('candidates.viewDossier')} ${c.fullName}`}
                                to={`/candidates/${c.id}`}
                              >
                                <ArrowUpRight size={16} />
                              </Link>
                              <button
                                className="icon-button"
                                aria-label={`${t('candidates.editCandidate')} ${c.fullName}`}
                                onClick={() => {
                                  setEditing(c);
                                  setOpen(true);
                                }}
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                className="icon-button danger"
                                aria-label={`${t('candidates.deleteCandidate')} ${c.fullName}`}
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
                  title={search ? t('candidates.emptyTitle') : t('candidates.emptyTitle')}
                  text={
                    search
                      ? t('candidates.emptySubtitle')
                      : t('candidates.emptySubtitle')
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
            <AlertDialogTitle>{t('candidates.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('candidates.deleteConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#dc2626] text-white hover:bg-[#b91c1c]"
              onClick={() => deletingCandidate && void confirmDeleteCandidate(deletingCandidate)}
            >
              {t('candidates.deleteCandidate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function CandidateDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { user } = useAuth();
  const { data: c, error, reload } = useData<Candidate>(`/candidates/${id}`);
  const { data: duplicates, reload: reloadDuplicates } = useData<Array<Pick<Candidate, 'id' | 'fullName' | 'email' | 'phone' | 'source' | 'resumeName'>>>(`/candidates/${id}/duplicates`);
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const [editing, setEditing] = useState(false);
  const [dossierOpen, setDossierOpen] = useState(false);
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
      toast.success(t('candidates.anonymizedSuccess'));
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
      toast.success(t('candidates.mergedSuccess'));
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
      setActionError(t('candidates.maxFileSizeError'));
      return;
    }
    setBusy('upload');
    try {
      const f = new FormData();
      f.append('file', file);
      await api(`/candidates/${id}/resume`, { method: 'POST', body: f });
      toast.success(t('candidates.cvUploadedSuccess'));
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
      message: t('candidates.parsingPending'),
      percent: 0,
    });

    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    try {
      await send(`/candidates/${id}/parse-async`, { consent: true });

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
              toast.success(t('candidates.parsingCompleted'));
              reload();
            } else if (status.status === 'FAILED') {
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
              setBusy('');
              setActionError(status.error || t('candidates.parsingFailed'));
            }
          }
        } catch {
          // Ignore transient polling failure
        }

        if (attempts >= maxAttempts) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setBusy('');
          setActionError(t('candidates.parsingTimeout'));
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
        <ArrowLeft size={16} /> {t('candidates.backToCandidates')}
      </Link>
      <Alert message={error || actionError} />
      {!c && !error ? (
        <Loading />
      ) : (
        c && (
          <>
            <PageTitle
              eyebrow={t('candidates.eyebrowProfile')}
              title={c.fullName}
              text={[
                c.source === 'TELEGRAM' ? t('candidates.telegramCandidate') : t('candidates.websiteCandidate'),
                c.telegramUsername ? `@${c.telegramUsername}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              <div className="flex items-center gap-2">
                {(c as any).isAnonymized && (
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    {t('candidates.anonymizedBadge')}
                  </span>
                )}
                {(c as any).isOcrProcessed && (
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    {t('candidates.ocrProcessedBadge')}
                  </span>
                )}
                {!(c as any).isAnonymized && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setDossierOpen(true)}
                      className="flex items-center gap-1.5 border-slate-300 text-slate-800 hover:bg-slate-50 font-medium"
                    >
                      <Printer size={16} /> {t('candidates.dossierBtn')}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setEditing(true)}
                      className="flex items-center gap-1.5"
                    >
                      <Pencil size={16} /> {t('candidates.editProfileBtn')}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setAnonymizeOpen(true)}
                      className="flex items-center gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <ShieldAlert size={16} /> {t('candidates.anonymizeBtn')}
                    </Button>
                  </>
                )}
              </div>
            </PageTitle>
            {c.mergedIntoId && (
              <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                {t('candidates.mergedNotice')}{' '}
                <Link className="font-semibold underline" to={`/candidates/${c.mergedIntoId}`}>
                  {t('candidates.openMainProfile')}
                </Link>
              </section>
            )}
            {!c.mergedIntoId && Boolean(duplicates?.length) && (
              <section className="mb-5 rounded-xl border border-[#cce3d7] dark:border-[#24352e] bg-[#f4faf6] dark:bg-[#17302a] p-5" aria-label={t('candidates.duplicatesTitle')}>
                <h2 className="text-base font-semibold text-[#183d30] dark:text-[#e6efea]">{t('candidates.duplicatesTitle')}</h2>
                <p className="mt-1 text-sm text-[#60736b] dark:text-[#93a8a0]">{t('candidates.duplicatesDesc')}</p>
                <div className="mt-3 space-y-2">
                  {duplicates?.map((match) => (
                    <div key={match.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#dce7e0] dark:border-[#24352e] bg-white p-3 text-sm">
                      <div>
                        <Link className="font-semibold text-[#245e4f] dark:text-[#58c0a0] underline" to={`/candidates/${match.id}`}>
                          {match.fullName}
                        </Link>
                        <p className="text-xs text-[#60736b] dark:text-[#93a8a0]">
                          {match.source === 'TELEGRAM' ? t('candidates.sourceTelegram') : t('candidates.sourceWebsite')} · {match.email || match.phone} {match.resumeName ? `· ${t('candidates.hasCv')}` : ''}
                        </p>
                      </div>
                      <Button variant="outline" disabled={Boolean(busy)} onClick={() => setMergeCandidate(match)}>
                        {t('candidates.mergeToThis')}
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {Boolean(c.mergedCandidates?.length) && (
              <section className="mb-5 rounded-xl border border-[#dce7e0] dark:border-[#24352e] bg-white p-4 text-sm">
                <strong>{t('candidates.mergedHistoryTitle')}</strong>
                <p className="mt-1 text-[#60736b] dark:text-[#93a8a0]">{t('candidates.mergedHistoryDesc')}</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {c.mergedCandidates?.map((source) => (
                    <Link key={source.id} className="text-[#245e4f] dark:text-[#58c0a0] underline" to={`/candidates/${source.id}`}>
                      {source.fullName} #{source.id}
                    </Link>
                  ))}
                </div>
              </section>
            )}
            <section className="candidate-contact-panel" aria-label="Candidate contact information">
              <div className="candidate-contact-item">
                <span className="candidate-contact-icon">
                  <Mail size={17} />
                </span>
                <div>
                  <small>{t('candidates.emailAddress')}</small>
                  {c.email ? (
                    <a href={`mailto:${c.email}`}>{c.email}</a>
                  ) : (
                    <strong className="missing-contact">{t('candidates.notAdded')}</strong>
                  )}
                </div>
              </div>
              <div className="candidate-contact-item">
                <span className="candidate-contact-icon">
                  <Phone size={17} />
                </span>
                <div>
                  <small>{t('candidates.phoneNumber')}</small>
                  {c.phone ? (
                    <a href={`tel:${c.phone}`}>{c.phone}</a>
                  ) : (
                    <strong className="missing-contact">{t('candidates.notAdded')}</strong>
                  )}
                </div>
              </div>
            </section>
            <div className="detail-grid">
              <section className="panel padded">
                <div className="panel-heading flush">
                  <div>
                    <h2>{t('candidates.cvTitle')}</h2>
                    <p>{t('candidates.cvDesc')}</p>
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
                      <div className="h-8 w-8 rounded-lg bg-[#1a5d4c]/10 text-[#1a5d4c] dark:text-[#58c0a0] flex items-center justify-center shrink-0">
                        <FileText size={18} />
                      </div>
                      <span className="text-xs font-semibold truncate text-slate-700">{c.resumeName}</span>
                    </div>
                    <a
                      aria-label={t('candidates.downloadCv')}
                      href={`/api/candidates/${c.id}/resume`}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors shrink-0 ml-2"
                      title={t('candidates.downloadCv')}
                    >
                      <Download size={17} />
                    </a>
                  </div>
                )}
                {c.resumeText && (
                  <details className="text-preview">
                    <summary>{t('candidates.viewExtractedText')}</summary>
                    <pre>{c.resumeText}</pre>
                  </details>
                )}
                <p className="muted small">
                  {t('candidates.cvReplaceWarning')}
                </p>
              </section>
              <section className="panel padded">
                <div className="panel-heading flush">
                  <div>
                    <h2>
                      <Sparkles size={19} /> {t('candidates.structuredResumeTitle')}
                    </h2>
                    <p>{t('candidates.structuredResumeDesc')}</p>
                  </div>
                </div>
                {!user?.aiConfigured && (
                  <div className="my-2">
                    <Alert message={t('candidates.aiNotConfigured')} />
                  </div>
                )}
                {c.publicSubmittedAt && !c.aiConsentAt && (
                  <p className="mt-2 text-sm text-amber-700">{t('candidates.noAiConsentNotice')}</p>
                )}
                <Button
                  className="bg-[#245e4f] hover:bg-[#1b4338] text-white flex items-center gap-1.5"
                  disabled={!user?.aiConfigured || !c.resumeText || Boolean(busy) || Boolean(c.publicSubmittedAt && !c.aiConsentAt)}
                  onClick={() => void parseResume()}
                >
                  <Sparkles size={16} />
                  {busy === 'parse'
                    ? t('candidates.parsingResumeBtn')
                    : c.parsedResume
                      ? t('candidates.parseAgain')
                      : t('candidates.parseResumeAi')}
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
                    <h3>{t('candidateDossier.skills')}</h3>
                    <div className="requirement-tags">
                      {c.parsedResume.skills.map((s, i) => (
                        <span key={i}>{s}</span>
                      ))}
                    </div>
                    <Separator className="my-4" />
                    <h3>{t('candidateDossier.experience')}</h3>
                    {c.parsedResume.experience.map((x, i) => (
                      <article key={i}>
                        <strong>{x.title || t('candidates.roleNotStated')}</strong>
                        <small>{[x.company, x.period].filter(Boolean).join(' · ')}</small>
                        <p>{x.description}</p>
                      </article>
                    ))}
                    <Separator className="my-4" />
                    <h3>{t('candidateDossier.education')}</h3>
                    {c.parsedResume.education.map((x, i) => (
                      <p key={i}>
                        {[x.qualification, x.institution, x.period].filter(Boolean).join(' · ')}
                      </p>
                    ))}
                    <Separator className="my-4" />
                    <h3>{t('candidateDossier.languages')}</h3>
                    <p>{c.parsedResume.languages.join(', ') || t('candidates.notStated')}</p>
                  </div>
                ) : (
                  <div className="quiet-note">
                    {c.resumeText
                      ? t('candidates.cvReadyPrompt')
                      : t('candidates.uploadCvPrompt')}
                  </div>
                )}
              </section>
            </div>
            {c.events && c.events.length > 0 && (
              <section className="panel padded mt-4">
                <div className="panel-heading flush">
                  <div>
                    <h2>{t('candidates.timelineTitle')}</h2>
                    <p>{t('candidates.timelineDesc')}</p>
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
                  <AlertDialogTitle>{t('candidates.modalAnonymizeTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('candidates.modalAnonymizeDesc')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 text-white hover:bg-red-700"
                    onClick={() => void confirmAnonymize()}
                  >
                    {busy === 'anonymize' ? t('candidates.anonymizing') : t('candidates.anonymizeAction')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog open={Boolean(mergeCandidate)} onOpenChange={(open) => !open && setMergeCandidate(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('candidates.modalMergeTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    <strong>{mergeCandidate?.fullName}</strong>{' '}
                    {t('candidates.modalMergeDesc')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction disabled={busy === 'merge'} className="bg-[#245e4f] text-white hover:bg-[#1b4338]" onClick={() => void confirmMerge()}>
                    {busy === 'merge' ? t('candidates.merging') : t('candidates.mergeAction')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <CandidateDossierModal
              open={dossierOpen}
              onClose={() => setDossierOpen(false)}
              candidate={c}
            />
          </>
        )
      )}
    </>
  );
}
