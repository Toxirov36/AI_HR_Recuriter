export type Role = 'ADMIN' | 'HR' | 'RECRUITER' | 'INTERVIEWER';

export type PipelineStage = 'NEW' | 'REVIEWING' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED';

export type User = {
  id: number;
  companyId: number;
  role: Role;
  fullName: string;
  email: string | null;
  phone: string | null;
};

export type Requirement = {
  id?: number;
  name: string;
  description?: string | null;
  required: boolean;
};

export type Vacancy = {
  id: number;
  companyId: number;
  title: string;
  description: string;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  revision: number;
  requirements: Requirement[];
  createdAt: string;
  updatedAt: string;
};

export type Candidate = {
  id: number;
  companyId: number;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  resumeName?: string | null;
  resumeText?: string | null;
  resumeRevision: number;
  skills?: string[] | null;
  experience?: unknown;
  education?: unknown;
  languages?: string[] | null;
  createdAt: string;
  updatedAt: string;
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

export type Application = {
  id: number;
  companyId: number;
  vacancyId: number;
  candidateId: number;
  status: PipelineStage;
  reviewRevision: number;
  analysis?: unknown;
  interviewQuestions?: unknown;
  interviewReview?: InterviewReview | null;
  createdAt: string;
  updatedAt: string;
};
