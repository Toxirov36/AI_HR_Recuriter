import { Inject, Injectable, Optional } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';

import { vacancy } from '../../common/pipes/validation';
import { RecruitingService } from '../recruiting/recruiting.service';
import { ExternalRecruitingService } from '../external-recruiting/external-recruiting.service';
import { AiService } from '../ai/ai.service';
import type { Identity } from '../../common/utils/security';
import { QueryVacancyDto } from './dto/query-vacancy.dto';
import { VacancyAssessmentService } from './vacancy-assessment.service';
import { assessmentState } from '../ai/utils/assessment-approval';

@Injectable()
export class VacanciesService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(RecruitingService) private recruiting: RecruitingService,
    @Inject(ExternalRecruitingService) private external: ExternalRecruitingService,
    @Optional() @Inject(AiService) private ai?: AiService,
    @Optional() @Inject(VacancyAssessmentService) private assessments?: VacancyAssessmentService,
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
    return {
      items: items.map(({ assessmentQuestions, ...vacancy }) => ({ ...vacancy, assessmentState: assessmentState({ ...vacancy, assessmentQuestions }) })),
      total,
      page,
      pageSize: 20,
    };
  }

  vacancy(companyId: number, id: number) {
    return this.recruiting.vacancy(companyId, id);
  }

  async saveVacancy(companyId: number, id: number | null, data: z.infer<typeof vacancy>, actor?: Identity) {
    const previous = id === null ? null : await this.db.vacancy.findUnique({ where: { id_companyId: { id, companyId } }, select: { status: true } });
    const saved = await this.recruiting.saveVacancy(companyId, id, data);
    if (id !== null) await this.external.vacancyChanged(companyId, id, saved.status);
    if (this.ai && saved?.id) {
      setImmediate(() => {
        void this.ai?.evaluateCompanyCandidatesForVacancy(companyId, saved.id);
      });
    }
    // An active vacancy gets an AI-drafted candidate test that HR must approve before the bot uses it.
    if (saved?.status === 'ACTIVE') {
      setImmediate(() => {
        void this.assessments?.autoGenerate(companyId, saved.id);
      });
    }
    // A vacancy that just became ACTIVE is already visible in the candidate bot (it reads the database);
    // with the company opt-in it is also posted to the connected Telegram channels.
    if (actor && saved?.status === 'ACTIVE' && previous?.status !== 'ACTIVE') {
      setImmediate(() => {
        void this.external.autoPublishToTelegram(actor, saved.id);
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

