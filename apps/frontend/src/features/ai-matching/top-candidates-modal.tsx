import { useState, useEffect } from 'react';
import {
  Sparkles,
  Trophy,
  Award,
  Medal,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  UserCheck,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  FileText,
  X,
  Mail,
  Phone,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, send } from '../../lib/api';
import { label } from '../../lib/utils';
import {
  Button,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '../../components/ui';
import type { Stage, Application } from '../../types';

export interface TopCandidateItem {
  applicationId: number;
  candidateId: number;
  candidateName: string;
  candidateEmail?: string | null;
  candidatePhone?: string | null;
  candidateSource?: string | null;
  currentStage: Stage;
  hasResume: boolean;
  hasConsent: boolean;
  isAnalyzed: boolean;
  matchScore: number;
  mandatoryScore: number;
  optionalScore: number;
  supportedCount: number;
  partialCount: number;
  notFoundCount: number;
  unknownCount: number;
  strengths: string[];
  gaps: string[];
  partialMatches: string[];
  rank?: number;
  requirementDetails?: Array<{
    id: number;
    name: string;
    required: boolean;
    status: string;
    explanation?: string;
  }>;
}

export interface TopComparisonPayload {
  executiveSummary: string;
  candidateHighlights: Array<{
    candidateId: number;
    rank: number;
    keyStrengthsSummary: string;
    areasToVerify: string;
    recommendedInterviewFocus: string;
  }>;
  overallRecommendation: string;
}

export interface TopCandidatesResponse {
  vacancy: {
    id: number;
    title: string;
    status: string;
    requirementsCount: number;
  };
  stats: {
    totalApplications: number;
    analyzedCount: number;
    unanalyzedCount: number;
    averageScore: number;
  };
  topCandidates: TopCandidateItem[];
  allCandidates: TopCandidateItem[];
  comparison?: TopComparisonPayload;
}

interface TopCandidatesModalProps {
  vacancyId: number | null;
  open: boolean;
  onClose: () => void;
  onApplicationStageChanged?: () => void;
  onOpenDossier?: (application: any) => void;
}

export function TopCandidatesModal({
  vacancyId,
  open,
  onClose,
  onApplicationStageChanged,
  onOpenDossier,
}: TopCandidatesModalProps) {
  const [data, setData] = useState<TopCandidatesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'podium' | 'comparison' | 'matrix' | 'all'>('podium');
  const [movingAppId, setMovingAppId] = useState<number | null>(null);

  useEffect(() => {
    if (open && vacancyId) {
      void loadTopCandidates();
    } else {
      setData(null);
    }
  }, [open, vacancyId]);

  async function loadTopCandidates() {
    if (!vacancyId) return;
    setLoading(true);
    try {
      const res = await api<TopCandidatesResponse>(`/vacancies/${vacancyId}/top-candidates?limit=3`);
      setData(res);
    } catch (err: any) {
      toast.error(err?.message || "Top nomzodlar ma'lumotlarini yuklashda xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  }

  async function runBatchAnalysis() {
    if (!vacancyId) return;
    setAnalyzing(true);
    try {
      const res = await send<{ message: string; analyzedCount: number; skippedCount: number }>(
        `/vacancies/${vacancyId}/analyze-candidates`,
        {},
        'POST',
      );
      toast.success(res?.message || "Nomzodlar muvaffaqiyatli tahlil qilindi!");
      await loadTopCandidates();
      onApplicationStageChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'AI tahlil jarayonida xatolik yuz berdi');
    } finally {
      setAnalyzing(false);
    }
  }

  async function moveToInterview(candidate: TopCandidateItem) {
    if (candidate.currentStage === 'INTERVIEW') {
      toast.info('Nomzod allaqachon Suhbat bosqichida');
      return;
    }
    setMovingAppId(candidate.applicationId);
    try {
      await send(
        `/applications/${candidate.applicationId}/status`,
        { status: 'INTERVIEW', expectedStatus: candidate.currentStage },
        'PUT',
      );
      toast.success(`${candidate.candidateName} Suhbat (Interview) bosqichiga o'tkazildi!`);
      // Update local state
      setData((prev) => {
        if (!prev) return prev;
        const updateList = (list: TopCandidateItem[]) =>
          list.map((c) =>
            c.applicationId === candidate.applicationId ? { ...c, currentStage: 'INTERVIEW' as Stage } : c,
          );
        return {
          ...prev,
          topCandidates: updateList(prev.topCandidates),
          allCandidates: updateList(prev.allCandidates),
        };
      });
      onApplicationStageChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Bosqichni almashtirishda xatolik');
    } finally {
      setMovingAppId(null);
    }
  }

  if (!open) return null;

  const topCandidates = data?.topCandidates || [];
  const rankIcons = [
    <Trophy key="1" className="h-5 w-5 text-amber-400" />,
    <Medal key="2" className="h-5 w-5 text-slate-300" />,
    <Award key="3" className="h-5 w-5 text-amber-600" />,
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 sm:p-6 border-b border-slate-100 dark:border-zinc-800 bg-gradient-to-r from-emerald-500/5 via-transparent to-teal-500/5">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Top 3 Mos Nomzodlar
                </h2>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                  AI Ranked
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
                {data?.vacancy?.title ? `"${data.vacancy.title}" vakansiyasi bo'yicha tahlil` : 'Vakansiya talablari tahlili'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={runBatchAnalysis}
              disabled={analyzing || loading}
              className="h-9 px-3 text-xs sm:text-sm font-medium border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${analyzing ? 'animate-spin' : ''}`} />
              {analyzing ? 'Tahlil qilinmoqda…' : 'AI Tahlilni yangilash'}
            </Button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Quick Stats Bar */}
        {data?.stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-6 py-3 bg-slate-50/80 dark:bg-zinc-800/40 border-b border-slate-100 dark:border-zinc-800 text-xs">
            <div className="flex flex-col">
              <span className="text-slate-500 dark:text-zinc-400">Jami arizalar:</span>
              <span className="font-semibold text-slate-900 dark:text-white">{data.stats.totalApplications} ta</span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500 dark:text-zinc-400">AI Tahlil qilingan:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {data.stats.analyzedCount} / {data.stats.totalApplications}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500 dark:text-zinc-400">O'rtacha moslik:</span>
              <span className="font-semibold text-slate-900 dark:text-white">{data.stats.averageScore}%</span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500 dark:text-zinc-400">Talablar soni:</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {data.vacancy.requirementsCount} ta mezoni
              </span>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-4 text-sm">
            <button
              onClick={() => setActiveTab('podium')}
              className={`pb-2.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'podium'
                  ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              <Trophy className="h-4 w-4" /> Top 3 Podium
            </button>
            <button
              onClick={() => setActiveTab('comparison')}
              className={`pb-2.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'comparison'
                  ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              <Sparkles className="h-4 w-4" /> AI Xulosa & Tavsiya
            </button>
            <button
              onClick={() => setActiveTab('matrix')}
              className={`pb-2.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'matrix'
                  ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              <Layers className="h-4 w-4" /> Taqqoslama Matritsa
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`pb-2.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'all'
                  ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              <TrendingUp className="h-4 w-4" /> Barcha Nomzodlar ({data?.allCandidates?.length || 0})
            </button>
          </div>
        </div>

        {/* Modal Body / Tab Contents */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {loading && !data ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <div className="h-10 w-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-slate-600 dark:text-zinc-400">
                Top nomzodlar tahlili hisoblanmoqda…
              </p>
            </div>
          ) : topCandidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto space-y-4">
              <div className="p-4 rounded-3xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-8 w-8 mx-auto" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Hali tahlil qilingan nomzodlar yo'q
              </h3>
              <p className="text-sm text-slate-500 dark:text-zinc-400">
                Ushbu vakansiyaga biriktirilgan nomzodlar rezyumesi hali AI tahlilidan o'tkazilmagan yoki nomzodlar qo'shilmagan.
              </p>
              <Button
                onClick={runBatchAnalysis}
                disabled={analyzing}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {analyzing ? 'Tahlil qilinmoqda…' : 'AI Tahlilni ishga tushirish'}
              </Button>
            </div>
          ) : (
            <>
              {/* TAB 1: PODIUM CARDS */}
              {activeTab === 'podium' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                    {topCandidates.map((candidate, index) => {
                      const isFirst = index === 0;
                      return (
                        <div
                          key={candidate.applicationId}
                          className={`relative flex flex-col rounded-3xl p-5 sm:p-6 transition-all duration-200 border ${
                            isFirst
                              ? 'bg-gradient-to-b from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-300 dark:border-emerald-700/60 shadow-lg shadow-emerald-500/10'
                              : 'bg-white dark:bg-zinc-800/50 border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'
                          }`}
                        >
                          {/* Rank Badge & Match Score Header */}
                          <div className="flex items-start justify-between gap-2 mb-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center justify-center h-8 w-8 rounded-xl font-bold text-sm shadow-sm ${
                                  isFirst
                                    ? 'bg-amber-400 text-slate-950 font-black'
                                    : index === 1
                                    ? 'bg-slate-200 text-slate-700 dark:bg-zinc-700 dark:text-zinc-200'
                                    : 'bg-amber-700/80 text-white'
                                }`}
                              >
                                #{candidate.rank || index + 1}
                              </span>
                              <div>
                                <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400 block">
                                  {isFirst ? '🥇 Eng yuqori moslik' : index === 1 ? '🥈 2-o‘rin' : '🥉 3-o‘rin'}
                                </span>
                              </div>
                            </div>

                            {/* Score circular visual */}
                            <div className="flex flex-col items-end">
                              <div
                                className={`text-2xl font-black tracking-tight ${
                                  candidate.matchScore >= 80
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : candidate.matchScore >= 60
                                    ? 'text-teal-600 dark:text-teal-400'
                                    : 'text-amber-600 dark:text-amber-400'
                                }`}
                              >
                                {candidate.matchScore}%
                              </div>
                              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                                Moslik
                              </span>
                            </div>
                          </div>

                          {/* Candidate Identity */}
                          <div className="mb-4">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white line-clamp-1">
                              {candidate.candidateName}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-[11px] font-semibold">
                                {label(candidate.currentStage)}
                              </Badge>
                              {candidate.candidateSource && (
                                <span className="text-[11px] text-slate-400">
                                  {candidate.candidateSource}
                                </span>
                              )}
                            </div>

                            {/* Contacts */}
                            <div className="space-y-1 mt-2.5 text-xs text-slate-500 dark:text-zinc-400">
                              {candidate.candidateEmail && (
                                <div className="flex items-center gap-1.5 truncate">
                                  <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                  <span className="truncate">{candidate.candidateEmail}</span>
                                </div>
                              )}
                              {candidate.candidatePhone && (
                                <div className="flex items-center gap-1.5">
                                  <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                  <span>{candidate.candidatePhone}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Scoring Breakdown Bar */}
                          <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-100 dark:border-zinc-700/50 mb-4 text-xs">
                            <div className="flex justify-between text-slate-600 dark:text-zinc-300">
                              <span>Majburiy talablar:</span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                {candidate.mandatoryScore}%
                              </span>
                            </div>
                            <div className="flex justify-between text-slate-600 dark:text-zinc-300">
                              <span>Ixtiyoriy talablar:</span>
                              <span className="font-semibold text-slate-700 dark:text-zinc-200">
                                {candidate.optionalScore}%
                              </span>
                            </div>
                            <div className="flex justify-between text-slate-500 dark:text-zinc-400 text-[11px] pt-1 border-t border-slate-200/60 dark:border-zinc-700">
                              <span>Tasdiqlangan:</span>
                              <span>
                                {candidate.supportedCount} ta / {candidate.supportedCount + candidate.partialCount + candidate.notFoundCount + candidate.unknownCount} ta
                              </span>
                            </div>
                          </div>

                          {/* Strengths Tags */}
                          {candidate.strengths.length > 0 && (
                            <div className="mb-3 space-y-1.5">
                              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                                Kuchli tomonlari:
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {candidate.strengths.slice(0, 3).map((s, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs bg-emerald-100/70 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300"
                                  >
                                    <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                    <span className="truncate max-w-[170px]">{s}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Gaps Tags */}
                          {candidate.gaps.length > 0 && (
                            <div className="mb-5 space-y-1.5">
                              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block">
                                Aniqlashtirish kerak:
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {candidate.gaps.slice(0, 2).map((g, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs bg-amber-100/70 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300"
                                  >
                                    <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                                    <span className="truncate max-w-[170px]">{g}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Card Action Buttons */}
                          <div className="mt-auto pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center gap-2">
                            <Button
                              onClick={() => moveToInterview(candidate)}
                              disabled={movingAppId === candidate.applicationId || candidate.currentStage === 'INTERVIEW'}
                              className={`flex-1 rounded-xl text-xs font-semibold py-2 h-auto ${
                                candidate.currentStage === 'INTERVIEW'
                                  ? 'bg-slate-100 dark:bg-zinc-800 text-slate-400 cursor-not-allowed'
                                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              }`}
                            >
                              <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                              {candidate.currentStage === 'INTERVIEW' ? 'Suhbatda' : 'Suhbatga chaqirish'}
                            </Button>

                            {onOpenDossier && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onOpenDossier({ id: candidate.applicationId })}
                                className="rounded-xl h-auto py-2 px-2.5 text-xs"
                                title="Nomzod dosyesini ko'rish"
                              >
                                <FileText className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 2: AI EXECUTIVE SUMMARY */}
              {activeTab === 'comparison' && data?.comparison && (
                <div className="space-y-6">
                  {/* Executive Overview Box */}
                  <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-emerald-500/10 via-slate-50 to-teal-500/5 dark:from-emerald-950/30 dark:via-zinc-800/50 dark:to-teal-950/20 border border-emerald-200 dark:border-emerald-800/50 space-y-3">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                      <Sparkles className="h-4 w-4" />
                      <span>Boshqaruv Xulosasi (Executive Summary)</span>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-700 dark:text-zinc-200">
                      {data.comparison.executiveSummary}
                    </p>
                    <div className="pt-3 border-t border-emerald-200/50 dark:border-emerald-800/30 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                      <strong>Tavsiya:</strong>
                      <span>{data.comparison.overallRecommendation}</span>
                    </div>
                  </div>

                  {/* Candidate Highlights List */}
                  {data.comparison.candidateHighlights && data.comparison.candidateHighlights.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                        Top Nomzodlar Bo'yicha Tahliliy Taqqoslash
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {data.comparison.candidateHighlights.map((item, idx) => {
                          const candidate = topCandidates.find((c) => c.candidateId === item.candidateId);
                          return (
                            <div
                              key={idx}
                              className="p-5 rounded-2xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/60 space-y-3"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-sm text-slate-900 dark:text-white">
                                  #{item.rank} {candidate?.candidateName || `Nomzod ${item.candidateId}`}
                                </span>
                                <Badge variant="secondary" className="text-xs">
                                  {candidate?.matchScore}% Mos
                                </Badge>
                              </div>

                              <div className="text-xs space-y-2">
                                <div>
                                  <strong className="text-emerald-700 dark:text-emerald-400 block mb-0.5">
                                    Kuchli jihatlari:
                                  </strong>
                                  <p className="text-slate-600 dark:text-zinc-300 leading-normal">
                                    {item.keyStrengthsSummary}
                                  </p>
                                </div>

                                <div>
                                  <strong className="text-amber-700 dark:text-amber-400 block mb-0.5">
                                    Tekshirilishi kerak:
                                  </strong>
                                  <p className="text-slate-600 dark:text-zinc-300 leading-normal">
                                    {item.areasToVerify}
                                  </p>
                                </div>

                                <div className="pt-2 border-t border-slate-100 dark:border-zinc-700">
                                  <strong className="text-slate-500 dark:text-zinc-400 block mb-0.5">
                                    Suhbatda e'tibor qaratish:
                                  </strong>
                                  <p className="text-slate-700 dark:text-zinc-200 italic">
                                    "{item.recommendedInterviewFocus}"
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: REQUIREMENTS MATRIX */}
              {activeTab === 'matrix' && (
                <div className="space-y-4">
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800">
                    <table className="w-full text-left text-xs text-slate-600 dark:text-zinc-300">
                      <thead className="bg-slate-50 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-200 font-semibold border-b border-slate-200 dark:border-zinc-800">
                        <tr>
                          <th className="p-3.5 w-1/3">Vakansiya Talabi</th>
                          <th className="p-3.5 w-24">Turi</th>
                          {topCandidates.map((c, i) => (
                            <th key={c.applicationId} className="p-3.5 text-center">
                              #{i + 1} {c.candidateName}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                        {topCandidates[0]?.requirementDetails?.map((req) => (
                          <tr key={req.id} className="hover:bg-slate-50/60 dark:hover:bg-zinc-800/30">
                            <td className="p-3.5 font-medium text-slate-900 dark:text-white">
                              {req.name}
                            </td>
                            <td className="p-3.5">
                              {req.required ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
                                  Majburiy
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                                  Ixtiyoriy
                                </span>
                              )}
                            </td>
                            {topCandidates.map((c) => {
                              const detail = c.requirementDetails?.find((r) => r.id === req.id);
                              const status = detail?.status || 'NOT_ANALYZED';
                              return (
                                <td key={c.applicationId} className="p-3.5 text-center">
                                  {status === 'SUPPORTED' ? (
                                    <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                                      <CheckCircle2 className="h-4 w-4" /> Mos
                                    </span>
                                  ) : status === 'PARTIAL' ? (
                                    <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                                      <AlertCircle className="h-4 w-4" /> Qisman
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-slate-400 dark:text-zinc-500">
                                      <X className="h-4 w-4" /> Topilmadi
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 4: ALL RANKED CANDIDATES */}
              {activeTab === 'all' && data?.allCandidates && (
                <div className="space-y-4">
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800">
                    <table className="w-full text-left text-xs text-slate-600 dark:text-zinc-300">
                      <thead className="bg-slate-50 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-200 font-semibold border-b border-slate-200 dark:border-zinc-800">
                        <tr>
                          <th className="p-3.5 w-12 text-center">O'rin</th>
                          <th className="p-3.5">Nomzod</th>
                          <th className="p-3.5">Moslik Bali</th>
                          <th className="p-3.5">Majburiy</th>
                          <th className="p-3.5">Bosqich</th>
                          <th className="p-3.5 text-right">Amal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                        {data.allCandidates.map((c, i) => (
                          <tr key={c.applicationId} className="hover:bg-slate-50/60 dark:hover:bg-zinc-800/30">
                            <td className="p-3.5 text-center font-bold text-slate-700 dark:text-zinc-300">
                              {c.rank ? `#${c.rank}` : '-'}
                            </td>
                            <td className="p-3.5">
                              <span className="font-bold text-slate-900 dark:text-white block">
                                {c.candidateName}
                              </span>
                              <span className="text-[11px] text-slate-400">{c.candidateEmail || 'Email kiritilmagan'}</span>
                            </td>
                            <td className="p-3.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
                                  {c.matchScore}%
                                </span>
                              </div>
                            </td>
                            <td className="p-3.5 font-semibold text-slate-700 dark:text-zinc-300">
                              {c.mandatoryScore}%
                            </td>
                            <td className="p-3.5">
                              <Badge variant="outline" className="text-[11px]">
                                {label(c.currentStage)}
                              </Badge>
                            </td>
                            <td className="p-3.5 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => moveToInterview(c)}
                                disabled={movingAppId === c.applicationId || c.currentStage === 'INTERVIEW'}
                                className="text-xs h-7 px-2.5"
                              >
                                {c.currentStage === 'INTERVIEW' ? 'Suhbatda' : 'Suhbatga chaqirish'}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-t border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50">
          <p className="text-xs text-slate-400">
            * Baholash NIST AI RMF va faktik rezyume dalillari asosida amalga oshirilgan.
          </p>
          <Button variant="outline" size="sm" onClick={onClose} className="rounded-xl">
            Yopish
          </Button>
        </div>
      </div>
    </div>
  );
}
