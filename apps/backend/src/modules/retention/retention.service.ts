import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { R2Storage } from '../../common/storage/r2-storage.service';
import { AuditService } from '../audit/audit.service';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class RetentionService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(R2Storage) private storage: R2Storage,
    @Inject(AuditService) private audit: AuditService,
  ) {}

  /**
   * Anonymizes candidate PII according to GDPR Art. 17 / Right to be Forgotten.
   * Cleans names, phone, email, and CV files while retaining anonymous hiring pipeline metrics.
   */
  async anonymizeCandidate(
    companyId: number,
    candidateId: number,
    actorId?: number,
    actorName = 'System',
    actorRole = 'HR',
    mergedChild = false,
  ) {
    const candidate = await this.db.candidate.findUnique({
      where: { id_companyId: { id: candidateId, companyId } },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }
    if (candidate.mergedIntoId && !mergedChild) {
      throw new ConflictException('Anonymize the primary candidate profile instead');
    }

    if (candidate.isAnonymized) {
      return { ok: true, alreadyAnonymized: true, candidateId };
    }

    // Delete stored CV binary from cloud storage if exists
    if (candidate.resumeObjectKey && this.storage.enabled) {
      await this.storage.delete(candidate.resumeObjectKey).catch(() => undefined);
    }

    await this.db.$transaction(async (tx) => {
      // 1. Wipe PII on Candidate record
      await tx.candidate.update({
        where: { id_companyId: { id: candidateId, companyId } },
        data: {
          fullName: `Anonymized Candidate #${candidateId}`,
          email: null,
          phone: null,
          telegramUserId: null,
          telegramUsername: null,
          resumeName: null,
          resumeMime: null,
          resumeData: null,
          resumeObjectKey: null,
          resumeText: null,
          parsedResume: Prisma.DbNull,
          skills: Prisma.DbNull,
          experience: Prisma.DbNull,
          education: Prisma.DbNull,
          languages: Prisma.DbNull,
          isAnonymized: true,
          anonymizedAt: new Date(),
        },
      });

      // 2. Remove raw resume text copies from Resume table
      await tx.resume.deleteMany({
        where: { candidateId, companyId },
      });
    });

    // Record audit event
    await this.audit.log({
      companyId,
      userId: actorId,
      actorName,
      actorRole,
      action: 'CANDIDATE_ANONYMIZED',
      resourceType: 'CANDIDATE',
      resourceId: String(candidateId),
      details: {
        previousName: candidate.fullName,
        source: candidate.source,
      },
    });

    const mergedProfiles = await this.db.candidate.findMany({
      where: { companyId, mergedIntoId: candidateId, isAnonymized: false },
      select: { id: true },
    }) ?? [];
    for (const profile of mergedProfiles) {
      await this.anonymizeCandidate(companyId, profile.id, actorId, actorName, actorRole, true);
    }

    return {
      ok: true,
      anonymized: true,
      candidateId,
      anonymizedAt: new Date(),
    };
  }

  /**
   * Automatically purges / anonymizes candidates whose applications are older than
   * the configured retention period and in terminal stages (REJECTED).
   */
  async purgeExpiredCandidates(
    companyId: number,
    actorId?: number,
    actorName = 'System Cron',
  ) {
    const company = await this.db.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { retentionDays: true },
    });

    const retentionDays = company.retentionDays || 180;
    const thresholdDate = new Date(Date.now() - retentionDays * 86400000);

    // Find candidates whose latest application is REJECTED and older than threshold
    const candidatesToPurge = await this.db.candidate.findMany({
      where: {
        companyId,
        mergedIntoId: null,
        isAnonymized: false,
        updatedAt: { lte: thresholdDate },
        applications: {
          every: {
            status: 'REJECTED',
            updatedAt: { lte: thresholdDate },
          },
        },
      },
      select: { id: true },
    });

    let purgedCount = 0;
    for (const c of candidatesToPurge) {
      await this.anonymizeCandidate(companyId, c.id, actorId, actorName, 'ADMIN');
      purgedCount++;
    }

    return {
      purgedCount,
      retentionDays,
      thresholdDate,
    };
  }

  /**
   * Updates company data retention threshold in days (e.g. 90, 180, 365).
   */
  async updatePolicy(companyId: number, retentionDays: number) {
    const updated = await this.db.company.update({
      where: { id: companyId },
      data: { retentionDays },
      select: { id: true, name: true, retentionDays: true },
    });
    return updated;
  }
}
