import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map((i) => `${i.path.join('.') || 'Input'}: ${i.message}`),
    );
  return result.data;
}

const text = (max: number) => z.string().trim().min(1).max(max);

export const email = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());

export const password = z
  .string()
  .min(12)
  .max(72)
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes');

export const registration = z
  .object({ companyName: text(160), fullName: text(160), email, password })
  .strict();

export const login = z.object({ email, password: z.string().min(1).max(72) }).strict();

export const acceptInvite = z
  .object({ token: z.string().regex(/^[a-f0-9]{64}$/), fullName: text(160), password })
  .strict();

export const invitation = z.object({ email, role: z.enum(['HR', 'RECRUITER']) }).strict();

export const requirement = z
  .object({
    name: text(200),
    description: z.string().trim().max(2000).nullable().optional(),
    required: z.boolean().default(true),
  })
  .strict();

export const vacancy = z
  .object({
    title: text(200),
    description: text(15000),
    status: z.enum(['DRAFT', 'ACTIVE', 'CLOSED']).default('ACTIVE'),
    requirements: z.array(requirement).max(40).default([]),
  })
  .strict();

export const candidate = z
  .object({
    fullName: text(160),
    email: z
      .union([email, z.literal('')])
      .nullable()
      .optional()
      .transform((v) => v || null),
    phone: z
      .string()
      .trim()
      .max(50)
      .nullable()
      .optional()
      .transform((v) => v || null),
  })
  .strict();

export const application = z
  .object({ vacancyId: z.number().int().positive(), candidateId: z.number().int().positive() })
  .strict();

export const pipeline = z
  .object({
    status: z.enum(['NEW', 'REVIEWING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED']),
    expectedStatus: z
      .enum(['NEW', 'REVIEWING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'])
      .optional(),
  })
  .strict();

export const interviewReview = z
  .object({
    revision: z.number().int().nonnegative(),
    notes: z.string().trim().max(10000),
    answers: z
      .array(
        z
          .object({
            question: text(3000),
            answer: z.string().trim().max(10000),
            notes: z.string().trim().max(5000),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().max(100).default(''),
});

export const consent = z.object({ consent: z.literal(true) }).strict();

export const vacancyBrief = z
  .object({
    brief: text(3000).min(5),
    language: z.enum(['uz', 'en', 'ru']).default('uz'),
  })
  .strict();
