import { z } from 'zod';

export const vacancyFieldSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    sortOrder: z.number().int().min(0).max(1000).default(0),
    isActive: z.boolean().default(true),
  })
  .strict();

export type VacancyFieldDto = z.infer<typeof vacancyFieldSchema>;
