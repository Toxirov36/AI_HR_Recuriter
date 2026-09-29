import { Inject, Injectable } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { z } from 'zod';

import { vacancy } from '../../common/pipes/validation';
import { RecruitingService } from '../recruiting/recruiting.service';

@Injectable()
export class VacanciesService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(RecruitingService) private recruiting: RecruitingService,
  ) {}

  async list(companyId: number, page: number, search: string) {
    const where = {
      companyId,
      title: { contains: search, mode: 'insensitive' as const },
    };
    const [items, total] = await Promise.all([
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

  vacancy(companyId: number, id: number) {
    return this.recruiting.vacancy(companyId, id);
  }

  saveVacancy(companyId: number, id: number | null, data: z.infer<typeof vacancy>) {
    return this.recruiting.saveVacancy(companyId, id, data);
  }

  async deleteVacancy(companyId: number, id: number) {
    await this.recruiting.vacancy(companyId, id);
    await this.db.vacancy.delete({
      where: { id_companyId: { id, companyId } },
    });
    return { ok: true };
  }
}

