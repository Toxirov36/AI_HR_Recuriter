import { createHash } from 'node:crypto';
import { Database } from '../database/prisma.service';

export interface SnapshotMetadata {
  version: string;
  createdAt: string;
  recordCounts: Record<string, number>;
  checksum: string;
}

export interface SnapshotData {
  metadata: SnapshotMetadata;
  data: {
    companies: any[];
    users: any[];
    vacancies: any[];
    requirements: any[];
    candidates: any[];
    resumes: any[];
    applications: any[];
    applicationStageChanges: any[];
    auditLogs: any[];
  };
}

export interface RestoreReport {
  success: boolean;
  restoredCounts: Record<string, number>;
  verifiedChecksum: boolean;
  durationMs: number;
}

/**
 * Computes SHA-256 checksum over snapshot payload to verify data integrity.
 */
export function computeSnapshotChecksum(data: Omit<SnapshotData, 'metadata'>['data']): string {
  const serialized = JSON.stringify(data);
  return createHash('sha256').update(serialized).digest('hex');
}

/**
 * Exports complete database snapshot for disaster recovery and offline backup.
 */
export async function exportSnapshot(db: Database, companyId?: number): Promise<SnapshotData> {
  const companyFilter = companyId ? { id: companyId } : {};
  const companyScope = companyId ? { companyId } : {};

  const [
    companies,
    users,
    vacancies,
    requirements,
    candidates,
    resumes,
    applications,
    applicationStageChanges,
    auditLogs,
  ] = await Promise.all([
    db.company.findMany({ where: companyFilter }),
    db.user.findMany({ where: companyScope }),
    db.vacancy.findMany({ where: companyScope }),
    db.requirement.findMany({
      where: companyId ? { vacancy: { companyId } } : {},
    }),
    db.candidate.findMany({ where: companyScope }),
    db.resume.findMany({ where: companyScope }),
    db.application.findMany({ where: companyScope }),
    db.applicationStageChange.findMany({
      where: companyId ? { application: { companyId } } : {},
    }),
    db.auditLog.findMany({ where: companyScope }),
  ]);

  const payload = {
    companies,
    users,
    vacancies,
    requirements,
    candidates,
    resumes,
    applications,
    applicationStageChanges,
    auditLogs,
  };

  const checksum = computeSnapshotChecksum(payload);

  const recordCounts = {
    companies: companies.length,
    users: users.length,
    vacancies: vacancies.length,
    requirements: requirements.length,
    candidates: candidates.length,
    resumes: resumes.length,
    applications: applications.length,
    applicationStageChanges: applicationStageChanges.length,
    auditLogs: auditLogs.length,
  };

  return {
    metadata: {
      version: '1.0',
      createdAt: new Date().toISOString(),
      recordCounts,
      checksum,
    },
    data: payload,
  };
}

/**
 * Restores database records from a verified snapshot with foreign-key ordering and parity validation.
 */
export async function restoreSnapshot(
  db: Database,
  snapshot: SnapshotData,
): Promise<RestoreReport> {
  const startTime = Date.now();

  // 1. Verify snapshot integrity checksum
  const expectedChecksum = computeSnapshotChecksum(snapshot.data);
  if (snapshot.metadata.checksum !== expectedChecksum) {
    throw new Error('Yaxlitlik xatosi: Snapshot ma‘lumotlari o‘zgartirilgan yoki buzilgan (Checksum mismatch)');
  }

  const restoredCounts: Record<string, number> = {};

  // 2. Transactional foreign-key ordered restore
  await db.$transaction(async (tx) => {
    // A. Companies
    for (const item of snapshot.data.companies) {
      await tx.company.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }
    restoredCounts.companies = snapshot.data.companies.length;

    // B. Users
    for (const item of snapshot.data.users) {
      await tx.user.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }
    restoredCounts.users = snapshot.data.users.length;

    // C. Vacancies & Requirements
    for (const item of snapshot.data.vacancies) {
      await tx.vacancy.upsert({
        where: { id_companyId: { id: item.id, companyId: item.companyId } },
        update: item,
        create: item,
      });
    }
    restoredCounts.vacancies = snapshot.data.vacancies.length;

    for (const item of snapshot.data.requirements) {
      await tx.requirement.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }
    restoredCounts.requirements = snapshot.data.requirements.length;

    // D. Candidates & Resumes
    for (const item of snapshot.data.candidates) {
      await tx.candidate.upsert({
        where: { id_companyId: { id: item.id, companyId: item.companyId } },
        update: item,
        create: item,
      });
    }
    restoredCounts.candidates = snapshot.data.candidates.length;

    for (const item of snapshot.data.resumes) {
      await tx.resume.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }
    restoredCounts.resumes = snapshot.data.resumes.length;

    // E. Applications & Stage Changes
    for (const item of snapshot.data.applications) {
      await tx.application.upsert({
        where: { vacancyId_candidateId: { vacancyId: item.vacancyId, candidateId: item.candidateId } },
        update: item,
        create: item,
      });
    }
    restoredCounts.applications = snapshot.data.applications.length;

    for (const item of snapshot.data.applicationStageChanges) {
      await tx.applicationStageChange.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }
    restoredCounts.applicationStageChanges = snapshot.data.applicationStageChanges.length;

    // F. Audit Logs
    for (const item of snapshot.data.auditLogs) {
      await tx.auditLog.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }
    restoredCounts.auditLogs = snapshot.data.auditLogs.length;
  });

  return {
    success: true,
    restoredCounts,
    verifiedChecksum: true,
    durationMs: Date.now() - startTime,
  };
}
