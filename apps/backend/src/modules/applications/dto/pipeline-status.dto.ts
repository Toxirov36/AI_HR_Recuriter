import { z } from 'zod';

export const pipelineSchema = z
  .object({
    status: z.enum(['NEW', 'REVIEWING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED']),
    expectedStatus: z
      .enum(['NEW', 'REVIEWING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'])
      .optional(),
  })
  .strict();

export type UpdatePipelineStatusDto = z.infer<typeof pipelineSchema>;
