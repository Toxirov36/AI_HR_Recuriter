import { z } from 'zod';

export const vacancyDraftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(15000),
  requirements: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        description: z.string().trim().max(2000),
        required: z.boolean(),
      }),
    )
    .min(1)
    .max(15),
});
