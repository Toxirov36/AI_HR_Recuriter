import { z } from 'zod';
import { updateProfile, updatePassword } from '../../../common/pipes/validation';

export const updateProfileSchema = updateProfile;
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

export const updatePasswordSchema = updatePassword;
export type UpdatePasswordDto = z.infer<typeof updatePasswordSchema>;
