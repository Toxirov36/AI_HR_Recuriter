import { z } from 'zod';
import { email } from '../../../common/pipes/validation';

export const invitationSchema = z
  .object({
    email,
    role: z.enum(['HR', 'RECRUITER']),
  })
  .strict();

export type InvitationDto = z.infer<typeof invitationSchema>;
