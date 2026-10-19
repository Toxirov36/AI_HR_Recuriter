import { Inject, Injectable, Optional } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';

import { vacancy } from '../../common/pipes/validation';
import { RecruitingService } from '../recruiting/recruiting.service';
import { ExternalRecruitingService } from '../external-recruiting/external-recruiting.service';
import { AiService } from '../ai/ai.service';
import { QueryVacancyDto } from './dto/query-vacancy.dto';

@Injectable()
export class VacanciesService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(RecruitingService) private recruiting: RecruitingService,
    @Inject(ExternalRecruitingService) private external: ExternalRecruitingService,
    @Optional() @Inject(AiService) private ai?: AiService,
  ) {}

  async list(companyId: number, query: QueryVacancyDto) {
    const { page, search, status, sort } = query;
    const where: Prisma.VacancyWhereInput = {
      companyId,
      ...(status ? { status } : {}),
      ...(search.trim() ? { OR: [
        { title: { contains: search.trim(), mode: 'insensitive' } },
        { description: { contains: search.trim(), mode: 'insensitive' } },
        { department: { contains: search.trim(), mode: 'insensitive' } },
        { location: { contains: search.trim(), mode: 'insensitive' } },
        { workModel: { contains: search.trim(), mode: 'insensitive' } },
        { employmentType: { contains: search.trim(), mode: 'insensitive' } },
        { seniority: { contains: search.trim(), mode: 'insensitive' } },
        { requirements: { some: { OR: [
          { name: { contains: search.trim(), mode: 'insensitive' } },
          { description: { contains: search.trim(), mode: 'insensitive' } },
        ] } } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.vacancy.findMany({
        where,
        include: { requirements: true, _count: { select: { applications: true } } },
        orderBy: sort === 'title' ? [{ title: 'asc' }, { id: 'desc' }] : [{ createdAt: sort === 'oldest' ? 'asc' : 'desc' }, { id: 'desc' }],
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

  async saveVacancy(companyId: number, id: number | null, data: z.infer<typeof vacancy>) {
    const saved = await this.recruiting.saveVacancy(companyId, id, data);
    if (id !== null) await this.external.vacancyChanged(companyId, id, saved.status);
    if (this.ai && saved?.id) {
      setImmediate(() => {
        void this.ai?.evaluateCompanyCandidatesForVacancy(companyId, saved.id);
      });
    }
    return saved;
  }

  async deleteVacancy(companyId: number, id: number) {
    await this.recruiting.vacancy(companyId, id);
    await this.external.assertCanDelete(companyId, id);
    await this.db.vacancy.delete({
      where: { id_companyId: { id, companyId } },
    });
    return { ok: true };
  }
}

