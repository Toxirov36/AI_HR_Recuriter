import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { Database } from '../../database/prisma.service';
import { z } from 'zod';
import { vacancy } from '../../common/pipes/validation';

@Injectable()
export class VacanciesService {
  constructor(@Inject(Database) readonly db: Database) {}

  async list(companyId: number, page: number, search: string) {
    const where = {
      companyId,
      title: { contains: search, mode: 'insensitive' as const },
    };
    const [items, total] = await this.db.$transaction([
      this.db.vacancy.findMany({
        where,
        include: { requirements: true, _count: { select: { applications: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 20,
        take: 20,
      }),
      this.db.vacancy.count({ where }),
    ]);
    return { items, total, page, pageSize: 20 };
  }

  async vacancy(companyId: number, id: number) {
    const found = await this.db.vacancy.findFirst({
      where: { id, companyId },
      include: { requirements: { orderBy: { id: 'asc' } } },
    });
    if (!found) throw new NotFoundException('Vacancy not found');
    return found;
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

  async deleteVacancy(companyId: number, id: number) {
    await this.vacancy(companyId, id);
    await this.db.vacancy.delete({
      where: { id_companyId: { id, companyId } },
    });
    return { ok: true };
  }
}
