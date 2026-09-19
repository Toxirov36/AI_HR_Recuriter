export type Role = 'ADMIN' | 'HR' | 'RECRUITER';

export type PipelineStage = 'NEW' | 'REVIEWING' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED';

export type User = {
  id: number;
  companyId: number;
  role: Role;
  fullName: string;
  email: string;
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

export type Application = {
  id: number;
  companyId: number;
  vacancyId: number;
  candidateId: number;
  status: PipelineStage;
  reviewRevision: number;
  analysis?: unknown;
  interviewQuestions?: unknown;
  interviewReview?: unknown;
  createdAt: string;
  updatedAt: string;
};
