import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);

export const vacancyBriefSchema = z
  .object({
    brief: text(3000).min(5),
    language: z.enum(['uz', 'en', 'ru']).default('uz'),
  })
  .strict();

export type VacancyBriefDto = z.infer<typeof vacancyBriefSchema>;
