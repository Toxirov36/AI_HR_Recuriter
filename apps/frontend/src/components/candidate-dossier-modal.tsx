import { Printer, X, Download, ShieldCheck, Mail, Phone, Calendar, Sparkles, Building2, User, Award, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Application, Candidate } from '../types';
import { label, Button, useData } from './ui';
import { getEvidenceSummary } from '../lib/match-score';

export interface CandidateDossierModalProps {
  open: boolean;
  onClose: () => void;
  application?: Application | null;
  candidate?: Candidate | null;
}

export function CandidateDossierModal({
  open,
  onClose,
  application: initialApp,
  candidate: candidateProp,
}: CandidateDossierModalProps) {
  const { t } = useTranslation();
  if (!open) return null;

  // Agar application ID mavjud bo'lsa, to'liq talablar va ma'lumotlarni yuklaymiz
  const { data: fetchedApp } = useData<Application>(
    open && initialApp?.id ? `/applications/${initialApp.id}` : '',
  );
  const application = fetchedApp || initialApp;

  // Use either the candidate passed in or extract from application
  const candidate = candidateProp || application?.candidate;
  if (!candidate) return null;

  const evidence = application?.analysis ? getEvidenceSummary(application.analysis) : null;
  const parsed = candidate.parsedResume;
  const nowStr = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto dossier-modal-overlay">
      <div className="bg-slate-100 rounded-2xl shadow-2xl border border-slate-300 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto dossier-modal-window">
        {/* Modal Top Control Bar (Hidden during printing) */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 no-print">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1a5d4c]/10 text-[#1a5d4c] flex items-center justify-center">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                {t('candidateDossier.title')}
              </h2>
              <p className="text-xs text-slate-500">
                {t('candidateDossier.subtitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              onClick={handlePrint}
              className="bg-[#1a5d4c] hover:bg-[#144d3e] text-white flex items-center gap-2 shadow-sm text-sm"
            >
              <Printer size={16} /> {t('candidateDossier.printButton')}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-colors"
              aria-label={t('candidateDossier.close')}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Paper Preview Container */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-200/70 flex justify-center">
          <div
            id="printable-dossier"
            className="bg-white text-slate-900 w-full max-w-[210mm] min-h-[297mm] p-8 md:p-10 shadow-lg rounded-sm border border-slate-200/80 text-sm leading-relaxed"
          >
            {/* Header Document Brand */}
            <div className="border-b-2 border-[#1a5d4c] pb-4 mb-6 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 text-[#1a5d4c] font-black tracking-wider text-xs uppercase mb-1">
                  <Building2 size={15} /> {t('candidateDossier.brand')}
                </div>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  {candidate.fullName}
                </h1>
                {application?.vacancy?.title ? (
                  <p className="text-sm font-semibold text-slate-600 mt-0.5">
                    {t('candidateDossier.vacancyLabel')}:{' '}
                    <span className="text-[#1a5d4c] font-bold">
                      {application.vacancy.title}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-slate-600 mt-0.5">
                    {t('candidateDossier.subtitle')}
                  </p>
                )}
              </div>

              <div className="text-right">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-slate-100 text-slate-800 border border-slate-300">
                  {application ? label(application.status) : t('common.anonymous')}
                </span>
                <p className="text-[11px] text-slate-400 mt-1 font-mono">{nowStr}</p>
                <span className="text-[10px] text-red-600 font-semibold uppercase tracking-wider block mt-0.5">
                  {t('candidateDossier.confidential')}
                </span>
              </div>
            </div>

            {/* Candidate Contacts & Meta Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl mb-6 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                  {t('candidates.phoneNumber')}
                </span>
                <strong className="text-slate-800 font-medium break-words">
                  {candidate.phone || t('candidates.notAdded')}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                  {t('candidates.emailAddress')}
                </span>
                <strong className="text-slate-800 font-medium break-words">
                  {candidate.email || t('candidates.notAdded')}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                  Telegram
                </span>
                <strong className="text-slate-800 font-medium">
                  {candidate.telegramUsername ? `@${candidate.telegramUsername}` : t('candidates.notAdded')}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                  {t('candidates.tableSource')} / {t('candidates.tableCreated')}
                </span>
                <strong className="text-slate-800 font-medium">
                  {(candidate.source === 'TELEGRAM' ? t('candidates.sourceTelegram') : t('candidates.sourceWebsite'))} ·{' '}
                  {new Date(candidate.createdAt).toLocaleDateString()}
                </strong>
              </div>
            </div>

            {/* Telegram AI Pre-screening Assessment Section */}
            {(application?.assessmentScore != null || application?.assessmentResult != null) && (
              <div className="mb-6 dossier-section">
                <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#1a5d4c] flex items-center gap-1.5">
                    <Sparkles size={14} /> {t('candidateDossier.prescreeningTitle')}
                  </h3>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                    {t('candidateDossier.assessmentResult')}: {application.assessmentScore ?? application.assessmentResult?.score}% · {application.assessmentResult?.passed !== false ? t('candidateDossier.passed') : t('candidateDossier.failed')}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl mb-3 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">{t('candidateDossier.totalScore')}</span>
                    <strong className="text-emerald-800 text-sm font-bold">
                      {application.assessmentScore ?? application.assessmentResult?.score}% ({application.assessmentResult?.correctCount ?? Math.round(((application.assessmentScore ?? 0) / 10))}/10)
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">💡 Hard Skills</span>
                    <strong className="text-slate-800 text-sm font-bold">
                      {application.assessmentResult?.hardSkillScore ?? '-'}%
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">🤝 Soft Skills</span>
                    <strong className="text-slate-800 text-sm font-bold">
                      {application.assessmentResult?.softSkillScore ?? '-'}%
                    </strong>
                  </div>
                </div>

                {application.assessmentResult?.answers?.length ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 text-left border-b border-slate-200">
                          <th className="p-2 font-semibold w-12 text-center">#</th>
                          <th className="p-2 font-semibold w-28">{t('candidateDossier.directionCol')}</th>
                          <th className="p-2 font-semibold w-24">{t('candidateDossier.assessmentResult')}</th>
                          <th className="p-2 font-semibold">{t('candidateDossier.selectedOption')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {application.assessmentResult.answers.map((ans, idx) => (
                          <tr key={idx} className={ans.isCorrect ? 'bg-emerald-50/20' : 'bg-rose-50/20'}>
                            <td className="p-2 text-center font-mono font-medium text-slate-500">{idx + 1}</td>
                            <td className="p-2 font-medium">
                              {ans.type === 'HARD_SKILL' ? (
                                <span className="inline-flex items-center gap-1 text-slate-800">💡 Hard</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-slate-800">🤝 Soft</span>
                              )}
                            </td>
                            <td className="p-2">
                              {ans.isCorrect ? (
                                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  ✓ {t('candidateDossier.correct')}
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                                  ✗ {t('candidateDossier.incorrect')}
                                </span>
                              )}
                            </td>
                            <td className="p-2 text-slate-700">
                              {t('candidateDossier.variant')} {String.fromCharCode(65 + ans.selectedIndex)}
                              {!ans.isCorrect && (
                                <span className="text-slate-400 ml-1.5">({t('candidateDossier.correctAnswerNotice')}: {String.fromCharCode(65 + ans.correctIndex)})</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            )}

            {/* AI Fit & Evidence Section (If Application Analysis exists) */}
            {application?.analysis && (
              <div className="mb-6 dossier-section">
                <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#1a5d4c] flex items-center gap-1.5">
                    <Sparkles size={14} /> {t('candidateDossier.aiEvaluation')}
                  </h3>
                  {evidence && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {evidence.supported} {t('candidateDossier.verified')} · {evidence.partial} {t('candidateDossier.partial')} ·{' '}
                      {evidence.notFound} {t('candidateDossier.notFound')}
                    </span>
                  )}
                </div>

                {/* Evidence items table */}
                {(application?.vacancy?.requirements?.length ?? 0) > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 text-left border-b border-slate-200">
                          <th className="p-2.5 font-semibold w-1/3">{t('candidateDossier.reqCol')}</th>
                          <th className="p-2.5 font-semibold w-24">{t('candidateDossier.statusCol')}</th>
                          <th className="p-2.5 font-semibold">{t('candidateDossier.evidenceCol')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {application.vacancy!.requirements.map((req) => {
                          const item = application.analysis?.requirements?.find(
                            (r) => r.requirementId === req.id,
                          );
                          let badgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
                          let badgeText = t('candidates.notStated');

                          if (item?.status === 'SUPPORTED') {
                            badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                            badgeText = t('candidateDossier.verified');
                          } else if (item?.status === 'PARTIAL') {
                            badgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
                            badgeText = t('candidateDossier.partial');
                          } else if (item?.status === 'NOT_FOUND') {
                            badgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
                            badgeText = t('candidateDossier.notFound');
                          }

                          return (
                            <tr key={req.id} className="hover:bg-slate-50/50">
                              <td className="p-2.5 align-top">
                                <strong className="text-slate-900 block font-medium">
                                  {req.name}
                                </strong>
                                {req.required && (
                                  <span className="text-[10px] text-amber-700 font-semibold uppercase">
                                    {t('candidateDossier.mandatoryReq')}
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 align-top">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${badgeClass}`}
                                >
                                  {badgeText}
                                </span>
                              </td>
                              <td className="p-2.5 align-top text-slate-600">
                                {item?.explanation && (
                                  <p className="mb-1 text-slate-800">{item.explanation}</p>
                                )}
                                {item?.quotes?.length ? (
                                  <div className="space-y-1">
                                    {item.quotes.map((quote, qi) => (
                                      <blockquote
                                        key={qi}
                                        className="pl-2 border-l-2 border-emerald-500 text-[11px] italic text-slate-600 bg-emerald-50/30 py-0.5"
                                      >
                                        «{quote}»
                                      </blockquote>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic">
                                    {t('candidateDossier.noDirectQuote')}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (application?.analysis?.requirements?.length ?? 0) > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 text-left border-b border-slate-200">
                          <th className="p-2.5 font-semibold w-24">{t('candidateDossier.statusCol')}</th>
                          <th className="p-2.5 font-semibold">{t('candidateDossier.evidenceCol')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {application.analysis!.requirements.map((item, idx) => {
                          let badgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
                          let badgeText = t('candidates.notStated');

                          if (item?.status === 'SUPPORTED') {
                            badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                            badgeText = t('candidateDossier.verified');
                          } else if (item?.status === 'PARTIAL') {
                            badgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
                            badgeText = t('candidateDossier.partial');
                          } else if (item?.status === 'NOT_FOUND') {
                            badgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
                            badgeText = t('candidateDossier.notFound');
                          }

                          return (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="p-2.5 align-top">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${badgeClass}`}
                                >
                                  {badgeText}
                                </span>
                              </td>
                              <td className="p-2.5 align-top text-slate-600">
                                {item.explanation && (
                                  <p className="mb-1 text-slate-800">{item.explanation}</p>
                                )}
                                {item.quotes?.length ? (
                                  <div className="space-y-1">
                                    {item.quotes.map((quote, qi) => (
                                      <blockquote
                                        key={qi}
                                        className="pl-2 border-l-2 border-emerald-500 text-[11px] italic text-slate-600 bg-emerald-50/30 py-0.5"
                                      >
                                        «{quote}»
                                      </blockquote>
                                    ))}
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-lg border border-slate-200">
                    {t('candidateDossier.noRequirementsDesc')}
                  </p>
                )}
              </div>
            )}

            {/* Structured Resume Profile: Skills, Experience, Education */}
            {parsed && (
              <div className="mb-6 space-y-4 dossier-section">
                {/* Executive Summary */}
                {parsed.summary && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#1a5d4c] mb-1.5 border-b border-slate-200 pb-1">
                      {t('candidateDossier.aiSummaryTitle')}
                    </h3>
                    <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200">
                      {parsed.summary}
                    </p>
                  </div>
                )}

                {/* Skills */}
                {parsed.skills?.length ? (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#1a5d4c] mb-1.5 border-b border-slate-200 pb-1">
                      {t('candidateDossier.keySkillsTitle')}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {parsed.skills.map((skill, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 text-xs font-medium"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Experience History */}
                {parsed.experience?.length ? (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#1a5d4c] mb-2 border-b border-slate-200 pb-1">
                      {t('candidateDossier.experienceTitle')}
                    </h3>
                    <div className="space-y-2.5">
                      {parsed.experience.map((exp, idx) => (
                        <div
                          key={idx}
                          className="border-l-2 border-[#1a5d4c] pl-3 py-0.5 text-xs"
                        >
                          <div className="flex items-baseline justify-between">
                            <strong className="text-slate-900 font-semibold">
                              {exp.title || t('candidates.roleNotStated')}
                            </strong>
                            <span className="text-[11px] text-slate-500 font-medium">
                              {exp.period}
                            </span>
                          </div>
                          <span className="text-slate-600 block font-medium">
                            {exp.company}
                          </span>
                          {exp.description && (
                            <p className="text-slate-600 text-[11px] mt-1 line-clamp-3">
                              {exp.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Education & Languages */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  {parsed.education?.length ? (
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#1a5d4c] mb-1.5 border-b border-slate-200 pb-1">
                        {t('candidateDossier.educationTitle')}
                      </h4>
                      <div className="space-y-1.5 text-xs text-slate-700">
                        {parsed.education.map((edu, idx) => (
                          <div key={idx}>
                            <strong className="block text-slate-900">
                              {edu.qualification || t('candidateDossier.education')}
                            </strong>
                            <span className="text-slate-600 text-[11px]">
                              {[edu.institution, edu.period].filter(Boolean).join(' · ')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {parsed.languages?.length ? (
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#1a5d4c] mb-1.5 border-b border-slate-200 pb-1">
                        {t('candidateDossier.languagesTitle')}
                      </h4>
                      <p className="text-xs text-slate-700 font-medium">
                        {parsed.languages.join(', ')}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* Interview Guide / Questions Section (If generated) */}
            {application?.interviewQuestions?.questions?.length ? (
              <div className="mb-6 dossier-section">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#1a5d4c] mb-2 border-b border-slate-200 pb-1">
                  {t('candidateDossier.interviewQuestionsTitle')}
                </h3>
                <div className="space-y-2 text-xs">
                  {application.interviewQuestions.questions.slice(0, 4).map((q, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-50 border border-slate-200"
                    >
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#1a5d4c] text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div>
                          <strong className="text-slate-900 block font-semibold">
                            {q.question}
                          </strong>
                          {q.rationale && (
                            <span className="text-[10px] text-slate-500 font-medium mt-0.5 block">
                              {t('candidateDossier.rationaleLabel')}: {q.rationale}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Official Sign-off & Leadership Evaluation Box */}
            <div className="mt-8 pt-4 border-t-2 border-slate-200 dossier-section">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                {t('candidateDossier.decisionTitle')}
              </h4>
              <div className="grid grid-cols-3 gap-3 mb-6 text-xs text-slate-700">
                <div className="p-3 border border-slate-300 rounded-lg flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-slate-400"></div>
                  <span>{t('candidateDossier.decisionHire')}</span>
                </div>
                <div className="p-3 border border-slate-300 rounded-lg flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-slate-400"></div>
                  <span>{t('candidateDossier.decisionNext')}</span>
                </div>
                <div className="p-3 border border-slate-300 rounded-lg flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-slate-400"></div>
                  <span>{t('candidateDossier.decisionReject')}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 text-xs text-slate-600 pt-2">
                <div className="border-b border-slate-300 pb-1">
                  <span className="text-[10px] uppercase text-slate-400 block">
                    {t('candidateDossier.interviewerLabel')}
                  </span>
                  <div className="h-6"></div>
                </div>
                <div className="border-b border-slate-300 pb-1">
                  <span className="text-[10px] uppercase text-slate-400 block">
                    {t('candidateDossier.signatureLabel')}
                  </span>
                  <div className="h-6"></div>
                </div>
              </div>
            </div>

            {/* Document Footer Note */}
            <div className="mt-8 pt-3 border-t border-slate-100 text-[10px] text-slate-400 text-center flex items-center justify-between">
              <span>{t('candidateDossier.docId')}: #{application?.id || candidate.id}</span>
              <span>{t('candidateDossier.generatedBy')}</span>
              <span>{t('candidateDossier.pageOne')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
