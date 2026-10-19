import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalMeta = (max: number) => z.string().trim().max(max).nullable().optional().transform((value) => value === '' ? null : value);

export const requirementSchema = z
  .object({
    name: text(200),
    description: z.string().trim().max(2000).nullable().optional(),
    required: z.boolean().default(true),
  })
  .strict();

export type RequirementDto = z.infer<typeof requirementSchema>;

export const vacancySchema = z
  .object({
    title: text(200),
    description: text(15000),
    status: z.enum(['DRAFT', 'ACTIVE', 'CLOSED']).default('ACTIVE'),
    department: optionalMeta(100),
    location: optionalMeta(100),
    workModel: optionalMeta(50),
    employmentType: optionalMeta(50),
    seniority: optionalMeta(50),
    confirmMetadataReview: z.boolean().optional(),
    requirements: z.array(requirementSchema).max(40).default([]),
    hhAreaId: z.string().trim().max(40).nullable().optional(),
    hhProfessionalRoleId: z.string().trim().max(40).nullable().optional(),
    hhExperienceId: z.string().trim().max(40).nullable().optional(),
    hhEmploymentId: z.string().trim().max(40).nullable().optional(),
    hhScheduleId: z.string().trim().max(40).nullable().optional(),
  })
  .strict();

export type VacancyDto = z.infer<typeof vacancySchema>;
export type CreateVacancyDto = VacancyDto;
export type UpdateVacancyDto = VacancyDto;
