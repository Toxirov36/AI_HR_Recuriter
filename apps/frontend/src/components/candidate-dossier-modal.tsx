import { Printer, X, Download, ShieldCheck, Mail, Phone, Calendar, Sparkles, Building2, User, Award, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
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
  const nowStr = new Date().toLocaleDateString('uz-UZ', {
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
                Nomzod Dosyesi (A4 PDF)
              </h2>
              <p className="text-xs text-slate-500">
                Rahbariyat va suhbat oluvchilar uchun tayyor xulosa
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              onClick={handlePrint}
              className="bg-[#1a5d4c] hover:bg-[#144d3e] text-white flex items-center gap-2 shadow-sm text-sm"
            >
              <Printer size={16} /> PDF yuklab olish / Chop etish
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-colors"
              aria-label="Yopish"
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
                  <Building2 size={15} /> AI HR Recruiter · Kadrlar Xizmati
                </div>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  {candidate.fullName}
                </h1>
                {application?.vacancy?.title ? (
                  <p className="text-sm font-semibold text-slate-600 mt-0.5">
                    Vakansiya:{' '}
                    <span className="text-[#1a5d4c] font-bold">
                      {application.vacancy.title}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-slate-600 mt-0.5">
                    Nomzod profili va rezyume tahlili
                  </p>
                )}
              </div>

              <div className="text-right">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-slate-100 text-slate-800 border border-slate-300">
                  {application ? label(application.status) : 'NOMZOD'}
                </span>
                <p className="text-[11px] text-slate-400 mt-1 font-mono">{nowStr}</p>
                <span className="text-[10px] text-red-600 font-semibold uppercase tracking-wider block mt-0.5">
                  Maxfiy / Ichki foydalanish
                </span>
              </div>
            </div>

            {/* Candidate Contacts & Meta Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl mb-6 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                  Telefon
                </span>
                <strong className="text-slate-800 font-medium break-words">
                  {candidate.phone || 'Kiritilmagan'}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                  Email
                </span>
                <strong className="text-slate-800 font-medium break-words">
                  {candidate.email || 'Kiritilmagan'}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                  Telegram
                </span>
                <strong className="text-slate-800 font-medium">
                  {candidate.telegramUsername ? `@${candidate.telegramUsername}` : 'Mavjud emas'}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                  Manba / Qo‘shilgan
                </span>
                <strong className="text-slate-800 font-medium">
                  {candidate.source || 'Website'} ·{' '}
                  {new Date(candidate.createdAt).toLocaleDateString('uz-UZ')}
                </strong>
              </div>
            </div>

            {/* AI Fit & Evidence Section (If Application Analysis exists) */}
            {application?.analysis && (
              <div className="mb-6 dossier-section">
                <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#1a5d4c] flex items-center gap-1.5">
                    <Sparkles size={14} /> AI Tahlili va Talablarga Moslik
                  </h3>
                  {evidence && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {evidence.supported} tasdiqlangan · {evidence.partial} qisman ·{' '}
                      {evidence.notFound} topilmadi
                    </span>
                  )}
                </div>

                {/* Evidence items table */}
                {(application?.vacancy?.requirements?.length ?? 0) > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 text-left border-b border-slate-200">
                          <th className="p-2.5 font-semibold w-1/3">Vakansiya talabi</th>
                          <th className="p-2.5 font-semibold w-24">Holat</th>
                          <th className="p-2.5 font-semibold">Rezyumedan olingan faktik dalil</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {application.vacancy!.requirements.map((req) => {
                          const item = application.analysis?.requirements?.find(
                            (r) => r.requirementId === req.id,
                          );
                          let badgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
                          let badgeText = 'Noma’lum';

                          if (item?.status === 'SUPPORTED') {
                            badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                            badgeText = 'Tasdiqlangan';
                          } else if (item?.status === 'PARTIAL') {
                            badgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
                            badgeText = 'Qisman';
                          } else if (item?.status === 'NOT_FOUND') {
                            badgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
                            badgeText = 'Topilmadi';
                          }

                          return (
                            <tr key={req.id} className="hover:bg-slate-50/50">
                              <td className="p-2.5 align-top">
                                <strong className="text-slate-900 block font-medium">
                                  {req.name}
                                </strong>
                                {req.required && (
                                  <span className="text-[10px] text-amber-700 font-semibold uppercase">
                                    Majburiy talab
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
                                    CV ichida bu bo‘yicha to‘g‘ridan-to‘g‘ri matn uchramadi
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
                          <th className="p-2.5 font-semibold w-24">Holat</th>
                          <th className="p-2.5 font-semibold">Rezyumedan olingan faktik dalil</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {application.analysis!.requirements.map((item, idx) => {
                          let badgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
                          let badgeText = 'Noma’lum';

                          if (item?.status === 'SUPPORTED') {
                            badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                            badgeText = 'Tasdiqlangan';
                          } else if (item?.status === 'PARTIAL') {
                            badgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
                            badgeText = 'Qisman';
                          } else if (item?.status === 'NOT_FOUND') {
                            badgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
                            badgeText = 'Topilmadi';
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
                    Vakansiya talablari kiritilmagan yoki tahlil mavjud emas.
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
                      Nomzod Haqida Qisqacha (AI Summary)
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
                      Asosiy Ko‘nikma va Texnologiyalar
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
                      Ish Tajribasi
                    </h3>
                    <div className="space-y-2.5">
                      {parsed.experience.map((exp, idx) => (
                        <div
                          key={idx}
                          className="border-l-2 border-[#1a5d4c] pl-3 py-0.5 text-xs"
                        >
                          <div className="flex items-baseline justify-between">
                            <strong className="text-slate-900 font-semibold">
                              {exp.title || 'Lavozim'}
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
                        Ta’lim
                      </h4>
                      <div className="space-y-1.5 text-xs text-slate-700">
                        {parsed.education.map((edu, idx) => (
                          <div key={idx}>
                            <strong className="block text-slate-900">
                              {edu.qualification || 'Mutaxassislik'}
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
                        Tillar
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
                  Tavsiya Etilgan Suhbat Savollari (AI Generated)
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
                              Asos: {q.rationale}
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
                Rahbariyat va Interviewer Qarori
              </h4>
              <div className="grid grid-cols-3 gap-3 mb-6 text-xs text-slate-700">
                <div className="p-3 border border-slate-300 rounded-lg flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-slate-400"></div>
                  <span>Ishga qabul qilinsin</span>
                </div>
                <div className="p-3 border border-slate-300 rounded-lg flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-slate-400"></div>
                  <span>Keyingi bosqich / Zaxira</span>
                </div>
                <div className="p-3 border border-slate-300 rounded-lg flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-slate-400"></div>
                  <span>Rad etilsin</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 text-xs text-slate-600 pt-2">
                <div className="border-b border-slate-300 pb-1">
                  <span className="text-[10px] uppercase text-slate-400 block">
                    Interviewer / Mas’ul HR F.I.Sh
                  </span>
                  <div className="h-6"></div>
                </div>
                <div className="border-b border-slate-300 pb-1">
                  <span className="text-[10px] uppercase text-slate-400 block">
                    Imzo va Sana
                  </span>
                  <div className="h-6"></div>
                </div>
              </div>
            </div>

            {/* Document Footer Note */}
            <div className="mt-8 pt-3 border-t border-slate-100 text-[10px] text-slate-400 text-center flex items-center justify-between">
              <span>Hujjat ID: #{application?.id || candidate.id}</span>
              <span>AI HR Recruiter platformasi orqali shakllantirilgan</span>
              <span>1-sahifa</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
