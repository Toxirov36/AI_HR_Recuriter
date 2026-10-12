import { z } from 'zod';
export const googleCredentialSchema = z
  .object({ credential: z.string().min(1).max(16000) })
  .strict();
export type GoogleCredentialDto = z.infer<typeof googleCredentialSchema>;
export const googleRegisterSchema = z
  .object({
    signupToken: z.string().regex(/^[a-f0-9]{64}$/),
    companyName: z.string().trim().min(1).max(160),
    fullName: z.string().trim().min(1).max(160),
  })
  .strict();
export type GoogleRegisterDto = z.infer<typeof googleRegisterSchema>;
