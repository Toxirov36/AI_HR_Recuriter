import { z } from 'zod';

export const assessmentQuestionSchema = z.object({
  id: z.number().int().min(1).max(10),
  type: z.enum(['HARD_SKILL', 'SOFT_SKILL']),
  question: z.string().min(5),
  options: z.array(z.string().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(5),
});

type QuestionList = z.infer<typeof assessmentQuestionSchema>[];

function checkQuestionOrder(questions: QuestionList, context: z.RefinementCtx) {
  questions.forEach((question, index) => {
    if (question.id !== index + 1 || question.type !== (index < 5 ? 'HARD_SKILL' : 'SOFT_SKILL')) {
      context.addIssue({ code: 'custom', message: 'Questions must have IDs 1–10 with five hard and five soft skill questions' });
    }
  });
}

export const vacancyAssessmentSchema = z.object({
  questions: z.array(assessmentQuestionSchema).min(10).max(10),
}).superRefine(({ questions }, context) => checkQuestionOrder(questions, context));

/** Open questions written by HR; candidates answer them in writing after the multiple-choice test. */
export const customQuestionsSchema = z.array(z.string().trim().min(5).max(500)).max(5);

/** HR's switch for the AI chat interview and an optional hint about what the AI should dig into. */
export const aiInterviewSettingSchema = z.object({
  enabled: z.boolean().default(false),
  focus: z.string().trim().max(500).default(''),
});

/** What HR submits when editing the test: the ten AI questions plus up to five own open questions. */
export const assessmentEditSchema = z.object({
  questions: z.array(assessmentQuestionSchema).min(10).max(10),
  customQuestions: customQuestionsSchema.default([]),
  aiInterview: aiInterviewSettingSchema.default({ enabled: false, focus: '' }),
}).superRefine(({ questions }, context) => checkQuestionOrder(questions, context));

export type AssessmentEdit = z.infer<typeof assessmentEditSchema>;

export type AssessmentQuestion = z.infer<typeof assessmentQuestionSchema>;
export type VacancyAssessment = z.infer<typeof vacancyAssessmentSchema>;

export interface CandidateAssessmentAnswer {
  questionId: number;
  selectedIndex: number;
  correctIndex: number;
  isCorrect: boolean;
  type: 'HARD_SKILL' | 'SOFT_SKILL';
}

export interface CandidateAssessmentResult {
  score: number; // 0 - 100 percentage
  passed: boolean; // score >= 70
  totalQuestions: number; // 10
  correctCount: number;
  hardSkillScore: number; // percentage
  softSkillScore: number; // percentage
  answers: CandidateAssessmentAnswer[];
  completedAt: string;
}
