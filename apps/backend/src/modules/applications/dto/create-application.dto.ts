import { z } from 'zod';

export const applicationSchema = z
  .object({
    vacancyId: z.number().int().positive(),
    candidateId: z.number().int().positive(),
  })
  .strict();

export type CreateApplicationDto = z.infer<typeof applicationSchema>;
