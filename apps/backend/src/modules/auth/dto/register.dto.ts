import { z } from 'zod';
import { email, password } from '../../../common/pipes/validation';

const text = (max: number) => z.string().trim().min(1).max(max);

export const registerSchema = z
  .object({
    companyName: text(160),
    fullName: text(160),
    email,
    password,
  })
  .strict();

export type RegisterDto = z.infer<typeof registerSchema>;
