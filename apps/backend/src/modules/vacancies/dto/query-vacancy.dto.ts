import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().max(100).default(''),
});

export type QueryVacancyDto = z.infer<typeof paginationSchema>;
