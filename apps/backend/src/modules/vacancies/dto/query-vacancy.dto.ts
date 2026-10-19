import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().max(100).default(''),
  status: z.enum(['DRAFT', 'ACTIVE', 'CLOSED']).optional(),
  sort: z.enum(['newest', 'oldest', 'title']).default('newest'),
});

export type QueryVacancyDto = z.infer<typeof paginationSchema>;
