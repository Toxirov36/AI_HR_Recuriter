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
  Globe,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
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

export interface RecommendationItem {
  id: number;
  candidateId: number;
  candidateName: string;
  candidateEmail?: string | null;
  candidatePhone?: string | null;
  candidateSource?: string | null;
  hasApplication: boolean;
  applicationId: number | null;
  applicationStatus: Stage | null;
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
  requirementDetails?: Array<{
    id: number;
    name: string;
    required: boolean;
    status: string;
    explanation?: string;
  }>;
}

export interface HhResumeItem {
  id: string;
  title: string;
  url: string | null;
  area: string;
  updatedAt: string | null;
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
  const { t } = useTranslation();
  const [data, setData] = useState<TopCandidatesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'podium' | 'comparison' | 'matrix' | 'all' | 'recommendations' | 'headhunter'>('podium');
  const [movingAppId, setMovingAppId] = useState<number | null>(null);

  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [applyingCandidateId, setApplyingCandidateId] = useState<number | null>(null);

  const [hhResumes, setHhResumes] = useState<HhResumeItem[]>([]);
  const [hhTotal, setHhTotal] = useState<number>(0);
  const [loadingHh, setLoadingHh] = useState(false);
  const [hhNotConnected, setHhNotConnected] = useState(false);

  useEffect(() => {
    if (open && vacancyId) {
      void loadTopCandidates();
      void loadRecommendations();
      void loadHhResumes();
    } else {
      setData(null);
      setRecommendations([]);
      setHhResumes([]);
    }
  }, [open, vacancyId]);

  async function loadRecommendations() {
    if (!vacancyId) return;
    setLoadingRecs(true);
    try {
      const res = await api<{ recommendations: RecommendationItem[]; total: number }>(
        `/vacancies/${vacancyId}/recommendations`,
      );
      setRecommendations(res.recommendations || []);
    } catch {
      // Graceful fallback
    } finally {
      setLoadingRecs(false);
    }
  }

  async function loadHhResumes() {
    if (!vacancyId) return;
    setLoadingHh(true);
    setHhNotConnected(false);
    try {
      const res = await api<{ total: number; items: HhResumeItem[] }>(
        `/integrations/recruiting/vacancies/${vacancyId}/headhunter/resumes?page=0`,
      );
      setHhResumes(res.items || []);
      setHhTotal(res.total || 0);
    } catch (err: any) {
      if (err?.status === 403 || err?.message?.includes('HeadHunter')) {
        setHhNotConnected(true);
      }
    } finally {
      setLoadingHh(false);
    }
  }

  async function applyRecommendation(rec: RecommendationItem) {
    if (!vacancyId || applyingCandidateId) return;
    setApplyingCandidateId(rec.candidateId);
    try {
      await api(`/vacancies/${vacancyId}/recommendations/${rec.candidateId}/apply`, {
        method: 'POST',
      });
      toast.success(t('topCandidates.addedToPipeline'));
      setRecommendations((prev) =>
        prev.map((item) =>
          item.candidateId === rec.candidateId
            ? { ...item, hasApplication: true, applicationStatus: 'NEW' }
            : item,
        ),
      );
      onApplicationStageChanged?.();
      void loadTopCandidates();
    } catch (err: any) {
      toast.error(err?.message || 'Nomzodni arizaga qo‘shishda xatolik yuz berdi');
    } finally {
      setApplyingCandidateId(null);
    }
  }

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
      toast.info(t('topCandidates.inInterview'));
      return;
    }
    setMovingAppId(candidate.applicationId);
    try {
      await send(
        `/applications/${candidate.applicationId}/status`,
        { status: 'INTERVIEW', expectedStatus: candidate.currentStage },
        'PUT',
      );
      toast.success(`${candidate.candidateName} -> ${t('topCandidates.inInterview')}`);
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
      toast.error(err?.message || 'Error updating stage');
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
                  {t('topCandidates.title')}
                </h2>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                  AI Ranked
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
                {data?.vacancy?.title ? `${data.vacancy.title} · ${t('topCandidates.subtitle')}` : t('topCandidates.subtitle')}
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
              {analyzing ? t('topCandidates.analyzing') : t('topCandidates.runAnalysis')}
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
              <span className="text-slate-500 dark:text-zinc-400">{t('topCandidates.quickStatsTotal')}:</span>
              <span className="font-semibold text-slate-900 dark:text-white">{data.stats.totalApplications}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500 dark:text-zinc-400">{t('topCandidates.quickStatsAnalyzed')}:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {data.stats.analyzedCount} / {data.stats.totalApplications}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500 dark:text-zinc-400">{t('topCandidates.quickStatsAverage')}:</span>
              <span className="font-semibold text-slate-900 dark:text-white">{data.stats.averageScore}%</span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500 dark:text-zinc-400">{t('topCandidates.quickStatsRequirements')}:</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {data.vacancy.requirementsCount}
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
              <Trophy className="h-4 w-4" /> {t('topCandidates.tabPodium')}
            </button>
            <button
              onClick={() => setActiveTab('comparison')}
              className={`pb-2.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'comparison'
                  ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              <Sparkles className="h-4 w-4" /> {t('topCandidates.tabComparison')}
            </button>
            <button
              onClick={() => setActiveTab('matrix')}
              className={`pb-2.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'matrix'
                  ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              <Layers className="h-4 w-4" /> {t('topCandidates.tabMatrix')}
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`pb-2.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'all'
                  ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              <TrendingUp className="h-4 w-4" /> {t('topCandidates.tabAll')} ({data?.allCandidates?.length || 0})
            </button>
            <button
              onClick={() => {
                setActiveTab('recommendations');
                void loadRecommendations();
              }}
              className={`pb-2.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'recommendations'
                  ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              <UserCheck className="h-4 w-4" /> {t('topCandidates.tabRecommendations')} ({recommendations.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('headhunter');
                void loadHhResumes();
              }}
              className={`pb-2.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'headhunter'
                  ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              <ExternalLink className="h-4 w-4" /> {t('topCandidates.tabHeadhunter')}
            </button>
          </div>
        </div>

        {/* Modal Body / Tab Contents */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {activeTab === 'recommendations' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-zinc-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-emerald-600" />
                    {t('topCandidates.tabRecommendations')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    {t('topCandidates.recommendationsSubtitle')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void loadRecommendations()}
                  disabled={loadingRecs}
                  className="text-xs h-8"
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${loadingRecs ? 'animate-spin' : ''}`} />
                  {t('common.refresh', 'Yangilash')}
                </Button>
              </div>

              {loadingRecs ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
                  <div className="h-8 w-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-slate-500">{t('common.loading', 'Yuklanmoqda…')}</p>
                </div>
              ) : recommendations.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-zinc-800/40 rounded-2xl border border-slate-200 dark:border-zinc-800 text-center space-y-2">
                  <UserCheck className="h-10 w-10 text-slate-300 dark:text-zinc-600" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">
                    {t('topCandidates.noRecommendations')}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {recommendations.map((rec) => (
                    <div
                      key={rec.id}
                      className="flex flex-col justify-between p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-100 dark:border-zinc-800">
                          <div>
                            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                              {rec.candidateName}
                            </h4>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                              {rec.candidateEmail && <span>{rec.candidateEmail}</span>}
                              {rec.candidatePhone && <span>· {rec.candidatePhone}</span>}
                            </div>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                              {rec.matchScore}%
                            </span>
                            <span className="text-[10px] text-slate-400 mt-0.5">
                              Majburiy: {rec.mandatoryScore}%
                            </span>
                          </div>
                        </div>

                        {rec.strengths?.length > 0 && (
                          <div className="mt-3">
                            <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                              {t('topCandidates.strengths')}:
                            </p>
                            <ul className="text-xs text-slate-600 dark:text-zinc-300 space-y-1">
                              {rec.strengths.slice(0, 2).map((str, idx) => (
                                <li key={idx} className="flex items-start gap-1.5">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                  <span>{str}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {rec.gaps?.length > 0 && (
                          <div className="mt-2.5">
                            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 mb-1">
                              {t('topCandidates.gaps')}:
                            </p>
                            <ul className="text-xs text-slate-600 dark:text-zinc-300 space-y-1">
                              {rec.gaps.slice(0, 2).map((gap, idx) => (
                                <li key={idx} className="flex items-start gap-1.5">
                                  <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                                  <span>{gap}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">
                          {rec.supportedCount} ta tasdiqlangan
                        </span>
                        {rec.hasApplication ? (
                          <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 text-[11px]">
                            {t('topCandidates.alreadyInPipeline')}
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => void applyRecommendation(rec)}
                            disabled={applyingCandidateId === rec.candidateId}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 px-2.5"
                          >
                            <UserPlus className="h-3.5 w-3.5 mr-1" />
                            {t('topCandidates.addToPipeline')}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'headhunter' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-zinc-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Globe className="h-4 w-4 text-red-500" />
                    {t('topCandidates.tabHeadhunter')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    {t('topCandidates.hhLiveResumes')} · {t('topCandidates.hhTotalFound')}: {hhTotal}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void loadHhResumes()}
                  disabled={loadingHh}
                  className="text-xs h-8"
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${loadingHh ? 'animate-spin' : ''}`} />
                  {t('common.refresh', 'Yangilash')}
                </Button>
              </div>

              {loadingHh ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
                  <div className="h-8 w-8 border-3 border-red-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-slate-500">{t('common.loading', 'Yuklanmoqda…')}</p>
                </div>
              ) : hhNotConnected ? (
                <div className="flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-zinc-800/40 rounded-2xl border border-slate-200 dark:border-zinc-800 text-center space-y-3">
                  <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-950/50 text-red-600 flex items-center justify-center">
                    <Globe className="h-6 w-6" />
                  </div>
                  <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                    {t('topCandidates.hhNotConnected')}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm">
                    hh.uz orqali nomzodlarni qidirish uchun kompaniya sozlamalarida HeadHunter hisobini ulang.
                  </p>
                  <Button variant="outline" size="sm" asChild className="text-xs">
                    <a href="/admin">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      {t('topCandidates.hhConnectSettings')}
                    </a>
                  </Button>
                </div>
              ) : hhResumes.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-zinc-800/40 rounded-2xl border border-slate-200 dark:border-zinc-800 text-center space-y-2">
                  <Globe className="h-10 w-10 text-slate-300 dark:text-zinc-600" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">
                    {t('topCandidates.noCandidates')}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {hhResumes.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors"
                    >
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                          {item.title}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400 mt-1">
                          {item.area && <span>{item.area}</span>}
                          {item.updatedAt && (
                            <span>· Yangilangan: {new Date(item.updatedAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>

                      {item.url && (
                        <Button
                          size="sm"
                          variant="outline"
                          asChild
                          className="text-xs h-8 px-3 shrink-0"
                        >
                          <a href={item.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            {t('topCandidates.hhOpenInHh')}
                          </a>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : loading && !data ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <div className="h-10 w-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-slate-600 dark:text-zinc-400">
                {t('topCandidates.loadingAnalysis')}
              </p>
            </div>
          ) : topCandidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto space-y-4">
              <div className="p-4 rounded-3xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-8 w-8 mx-auto" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t('topCandidates.noAnalyzedTitle')}
              </h3>
              <p className="text-sm text-slate-500 dark:text-zinc-400">
                {t('topCandidates.noAnalyzedDesc')}
              </p>
              <Button
                onClick={runBatchAnalysis}
                disabled={analyzing}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {analyzing ? t('topCandidates.analyzing') : t('topCandidates.startBatchAnalysis')}
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
                                  {isFirst ? '🥇 #1' : index === 1 ? '🥈 #2' : '🥉 #3'}
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
                                {t('topCandidates.matchScore')}
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
                              <span>{t('topCandidates.mandatory')}:</span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                {candidate.mandatoryScore}%
                              </span>
                            </div>
                            <div className="flex justify-between text-slate-600 dark:text-zinc-300">
                              <span>{t('topCandidates.optional')}:</span>
                              <span className="font-semibold text-slate-700 dark:text-zinc-200">
                                {candidate.optionalScore}%
                              </span>
                            </div>
                            <div className="flex justify-between text-slate-500 dark:text-zinc-400 text-[11px] pt-1 border-t border-slate-200/60 dark:border-zinc-700">
                              <span>{t('candidateDossier.verified')}:</span>
                              <span>
                                {candidate.supportedCount} / {candidate.supportedCount + candidate.partialCount + candidate.notFoundCount + candidate.unknownCount}
                              </span>
                            </div>
                          </div>

                          {/* Strengths Tags */}
                          {candidate.strengths.length > 0 && (
                            <div className="mb-3 space-y-1.5">
                              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                                {t('topCandidates.keyStrengths')}:
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
                                {t('topCandidates.areasToVerify')}:
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
                              {candidate.currentStage === 'INTERVIEW' ? t('topCandidates.inInterview') : t('topCandidates.moveToInterview')}
                            </Button>

                            {onOpenDossier && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onOpenDossier({ id: candidate.applicationId })}
                                className="rounded-xl h-auto py-2 px-2.5 text-xs"
                                title={t('topCandidates.candidateDossierBtn')}
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
                      <span>{t('topCandidates.executiveSummary')}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-700 dark:text-zinc-200">
                      {data.comparison.executiveSummary}
                    </p>
                    <div className="pt-3 border-t border-emerald-200/50 dark:border-emerald-800/30 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                      <strong>{t('topCandidates.recommendation')}:</strong>
                      <span>{data.comparison.overallRecommendation}</span>
                    </div>
                  </div>

                  {/* Candidate Highlights List */}
                  {data.comparison.candidateHighlights && data.comparison.candidateHighlights.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                        {t('topCandidates.tabComparison')}
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
                                  {candidate?.matchScore}%
                                </Badge>
                              </div>

                              <div className="text-xs space-y-2">
                                <div>
                                  <strong className="text-emerald-700 dark:text-emerald-400 block mb-0.5">
                                    {t('topCandidates.keyStrengths')}:
                                  </strong>
                                  <p className="text-slate-600 dark:text-zinc-300 leading-normal">
                                    {item.keyStrengthsSummary}
                                  </p>
                                </div>

                                <div>
                                  <strong className="text-amber-700 dark:text-amber-400 block mb-0.5">
                                    {t('topCandidates.areasToVerify')}:
                                  </strong>
                                  <p className="text-slate-600 dark:text-zinc-300 leading-normal">
                                    {item.areasToVerify}
                                  </p>
                                </div>

                                <div className="pt-2 border-t border-slate-100 dark:border-zinc-700">
                                  <strong className="text-slate-500 dark:text-zinc-400 block mb-0.5">
                                    {t('topCandidates.interviewFocus')}:
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
                          <th className="p-3.5 w-1/3">{t('vacancies.requirementsHeading')}</th>
                          <th className="p-3.5 w-24">{t('common.status')}</th>
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
                                  {t('topCandidates.mandatory')}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                                  {t('topCandidates.optional')}
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
                                      <CheckCircle2 className="h-4 w-4" /> {t('candidateDossier.verified')}
                                    </span>
                                  ) : status === 'PARTIAL' ? (
                                    <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                                      <AlertCircle className="h-4 w-4" /> ±
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-slate-400 dark:text-zinc-500">
                                      <X className="h-4 w-4" /> —
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
                          <th className="p-3.5 w-12 text-center">{t('topCandidates.rank')}</th>
                          <th className="p-3.5">{t('candidates.tableFullName')}</th>
                          <th className="p-3.5">{t('topCandidates.matchScore')}</th>
                          <th className="p-3.5">{t('topCandidates.mandatory')}</th>
                          <th className="p-3.5">{t('dashboard.tableStage')}</th>
                          <th className="p-3.5 text-right">{t('common.actions')}</th>
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
                              <span className="text-[11px] text-slate-400">{c.candidateEmail || '—'}</span>
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
                                {c.currentStage === 'INTERVIEW' ? t('topCandidates.inInterview') : t('topCandidates.moveToInterview')}
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
            * NIST AI RMF
          </p>
          <Button variant="outline" size="sm" onClick={onClose} className="rounded-xl">
            {t('common.close')}
          </Button>
        </div>
      </div>
    </div>
  );
}
