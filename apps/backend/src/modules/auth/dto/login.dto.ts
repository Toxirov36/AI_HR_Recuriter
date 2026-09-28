import { z } from 'zod';
import { login } from '../../../common/pipes/validation';

export const loginSchema = login;

export type LoginDto = z.infer<typeof loginSchema>;
