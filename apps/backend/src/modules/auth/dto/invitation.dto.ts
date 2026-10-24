import type { z } from 'zod';
import { invitation } from '../../../common/pipes/validation';

// One definition: every invited member is an HR, and a role sent by an older page is accepted and ignored.
export const invitationSchema = invitation;

export type InvitationDto = z.infer<typeof invitationSchema>;
