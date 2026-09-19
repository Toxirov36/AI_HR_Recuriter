import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);

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
  })
  .strict();

export type InterviewReviewDto = z.infer<typeof interviewReviewSchema>;
