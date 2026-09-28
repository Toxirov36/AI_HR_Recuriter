import { z } from 'zod';

export const mfaEnableSchema = z
  .object({
    code: z.string().trim().min(6).max(9), // 6 digits or recovery code
  })
  .strict();

export type MfaEnableDto = z.infer<typeof mfaEnableSchema>;

export const mfaVerifySchema = z
  .object({
    challengeToken: z.string().trim().min(10),
    code: z.string().trim().min(6).max(16),
  })
  .strict();

export type MfaVerifyDto = z.infer<typeof mfaVerifySchema>;

export const mfaDisableSchema = z
  .object({
    password: z.string().min(1),
  })
  .strict();

export type MfaDisableDto = z.infer<typeof mfaDisableSchema>;
