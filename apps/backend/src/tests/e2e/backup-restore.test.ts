import { describe, expect, it, vi, beforeEach } from 'vitest';
import { exportSnapshot, restoreSnapshot, computeSnapshotChecksum } from './scripts/backup-restore';

describe('Database Disaster Recovery: Backup & Restore Verification Test', () => {
  let mockDb: any;
  let inMemoryDb: Record<string, any[]>;

  beforeEach(() => {
    inMemoryDb = {
      companies: [
        { id: 1, name: 'Apex Learning Centre', retentionDays: 180, createdAt: new Date() },
      ],
      users: [
        { id: 10, companyId: 1, fullName: 'Admin User', email: 'admin@apex.uz', role: 'ADMIN' },
      ],
      vacancies: [
        { id: 20, companyId: 1, title: 'Senior Java Developer', status: 'ACTIVE', revision: 1 },
      ],
      requirements: [
        { id: 30, vacancyId: 20, name: 'Spring Boot', required: true },
      ],
      candidates: [
        { id: 40, companyId: 1, fullName: 'Dilshodbek Toxirov', email: 'dilshod@apex.uz', isAnonymized: false },
      ],
      resumes: [
        { id: 50, companyId: 1, candidateId: 40, fileName: 'cv.pdf', status: 'COMPLETED' },
      ],
      applications: [
        { id: 60, companyId: 1, vacancyId: 20, candidateId: 40, status: 'INTERVIEW' },
      ],
      applicationStageChanges: [
        { id: 70, applicationId: 60, fromStatus: 'NEW', toStatus: 'INTERVIEW', actorId: 10, actorName: 'Admin' },
      ],
      auditLogs: [
        { id: 80, companyId: 1, userId: 10, actorName: 'Admin', actorRole: 'ADMIN', action: 'STAGE_CHANGED', resourceType: 'APPLICATION', resourceId: '60' },
      ],
    };

    mockDb = {
      company: {
        findMany: vi.fn(async () => inMemoryDb.companies),
        upsert: vi.fn(),
      },
      user: {
        findMany: vi.fn(async () => inMemoryDb.users),
        upsert: vi.fn(),
      },
      vacancy: {
        findMany: vi.fn(async () => inMemoryDb.vacancies),
        upsert: vi.fn(),
      },
      requirement: {
        findMany: vi.fn(async () => inMemoryDb.requirements),
        upsert: vi.fn(),
      },
      candidate: {
        findMany: vi.fn(async () => inMemoryDb.candidates),
        upsert: vi.fn(),
      },
      resume: {
        findMany: vi.fn(async () => inMemoryDb.resumes),
        upsert: vi.fn(),
      },
      application: {
        findMany: vi.fn(async () => inMemoryDb.applications),
        upsert: vi.fn(),
      },
      applicationStageChange: {
        findMany: vi.fn(async () => inMemoryDb.applicationStageChanges),
        upsert: vi.fn(),
      },
      auditLog: {
        findMany: vi.fn(async () => inMemoryDb.auditLogs),
        upsert: vi.fn(),
      },
      $transaction: vi.fn(async (cb: any) => cb(mockDb)),
    };
  });

  it('exports complete snapshot with verified SHA-256 checksum and metadata', async () => {
    const snapshot = await exportSnapshot(mockDb, 1);

    expect(snapshot.metadata.version).toBe('1.0');
    expect(snapshot.metadata.checksum).toBeDefined();
    expect(snapshot.metadata.recordCounts.companies).toBe(1);
    expect(snapshot.metadata.recordCounts.users).toBe(1);
    expect(snapshot.metadata.recordCounts.vacancies).toBe(1);
    expect(snapshot.metadata.recordCounts.candidates).toBe(1);
    expect(snapshot.metadata.recordCounts.applications).toBe(1);
    expect(snapshot.metadata.recordCounts.auditLogs).toBe(1);

    // Verify mathematical correctness of checksum
    const recalculated = computeSnapshotChecksum(snapshot.data);
    expect(snapshot.metadata.checksum).toBe(recalculated);
  });

  it('restores snapshot with complete relational consistency and parity', async () => {
    const snapshot = await exportSnapshot(mockDb, 1);
    const report = await restoreSnapshot(mockDb, snapshot);

    expect(report.success).toBe(true);
    expect(report.verifiedChecksum).toBe(true);
    expect(report.restoredCounts.companies).toBe(1);
    expect(report.restoredCounts.users).toBe(1);
    expect(report.restoredCounts.vacancies).toBe(1);
    expect(report.restoredCounts.requirements).toBe(1);
    expect(report.restoredCounts.candidates).toBe(1);
    expect(report.restoredCounts.applications).toBe(1);
    expect(report.restoredCounts.auditLogs).toBe(1);

    // Verify all entity upserts were invoked during transaction
    expect(mockDb.company.upsert).toHaveBeenCalledTimes(1);
    expect(mockDb.vacancy.upsert).toHaveBeenCalledTimes(1);
    expect(mockDb.candidate.upsert).toHaveBeenCalledTimes(1);
    expect(mockDb.application.upsert).toHaveBeenCalledTimes(1);
  });

  it('blocks restore when snapshot payload is tampered with (Checksum mismatch)', async () => {
    const snapshot = await exportSnapshot(mockDb, 1);

    // Tamper with candidate name without updating checksum
    snapshot.data.candidates[0].fullName = 'Hacked Candidate Name';

    await expect(restoreSnapshot(mockDb, snapshot)).rejects.toThrow(
      /Checksum mismatch/,
    );
  });
});
