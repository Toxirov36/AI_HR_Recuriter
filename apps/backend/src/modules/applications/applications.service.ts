import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { z } from 'zod';
import { application, pipeline, interviewReview } from '../../common/pipes/validation';
import { candidateSelect } from '../candidates/candidates.service';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class ApplicationsService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  async list(companyId: number, page: number, search: string) {
    const where = {
      companyId,
      OR: [
        { candidate: { fullName: { contains: search, mode: 'insensitive' as const } } },
        { candidate: { email: { contains: search, mode: 'insensitive' as const } } },
        { candidate: { phone: { contains: search, mode: 'insensitive' as const } } },
        { vacancy: { title: { contains: search, mode: 'insensitive' as const } } },
      ],
    };
    const [items, total] = await Promise.all([
      this.db.application.findMany({
        where,
        include: {
          candidate: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              source: true,
            },
          },
          vacancy: { select: { id: true, title: true } },
          stageHistory: {
            select: {
              id: true,
              fromStatus: true,
              toStatus: true,
              actorName: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
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
        candidate: { select: candidateSelect },
        vacancy: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            requirements: {
              select: { id: true, name: true, description: true, required: true },
            },
          },
        },
        stageHistory: {
          select: { id: true, fromStatus: true, toStatus: true, actorName: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
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
    const created = await this.db.$transaction(async (tx) => {
      const [candidate, vacancy] = await Promise.all([
        tx.candidate.findFirst({ where: { id: data.candidateId, companyId }, select: { id: true } }),
        tx.vacancy.findFirst({ where: { id: data.vacancyId, companyId }, select: { id: true } }),
      ]);
      if (!candidate || !vacancy) throw new NotFoundException('Candidate or vacancy not found');
      const app = await tx.application.create({
        data: {
          companyId,
          candidateId: data.candidateId,
          vacancyId: data.vacancyId,
          status: 'NEW',
        },
        include: {
          candidate: true,
          vacancy: true,
        },
      });
      await tx.applicationStageChange.create({
        data: {
          applicationId: app.id,
          toStatus: 'NEW',
          actorId: actor.id,
          actorName: actor.fullName,
        },
      });
      return app;
    });

    void this.notifications.notifyRecruitersNewApplication({
      applicationId: created.id,
      candidate: created.candidate,
      vacancy: created.vacancy,
      companyId,
      source: 'HR tizimi (Ichki)',
    });

    return created;
  }

  async changeStage(
    companyId: number,
    id: number,
    actor: { id: number; fullName: string },
    data: z.infer<typeof pipeline>,
  ) {
    const current = await this.db.application.findFirst({
      where: { id, companyId },
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            email: true,
            telegramUserId: true,
            companyId: true,
          },
        },
        vacancy: { select: { id: true, title: true } },
        company: { select: { name: true } },
      },
    });
    if (!current) throw new NotFoundException('Application not found');
    if (data.expectedStatus && data.expectedStatus !== current.status)
      throw new ConflictException(
        'The stage was changed by another reviewer. Refresh and try again.',
      );
    if (data.status === current.status) return current;

    await this.db.$transaction(async (tx) => {
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
    });

    const updated = { ...current, status: data.status };

    // Automated candidate notification on stage transitions
    if (data.status === 'INTERVIEW') {
      void this.notifications.sendInterviewInvitation({
        applicationId: id,
        candidate: updated.candidate,
        vacancy: updated.vacancy,
        companyName: updated.company.name,
      });
    } else if (data.status === 'REJECTED') {
      void this.notifications.sendRejectionNotice({
        applicationId: id,
        candidate: updated.candidate,
        vacancy: updated.vacancy,
        companyName: updated.company.name,
      });
    }

    return updated;
  }

  async saveInterviewReview(
    companyId: number,
    id: number,
    actor: { id: number; fullName: string },
    data: z.infer<typeof interviewReview>,
  ) {
    await this.application(companyId, id);
    let scorecard = data.scorecard;
    if (scorecard) {
      const scoredCriteria = scorecard.criteria.filter(
        (c) => c.score !== null && c.score !== undefined && c.score >= 1,
      );
      const avg =
        scoredCriteria.length > 0
          ? Number(
              (
                scoredCriteria.reduce((sum, c) => sum + (c.score ?? 0), 0) / scoredCriteria.length
              ).toFixed(1),
            )
          : undefined;

      scorecard = {
        ...scorecard,
        averageScore: avg,
        decidedBy:
          scorecard.finalDecision && scorecard.finalDecision !== 'UNDECIDED'
            ? scorecard.decidedBy || actor.fullName
            : scorecard.decidedBy,
        decidedAt:
          scorecard.finalDecision && scorecard.finalDecision !== 'UNDECIDED'
            ? scorecard.decidedAt || new Date().toISOString()
            : scorecard.decidedAt,
      };
    }

    const review = {
      answers: data.answers,
      notes: data.notes,
      ...(scorecard ? { scorecard } : {}),
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
