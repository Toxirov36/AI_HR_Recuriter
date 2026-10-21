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

// Candidate contact numbers are still supported; authentication requires email.
export const phone = z
  .string()
  .trim()
  .max(30)
  .transform((value) => {
    const compact = value.replace(/[\s().-]/g, '');
    if (/^\d{9}$/.test(compact)) return `+998${compact}`;
    if (/^998\d{9}$/.test(compact)) return `+${compact}`;
    return compact;
  })
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Enter a valid international phone number'));

export const password = z
  .string()
  .min(8)
  .max(72)
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes');

export const registration = z
  .object({ companyName: text(160), fullName: text(160), email, password })
  .strict();

export const login = z.object({ email, password: z.string().min(1).max(72) }).strict();

export const acceptInvite = z
  .object({ token: z.string().regex(/^[a-f0-9]{64}$/), fullName: text(160), password })
  .strict();

export const invitation = z
  .object({ email, role: z.enum(['HR', 'RECRUITER', 'INTERVIEWER']) })
  .strict();

export const updateProfile = z
  .object({
    fullName: text(160),
    companyName: text(160).optional(),
  })
  .strict();

export const updatePassword = z
  .object({
    password,
  })
  .strict();

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
    department: z.string().trim().max(100).nullable().optional().transform((value) => value === '' ? null : value),
    fieldId: z.number().int().positive().nullable().optional(),
    location: z.string().trim().max(100).nullable().optional().transform((value) => value === '' ? null : value),
    workModel: z.string().trim().max(50).nullable().optional().transform((value) => value === '' ? null : value),
    employmentType: z.string().trim().max(50).nullable().optional().transform((value) => value === '' ? null : value),
    seniority: z.string().trim().max(50).nullable().optional().transform((value) => value === '' ? null : value),
    confirmMetadataReview: z.boolean().optional(),
    requirements: z.array(requirement).max(40).default([]),
    hhAreaId: z.string().trim().max(40).nullable().optional(),
    hhProfessionalRoleId: z.string().trim().max(40).nullable().optional(),
    hhExperienceId: z.string().trim().max(40).nullable().optional(),
    hhEmploymentId: z.string().trim().max(40).nullable().optional(),
    hhScheduleId: z.string().trim().max(40).nullable().optional(),
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

export const scorecardCriterion = z
  .object({
    id: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(200),
    category: z.enum(['TECHNICAL', 'CORE', 'CUSTOM']).default('CORE'),
    score: z.number().int().min(1).max(5).nullable().optional(),
    evidence: z.string().trim().max(5000).default(''),
  })
  .strict()
  .refine(
    (data) => {
      if (data.score !== null && data.score !== undefined && data.score >= 1) {
        return data.evidence.length >= 3;
      }
      return true;
    },
    {
      message: "Ball qo'yilganda dalil yoki izoh yozilishi majburiy",
      path: ['evidence'],
    },
  );

export const scorecard = z
  .object({
    criteria: z.array(scorecardCriterion).max(50),
    finalDecision: z
      .enum(['STRONG_HIRE', 'HIRE', 'NO_HIRE', 'STRONG_NO_HIRE', 'UNDECIDED'])
      .default('UNDECIDED'),
    decisionNotes: z.string().trim().max(5000).optional().default(''),
    decidedBy: z.string().trim().max(200).optional(),
    decidedAt: z.string().optional(),
    averageScore: z.number().min(0).max(5).optional(),
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
    scorecard: scorecard.optional(),
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
    language: z.enum(['uz', 'en', 'ru', 'tg']).default('uz'),
  })
  .strict();
