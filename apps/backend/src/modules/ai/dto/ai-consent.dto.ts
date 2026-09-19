import { z } from 'zod';

export const consentSchema = z.object({ consent: z.literal(true) }).strict();

export type AiConsentDto = z.infer<typeof consentSchema>;
