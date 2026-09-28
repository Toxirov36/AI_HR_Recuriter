export type User = {
  id: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: string;
  isActive?: boolean;
  platformRole?: 'SUPER_ADMIN' | null;
  companyId: number;
  company: { name: string };
  aiConfigured: boolean;
};
export type Requirement = {
  id?: number;
  name: string;
  description?: string | null;
  required: boolean;
};
export type Vacancy = {
  id: number;
  publicToken?: string;
  title: string;
  description: string;
  status: string;
  requirements: Requirement[];
  createdAt: string;
  _count?: { applications: number };
};
export type ParsedResume = {
  summary: string;
  skills: string[];
  experience: {
    title: string | null;
    company: string | null;
    period: string | null;
    description: string;
  }[];
  education: { institution: string | null; qualification: string | null; period: string | null }[];
  languages: string[];
};
export type Candidate = {
  id: number;
  mergedIntoId?: number | null;
  mergedCandidates?: Array<{ id: number; fullName: string; source: string; resumeName: string | null }>;
  publicSubmittedAt?: string | null;
  aiConsentAt?: string | null;
  fullName: string;
  email: string | null;
  phone?: string | null;
  source?: 'WEBSITE' | 'TELEGRAM' | 'MANUAL' | 'REFERRAL';
  telegramUserId?: string | null;
  telegramUsername?: string | null;
  resumeName?: string | null;
  resumeText?: string | null;
  parsedResume?: ParsedResume | null;
  resumes?: Array<{
    id: number;
    fileName: string;
    mimeType?: string | null;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    error?: string | null;
    createdAt: string;
  }>;
  events?: Array<{ id: number; type: string; label: string; createdAt: string }>;
  createdAt: string;
  _count?: { applications: number };
};
export const stages = ['NEW', 'REVIEWING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'] as const;
export type Stage = (typeof stages)[number];
export const nextStage: Partial<Record<Stage, Stage>> = {
  NEW: 'REVIEWING',
  REVIEWING: 'INTERVIEW',
  INTERVIEW: 'OFFER',
  OFFER: 'HIRED',
};
export type ScorecardCriterion = {
  id: string;
  name: string;
  category: 'TECHNICAL' | 'CORE' | 'CUSTOM';
  score: number | null;
  evidence: string;
};

export type ScorecardDecision =
  | 'STRONG_HIRE'
  | 'HIRE'
  | 'NO_HIRE'
  | 'STRONG_NO_HIRE'
  | 'UNDECIDED';

export type StructuredScorecard = {
  criteria: ScorecardCriterion[];
  finalDecision: ScorecardDecision;
  decisionNotes?: string;
  decidedBy?: string;
  decidedAt?: string;
  averageScore?: number;
};

export type InterviewReview = {
  answers: { question: string; answer: string; notes: string }[];
  notes: string;
  scorecard?: StructuredScorecard;
  updatedBy: string;
  updatedAt: string;
};

export type Evidence = {
  requirementId: number;
  status: 'SUPPORTED' | 'PARTIAL' | 'NOT_FOUND' | 'UNKNOWN';
  explanation: string;
  quotes: string[];
};
export type Application = {
  id: number;
  candidateId: number;
  vacancyId: number;
  candidate: Candidate;
  vacancy: Vacancy;
  status: Stage;
  reviewRevision: number;
  interviewReview: InterviewReview | null;
  stageHistory: {
    id: number;
    fromStatus: Stage | null;
    toStatus: Stage;
    actorName: string;
    createdAt: string;
  }[];
  createdAt: string;
  analysis: { requirements: Evidence[] } | null;
  interviewQuestions: {
    questions: { question: string; rationale: string; requirementId: number | null }[];
  } | null;
};
export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
export type DashboardData = {
  vacancies: number;
  candidates: number;
  applications: number;
  stages: { status: Stage; _count: number }[];
  recent: Application[];
};
