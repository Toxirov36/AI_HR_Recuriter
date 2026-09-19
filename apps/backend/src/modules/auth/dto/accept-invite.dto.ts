import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);

export const acceptInviteSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
    fullName: text(160),
    password: z
      .string()
      .min(12)
      .max(72)
      .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes'),
  })
  .strict();

export type AcceptInviteDto = z.infer<typeof acceptInviteSchema>;
