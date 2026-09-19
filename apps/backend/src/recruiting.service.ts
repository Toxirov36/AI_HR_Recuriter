import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from './generated/prisma/client';
import { Database } from './database';
import { z } from 'zod';
import { candidate, vacancy, pipeline, interviewReview } from './validation';
export const candidateSelect = {
  id: true,
  companyId: true,
  fullName: true,
  email: true,
  phone: true,
  resumeName: true,
  resumeText: true,
  resumeRevision: true,
  skills: true,
  experience: true,
  education: true,
  languages: true,
  parsedResume: true,
  createdAt: true,
  updatedAt: true,
} as const;
export const candidateListSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  resumeName: true,
  createdAt: true,
  _count: { select: { applications: true } },
} as const;
@Injectable()
export class RecruitingService {
  constructor(@Inject(Database) readonly db: Database) {}
  async vacancy(companyId: number, id: number) {
    const found = await this.db.vacancy.findFirst({
      where: { id, companyId },
      include: { requirements: { orderBy: { id: 'asc' } } },
    });
    if (!found) throw new NotFoundException('Vacancy not found');
    return found;
  }
  async candidate(companyId: number, id: number) {
    const found = await this.db.candidate.findFirst({
      where: { id, companyId },
      select: candidateSelect,
    });
    if (!found) throw new NotFoundException('Candidate not found');
    return found;
  }
  async application(companyId: number, id: number) {
    const found = await this.db.application.findFirst({
      where: { id, companyId },
      include: {
        stageHistory: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
        vacancy: { include: { requirements: true } },
        candidate: { select: candidateSelect },
      },
    });
    if (!found) throw new NotFoundException('Application not found');
    return found;
  }
  async changeStage(
    companyId: number,
    id: number,
    actor: { id: number; fullName: string },
    data: z.infer<typeof pipeline>,
  ) {
    return this.db.$transaction(async (tx) => {
      const current = await tx.application.findFirst({ where: { id, companyId } });
      if (!current) throw new NotFoundException('Application not found');
      if (data.expectedStatus && data.expectedStatus !== current.status)
        throw new ConflictException(
          'The stage was changed by another reviewer. Refresh and try again.',
        );
      if (data.status === current.status) return current;
      const changed = await tx.application.updateMany({
        where: { id, companyId, status: current.status },
        data: { status: data.status },
      });
      if (!changed.count)
        throw new ConflictException('The stage changed during your update. Refresh and try again.');
      await tx.applicationStageChange.create({
        data: {
          applicationId: id,
          fromStatus: current.status,
          toStatus: data.status,
          actorId: actor.id,
          actorName: actor.fullName,
        },
      });
      return { ...current, status: data.status };
    });
  }
  async saveInterviewReview(
    companyId: number,
    id: number,
    actor: { id: number; fullName: string },
    data: z.infer<typeof interviewReview>,
  ) {
    await this.application(companyId, id);
    const review = {
      answers: data.answers,
      notes: data.notes,
      updatedBy: actor.fullName,
      updatedById: actor.id,
      updatedAt: new Date().toISOString(),
    };
    const changed = await this.db.application.updateMany({
      where: { id, companyId, reviewRevision: data.revision },
      data: { interviewReview: review, reviewRevision: { increment: 1 } },
    });
    if (!changed.count)
      throw new ConflictException(
        'Interview notes were changed by another reviewer. Copy your draft, then reload before saving.',
      );
    return { interviewReview: review, reviewRevision: data.revision + 1 };
  }
  async saveVacancy(companyId: number, id: number | null, data: z.infer<typeof vacancy>) {
    const { requirements, ...fields } = data;
    if (id === null)
      return this.db.vacancy.create({
        data: { ...fields, companyId, requirements: { create: requirements } },
        include: { requirements: true },
      });
    await this.vacancy(companyId, id);
    return this.db.$transaction(async (tx) => {
      const saved = await tx.vacancy.update({
        where: { id_companyId: { id, companyId } },
        data: {
          ...fields,
          revision: { increment: 1 },
          requirements: { deleteMany: {}, create: requirements },
        },
        include: { requirements: true },
      });
      await tx.application.updateMany({
        where: { companyId, vacancyId: id },
        data: {
          analysis: Prisma.DbNull,
          interviewQuestions: Prisma.DbNull,
          analyzedResumeRevision: null,
          analyzedVacancyRevision: null,
        },
      });
      return saved;
    });
  }
  async saveCandidate(companyId: number, id: number | null, data: z.infer<typeof candidate>) {
    if (id === null)
      return this.db.candidate.create({ data: { ...data, companyId }, select: candidateSelect });
    await this.candidate(companyId, id);
    return this.db.candidate.update({
      where: { id_companyId: { id, companyId } },
      data,
      select: candidateSelect,
    });
  }
}
