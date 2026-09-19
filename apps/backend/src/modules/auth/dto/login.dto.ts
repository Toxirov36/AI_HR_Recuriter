import { z } from 'zod';
import { email } from '../../../common/pipes/validation';

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(72),
  })
  .strict();

export type LoginDto = z.infer<typeof loginSchema>;
