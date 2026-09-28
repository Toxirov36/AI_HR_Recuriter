import { z } from 'zod';
import { registration } from '../../../common/pipes/validation';

export const registerSchema = registration;

export type RegisterDto = z.infer<typeof registerSchema>;
