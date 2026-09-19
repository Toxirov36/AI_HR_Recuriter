import { z } from 'zod';

export const resumeSchema = z.object({
  summary: z.string(),
  skills: z.array(z.string()),
  experience: z.array(
    z.object({
      title: z.string().nullable(),
      company: z.string().nullable(),
      period: z.string().nullable(),
      description: z.string(),
    }),
  ),
  education: z.array(
    z.object({
      institution: z.string().nullable(),
      qualification: z.string().nullable(),
      period: z.string().nullable(),
    }),
  ),
  languages: z.array(z.string()),
});
