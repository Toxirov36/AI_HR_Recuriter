import { customQuestionsSchema, vacancyAssessmentSchema, type VacancyAssessment } from '../schemas/assessment.schema';

export type AssessmentState = 'NONE' | 'STALE' | 'PENDING' | 'APPROVED';

type AssessmentFields = {
  revision: number;
  assessmentQuestions?: unknown;
  assessmentRevision?: number | null;
  assessmentApprovedAt?: Date | null;
};

/** NONE: nothing generated; STALE: generated for an older vacancy revision; PENDING: waits for HR; APPROVED: usable by the bot. */
export function assessmentState(vacancy: AssessmentFields): AssessmentState {
  if (!vacancy.assessmentQuestions) return 'NONE';
  if (vacancy.assessmentRevision !== vacancy.revision) return 'STALE';
  return vacancy.assessmentApprovedAt ? 'APPROVED' : 'PENDING';
}

/** The questions candidates may be given: only those HR approved for the current vacancy revision. */
export function approvedAssessment(vacancy: AssessmentFields): VacancyAssessment | null {
  if (assessmentState(vacancy) !== 'APPROVED') return null;
  const parsed = vacancyAssessmentSchema.safeParse(vacancy.assessmentQuestions);
  return parsed.success ? parsed.data : null;
}

/** HR's own open questions as stored on the vacancy (empty when none or malformed). */
export function customQuestionsOf(value: unknown): string[] {
  const parsed = customQuestionsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** The written questions candidates get: only those HR approved together with the test. */
export function approvedWrittenQuestions(vacancy: AssessmentFields & { customQuestions?: unknown }): string[] {
  return assessmentState(vacancy) === 'APPROVED' ? customQuestionsOf(vacancy.customQuestions) : [];
}

/** The AI chat interview HR switched on; like the written questions it only counts once the test is approved. */
export function approvedInterview(vacancy: AssessmentFields & { aiInterviewEnabled?: boolean | null; interviewFocus?: string | null }): { enabled: boolean; focus: string | null } {
  const enabled = Boolean(vacancy.aiInterviewEnabled) && assessmentState(vacancy) === 'APPROVED';
  return { enabled, focus: enabled ? vacancy.interviewFocus?.trim() || null : null };
}
