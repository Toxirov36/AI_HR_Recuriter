import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuditService } from './audit.service';
import { RetentionService } from '../retention/retention.service';

describe('Audit Log & Export Service', () => {
  let auditService: AuditService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      auditLog: {
        create: vi.fn(async ({ data }: any) => ({ id: 101, ...data, createdAt: new Date() })),
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };
    auditService = new AuditService(mockDb);
  });

  it('records audit events with actor metadata and details', async () => {
    const entry = {
      companyId: 1,
      userId: 5,
      actorName: 'Dilshodbek Toxirov',
      actorRole: 'ADMIN',
      action: 'CANDIDATE_ANONYMIZED',
      resourceType: 'CANDIDATE',
      resourceId: '42',
      details: { reason: 'GDPR right to be forgotten request' },
      ipAddress: '192.168.1.50',
    };

    const result = await auditService.log(entry);
    expect(result).toBeDefined();
    expect(mockDb.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 1,
        actorName: 'Dilshodbek Toxirov',
        action: 'CANDIDATE_ANONYMIZED',
        resourceId: '42',
      }),
    });
  });

  it('exports audit logs as RFC 4180 CSV with UTF-8 BOM', async () => {
    mockDb.auditLog.findMany.mockResolvedValue([
      {
        id: 1,
        createdAt: new Date('2026-09-20T10:00:00.000Z'),
        actorName: 'Ali Valiyev',
        actorRole: 'HR',
        action: 'STAGE_CHANGED',
        resourceType: 'APPLICATION',
        resourceId: '77',
        details: { from: 'NEW', to: 'INTERVIEW' },
        ipAddress: '127.0.0.1',
      },
    ]);

    const csv = await auditService.exportCsv(1);

    // Starts with UTF-8 BOM (\uFEFF)
    expect(csv.charCodeAt(0)).toBe(0xfeff);

    // Contains standard headers
    expect(csv).toContain('"ID","Vaqt (UTC)","Foydalanuvchi","Rol","Amal (Action)","Resurs turi","Resurs ID","Tafsilotlar","IP manzil"');

    // Contains row data
    expect(csv).toContain('"Ali Valiyev"');
    expect(csv).toContain('"STAGE_CHANGED"');
    expect(csv).toContain('"APPLICATION"');
  });

  it('exports audit logs as structured JSON', async () => {
    const sampleItems = [
      { id: 1, action: 'AUTH_LOGIN', actorName: 'Admin' },
      { id: 2, action: 'SCORECARD_SUBMITTED', actorName: 'Interviewer' },
    ];
    mockDb.auditLog.findMany.mockResolvedValue(sampleItems);

    const json = await auditService.exportJson(1);
    expect(json).toEqual(sampleItems);
  });
});

describe('Candidate Anonymization & Retention Policy (GDPR)', () => {
  let retentionService: RetentionService;
  let mockDb: any;
  let mockStorage: any;
  let mockAudit: any;

  beforeEach(() => {
    mockDb = {
      candidate: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      resume: {
        deleteMany: vi.fn(),
      },
      company: {
        findUniqueOrThrow: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (cb: any) => cb(mockDb)),
    };

    mockStorage = {
      enabled: true,
      delete: vi.fn().mockResolvedValue(undefined),
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue(true),
    };

    retentionService = new RetentionService(mockDb, mockStorage, mockAudit);
  });

  it('anonymizes candidate PII and deletes CV storage object', async () => {
    mockDb.candidate.findUnique.mockResolvedValue({
      id: 55,
      companyId: 1,
      fullName: 'Sardor Rahimboev',
      email: 'sardor@example.com',
      phone: '+998901234567',
      resumeObjectKey: 'resumes/1/55/cv.pdf',
      isAnonymized: false,
    });

    const res = await retentionService.anonymizeCandidate(1, 55, 10, 'Admin User', 'ADMIN');

    expect(res.ok).toBe(true);
    expect(res.anonymized).toBe(true);

    // Verify cloud storage object was deleted
    expect(mockStorage.delete).toHaveBeenCalledWith('resumes/1/55/cv.pdf');

    // Verify candidate was scrubbed
    expect(mockDb.candidate.update).toHaveBeenCalledWith({
      where: { id_companyId: { id: 55, companyId: 1 } },
      data: expect.objectContaining({
        fullName: 'Anonymized Candidate #55',
        email: null,
        phone: null,
        resumeText: null,
        isAnonymized: true,
      }),
    });

    // Verify audit log recorded
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CANDIDATE_ANONYMIZED',
        resourceId: '55',
      }),
    );
  });

  it('skips already anonymized candidates gracefully', async () => {
    mockDb.candidate.findUnique.mockResolvedValue({
      id: 55,
      companyId: 1,
      isAnonymized: true,
    });

    const res = await retentionService.anonymizeCandidate(1, 55);
    expect(res.alreadyAnonymized).toBe(true);
    expect(mockDb.candidate.update).not.toHaveBeenCalled();
  });

  it('anonymizes merged historical profiles with the primary candidate', async () => {
    mockDb.candidate.findUnique
      .mockResolvedValueOnce({ id: 55, companyId: 1, fullName: 'Ali', isAnonymized: false })
      .mockResolvedValueOnce({ id: 56, companyId: 1, fullName: 'Ali old profile', isAnonymized: false });
    mockDb.candidate.findMany
      .mockResolvedValueOnce([{ id: 56 }])
      .mockResolvedValueOnce([]);

    await retentionService.anonymizeCandidate(1, 55);

    expect(mockDb.candidate.update).toHaveBeenCalledTimes(2);
    expect(mockDb.candidate.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id_companyId: { id: 56, companyId: 1 } },
    }));
  });

  it('purges candidates matching retention policy expiration', async () => {
    mockDb.company.findUniqueOrThrow.mockResolvedValue({ retentionDays: 180 });
    mockDb.candidate.findMany.mockImplementation(async ({ where }: any) =>
      where.updatedAt ? [{ id: 101 }, { id: 102 }] : [],
    );

    mockDb.candidate.findUnique
      .mockResolvedValueOnce({ id: 101, companyId: 1, isAnonymized: false })
      .mockResolvedValueOnce({ id: 102, companyId: 1, isAnonymized: false });

    const purgeResult = await retentionService.purgeExpiredCandidates(1);

    expect(purgeResult.purgedCount).toBe(2);
    expect(purgeResult.retentionDays).toBe(180);
    expect(purgeResult.thresholdDate).toBeInstanceOf(Date);
  });
});
