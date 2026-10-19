import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().max(100).default(''),
  stage: z.enum(['NEW', 'REVIEWING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED']).optional(),
  vacancyId: z.coerce.number().int().positive().optional(),
  sort: z.enum(['newest', 'oldest', 'candidate']).default('newest'),
});

export type QueryApplicationDto = z.infer<typeof paginationSchema>;
