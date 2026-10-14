import { z } from 'zod';

export const audioTranscriptionSchema = z.object({
  language: z.enum(['uz', 'ru', 'en', 'tg']).default('uz'),
});

export type AudioTranscriptionDto = z.infer<typeof audioTranscriptionSchema>;
