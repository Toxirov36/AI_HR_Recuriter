import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);

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
