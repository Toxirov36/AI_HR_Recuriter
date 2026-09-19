import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { z } from 'zod';
import { application, pipeline, interviewReview } from '../../common/pipes/validation';
import { candidateSelect } from '../candidates/candidates.service';

@Injectable()
export class ApplicationsService {
  constructor(@Inject(Database) readonly db: Database) {}

  async list(companyId: number, page: number, search: string) {
    const where = {
      companyId,
      candidate: { fullName: { contains: search, mode: 'insensitive' as const } },
    };
    const [items, total] = await this.db.$transaction([
      this.db.application.findMany({
        where,
        include: {
          candidate: { select: { id: true, fullName: true, email: true } },
          vacancy: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 20,
        take: 20,
      }),
      this.db.application.count({ where }),
    ]);
    return { items, total, page, pageSize: 20 };
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

  async createApplication(
    companyId: number,
    actor: { id: number; fullName: string },
    data: z.infer<typeof application>,
  ) {
    const [foundVacancy, foundCandidate] = await Promise.all([
      this.db.vacancy.findFirst({ where: { id: data.vacancyId, companyId } }),
      this.db.candidate.findFirst({ where: { id: data.candidateId, companyId } }),
    ]);
    if (!foundVacancy) throw new NotFoundException('Vacancy not found');
    if (!foundCandidate) throw new NotFoundException('Candidate not found');

    return this.db.application.create({
      data: {
        ...data,
        companyId,
        stageHistory: {
          create: { toStatus: 'NEW', actorId: actor.id, actorName: actor.fullName },
        },
      },
    });
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

  async deleteApplication(companyId: number, id: number) {
    await this.application(companyId, id);
    await this.db.application.delete({ where: { id, companyId } });
    return { ok: true };
  }
}
