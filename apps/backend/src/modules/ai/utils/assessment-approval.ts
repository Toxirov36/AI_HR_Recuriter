import { vacancyAssessmentSchema, type VacancyAssessment } from '../schemas/assessment.schema';

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
