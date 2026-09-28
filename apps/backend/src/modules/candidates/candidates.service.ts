import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { z } from 'zod';
import { candidate } from '../../common/pipes/validation';
import { R2Storage } from '../../common/storage/r2-storage.service';
import { Prisma } from '../../generated/prisma/client';

export const candidateSelect = {
  id: true,
  companyId: true,
  fullName: true,
  email: true,
  phone: true,
  publicSubmittedAt: true,
  privacyAcceptedAt: true,
  aiConsentAt: true,
  mergedIntoId: true,
  mergedCandidates: { select: { id: true, fullName: true, source: true, resumeName: true } },
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
  isAnonymized: true,
  anonymizedAt: true,
  isOcrProcessed: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const candidateListSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  mergedIntoId: true,
  source: true,
  telegramUsername: true,
  resumeName: true,
  isAnonymized: true,
  isOcrProcessed: true,
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
      mergedIntoId: null,
      OR: [
        { fullName: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ],
    };
    const [items, total] = await Promise.all([
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

  private normalizedPhone(value: string | null | undefined) {
    if (!value) return null;
    const raw = value.replace(/\D/g, '');
    const digits = raw.startsWith('00') ? raw.slice(2) : raw;
    return digits.length === 9 ? `998${digits}` : digits;
  }

  private sameContact(a: { email: string | null; phone: string | null }, b: { email: string | null; phone: string | null }) {
    const emailMatches = Boolean(a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase());
    const phoneMatches = Boolean(a.phone && b.phone && this.normalizedPhone(a.phone) === this.normalizedPhone(b.phone));
    return emailMatches || phoneMatches;
  }

  async duplicates(companyId: number, candidateId: number) {
    const current = await this.db.candidate.findFirst({
      where: { id: candidateId, companyId, mergedIntoId: null, isAnonymized: false },
      select: { email: true, phone: true },
    });
    if (!current) return [];
    if (!current.email && !current.phone) return [];
    const matches = await this.db.candidate.findMany({
      where: {
        companyId, id: { not: candidateId }, mergedIntoId: null, isAnonymized: false,
        OR: [
          ...(current.email ? [{ email: { equals: current.email, mode: 'insensitive' as const } }] : []),
          ...(current.phone ? [{ phone: { not: null } }] : []),
        ],
      },
      select: { id: true, fullName: true, email: true, phone: true, source: true, resumeName: true },
    });
    return matches.filter((match) => this.sameContact(current, match));
  }

  async merge(companyId: number, primaryId: number, duplicateId: number, actorName: string) {
    if (primaryId === duplicateId) throw new BadRequestException('Select another candidate');
    return this.db.$transaction(async (tx) => {
      const [primary, duplicate] = await Promise.all([
        tx.candidate.findFirst({ where: { id: primaryId, companyId, mergedIntoId: null, isAnonymized: false } }),
        tx.candidate.findFirst({ where: { id: duplicateId, companyId, mergedIntoId: null, isAnonymized: false } }),
      ]);
      if (!primary || !duplicate) throw new NotFoundException('Candidate not found');
      if (!this.sameContact(primary, duplicate)) {
        throw new BadRequestException('Candidates must share an email or phone number');
      }
      if (primary.telegramUserId && duplicate.telegramUserId && primary.telegramUserId !== duplicate.telegramUserId) {
        throw new ConflictException('Both profiles have different Telegram accounts');
      }
      const primaryVacancies = await tx.application.findMany({
        where: { companyId, candidateId: primaryId }, select: { vacancyId: true },
      });
      const duplicateVacancies = await tx.application.findMany({
        where: { companyId, candidateId: duplicateId }, select: { vacancyId: true },
      });
      const vacancyIds = new Set(primaryVacancies.map((item) => item.vacancyId));
      if (duplicateVacancies.some((item) => vacancyIds.has(item.vacancyId))) {
        throw new ConflictException('Both profiles have an application for the same vacancy. Resolve that pair before merging.');
      }

      if (!primary.telegramUserId && duplicate.telegramUserId) {
        await tx.candidate.update({ where: { id: duplicateId }, data: { telegramUserId: null } });
      }
      if (!primary.resumeName && duplicate.resumeName) {
        await tx.candidate.update({
          where: { id: duplicateId },
          data: { resumeName: null, resumeMime: null, resumeData: null, resumeObjectKey: null, resumeSize: null, resumeText: null },
        });
      }
      await tx.candidate.update({
        where: { id: primaryId },
        data: {
          email: primary.email ?? duplicate.email,
          phone: primary.phone ?? duplicate.phone,
          telegramUserId: primary.telegramUserId ?? duplicate.telegramUserId,
          telegramUsername: primary.telegramUsername ?? duplicate.telegramUsername,
          publicSubmittedAt: primary.publicSubmittedAt ?? duplicate.publicSubmittedAt,
          privacyAcceptedAt: primary.privacyAcceptedAt ?? duplicate.privacyAcceptedAt,
          aiConsentAt: (primary.publicSubmittedAt && !primary.aiConsentAt) || (duplicate.publicSubmittedAt && !duplicate.aiConsentAt)
            ? null
            : primary.aiConsentAt ?? duplicate.aiConsentAt,
          ...(!primary.resumeName && duplicate.resumeName ? {
            resumeName: duplicate.resumeName,
            resumeMime: duplicate.resumeMime,
            resumeData: duplicate.resumeData,
            resumeObjectKey: duplicate.resumeObjectKey,
            resumeSize: duplicate.resumeSize,
            resumeText: duplicate.resumeText,
            resumeRevision: { increment: 1 },
            parsedResume: duplicate.parsedResume ?? undefined,
            skills: duplicate.skills ?? undefined,
            experience: duplicate.experience ?? undefined,
            education: duplicate.education ?? undefined,
            languages: duplicate.languages ?? undefined,
          } : {}),
        },
      });
      await tx.application.updateMany({ where: { companyId, candidateId: duplicateId }, data: { candidateId: primaryId } });
      await tx.application.updateMany({
        where: { companyId, candidateId: primaryId },
        data: {
          analysis: Prisma.DbNull,
          interviewQuestions: Prisma.DbNull,
          analyzedResumeRevision: null,
          analyzedVacancyRevision: null,
        },
      });
      await tx.resume.updateMany({ where: { companyId, candidateId: duplicateId }, data: { candidateId: primaryId } });
      await tx.candidateEvent.updateMany({ where: { companyId, candidateId: duplicateId }, data: { candidateId: primaryId } });
      await tx.candidate.update({ where: { id: duplicateId }, data: { mergedIntoId: primaryId } });
      await tx.candidateEvent.create({
        data: { companyId, candidateId: primaryId, type: 'CANDIDATE_MERGED', label: `${actorName} merged candidate #${duplicateId} into this profile` },
      });
      return { id: primaryId, mergedId: duplicateId };
    });
  }

  async deleteCandidate(companyId: number, id: number) {
    const candidate = await this.db.candidate.findUnique({
      where: { id_companyId: { id, companyId } },
      select: {
        resumeObjectKey: true,
        resumes: { select: { objectKey: true } },
        mergedCandidates: { select: { id: true } },
      },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');
    for (const merged of candidate.mergedCandidates ?? []) {
      await this.deleteCandidate(companyId, merged.id);
    }
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
