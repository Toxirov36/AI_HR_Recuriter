import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);

export const scorecardCriterionDtoSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(200),
    category: z.enum(['TECHNICAL', 'CORE', 'CUSTOM']).default('CORE'),
    score: z.number().int().min(1).max(5).nullable().optional(),
    evidence: z.string().trim().max(5000).default(''),
  })
  .strict()
  .refine(
    (data) => {
      if (data.score !== null && data.score !== undefined && data.score >= 1) {
        return data.evidence.length >= 3;
      }
      return true;
    },
    {
      message: "Ball qo'yilganda dalil yoki izoh yozilishi majburiy",
      path: ['evidence'],
    },
  );

export const scorecardDtoSchema = z
  .object({
    criteria: z.array(scorecardCriterionDtoSchema).max(50),
    finalDecision: z
      .enum(['STRONG_HIRE', 'HIRE', 'NO_HIRE', 'STRONG_NO_HIRE', 'UNDECIDED'])
      .default('UNDECIDED'),
    decisionNotes: z.string().trim().max(5000).optional().default(''),
    decidedBy: z.string().trim().max(200).optional(),
    decidedAt: z.string().optional(),
    averageScore: z.number().min(0).max(5).optional(),
  })
  .strict();

export const interviewReviewSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    notes: z.string().trim().max(10000),
    answers: z
      .array(
        z
          .object({
            question: text(3000),
            answer: z.string().trim().max(10000),
            notes: z.string().trim().max(5000),
          })
          .strict(),
      )
      .max(50),
    scorecard: scorecardDtoSchema.optional(),
  })
  .strict();

export type InterviewReviewDto = z.infer<typeof interviewReviewSchema>;
export type ScorecardDto = z.infer<typeof scorecardDtoSchema>;
export type ScorecardCriterionDto = z.infer<typeof scorecardCriterionDtoSchema>;

