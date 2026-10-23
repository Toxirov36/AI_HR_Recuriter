import { z } from 'zod';
import { passwordResetConfirm, passwordResetRequest } from '../../../common/pipes/validation';

export const passwordResetRequestSchema = passwordResetRequest;
export type PasswordResetRequestDto = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = passwordResetConfirm;
export type PasswordResetConfirmDto = z.infer<typeof passwordResetConfirmSchema>;
