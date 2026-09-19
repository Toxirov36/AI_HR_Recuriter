import { z } from 'zod';
import { email } from '../../../common/pipes/validation';

const text = (max: number) => z.string().trim().min(1).max(max);

export const candidateSchema = z
  .object({
    fullName: text(160),
    email: z
      .union([email, z.literal('')])
      .nullable()
      .optional()
      .transform((v) => v || null),
    phone: z
      .string()
      .trim()
      .max(50)
      .nullable()
      .optional()
      .transform((v) => v || null),
  })
  .strict();

export type CandidateDto = z.infer<typeof candidateSchema>;
export type CreateCandidateDto = CandidateDto;
export type UpdateCandidateDto = CandidateDto;
