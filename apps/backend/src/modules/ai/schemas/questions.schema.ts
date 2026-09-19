import { z } from 'zod';

export const questionsSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      rationale: z.string(),
      requirementId: z.number().int().nullable(),
    }),
  ),
});
