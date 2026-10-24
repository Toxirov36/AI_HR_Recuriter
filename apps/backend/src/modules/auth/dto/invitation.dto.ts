import { z } from 'zod';
import { email } from '../../../common/pipes/validation';

export const invitationSchema = z
  .object({
    email,
    // Every invited member is an HR; a role sent by an older page is accepted and ignored.
    role: z.enum(['HR', 'RECRUITER', 'INTERVIEWER']).optional().transform(() => 'HR' as const),
  })
  .strict();

export type InvitationDto = z.infer<typeof invitationSchema>;
