import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { z } from 'zod';
import { candidate } from '../../common/pipes/validation';
import { R2Storage } from '../../common/storage/r2-storage.service';

export const candidateSelect = {
  id: true,
  companyId: true,
  fullName: true,
  email: true,
  phone: true,
  source: true,
  telegramUserId: true,
  telegramUsername: true,
  resumeName: true,
  resumeText: true,
  resumeRevision: true,
  skills: true,
  experience: true,
  education: true,
  languages: true,
  parsedResume: true,
  resumes: {
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      status: true,
      error: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
  events: {
    select: { id: true, type: true, label: true, createdAt: true },
    orderBy: { createdAt: 'desc' as const },
  },
  createdAt: true,
  updatedAt: true,
} as const;

export const candidateListSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  source: true,
  telegramUsername: true,
  resumeName: true,
  createdAt: true,
  _count: { select: { applications: true } },
} as const;

@Injectable()
export class CandidatesService {
  private readonly logger = new Logger(CandidatesService.name);

  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(R2Storage) private storage: R2Storage,
  ) {}

  async list(companyId: number, page: number, search: string) {
    const where = {
      companyId,
      OR: [
        { fullName: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ],
    };
    const [items, total] = await this.db.$transaction([
      this.db.candidate.findMany({
        where,
        select: candidateListSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 20,
        take: 20,
      }),
      this.db.candidate.count({ where }),
    ]);
    return { items, total, page, pageSize: 20 };
  }

  async candidate(companyId: number, id: number) {
    const found = await this.db.candidate.findFirst({
      where: { id, companyId },
      select: candidateSelect,
    });
    if (!found) throw new NotFoundException('Candidate not found');
    return found;
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

  async deleteCandidate(companyId: number, id: number) {
    const candidate = await this.db.candidate.findUnique({
      where: { id_companyId: { id, companyId } },
      select: {
        resumeObjectKey: true,
        resumes: { select: { objectKey: true } },
      },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');
    await this.db.candidate.delete({
      where: { id_companyId: { id, companyId } },
    });
    const objectKeys = new Set(
      [candidate.resumeObjectKey, ...candidate.resumes.map((resume) => resume.objectKey)].filter(
        (key): key is string => Boolean(key),
      ),
    );
    for (const objectKey of objectKeys) {
      await this.storage.delete(objectKey).catch(() => {
        this.logger.warn(`Unable to remove orphaned R2 resume for candidate ${id}`);
      });
    }
    return { ok: true };
  }
}
