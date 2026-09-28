import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { CandidatesService } from './candidates.service';

describe('candidate duplicate review', () => {
  const db: any = {
    candidate: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    application: { findMany: vi.fn(), updateMany: vi.fn() },
    resume: { updateMany: vi.fn() },
    candidateEvent: { updateMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  };
  const service = new CandidatesService(db, {} as any);
  const primary = { id: 1, companyId: 2, fullName: 'Ali', email: 'ali@example.com', phone: null, telegramUserId: null, resumeName: null };
  const duplicate = { ...primary, id: 3, phone: '+998901234567', resumeName: 'cv.pdf' };

  beforeEach(() => {
    vi.resetAllMocks();
    db.$transaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => callback(db));
    db.candidate.findFirst.mockResolvedValueOnce(primary).mockResolvedValueOnce(duplicate);
    db.application.findMany.mockResolvedValue([]);
  });

  it('suggests exact email matches and normalizes phone formats', async () => {
    db.candidate.findFirst.mockReset().mockResolvedValue({ email: null, phone: '+998 90 123 45 67' });
    db.candidate.findMany.mockResolvedValue([
      { id: 3, fullName: 'Ali', email: null, phone: '901234567', source: 'TELEGRAM', resumeName: 'cv.pdf' },
      { id: 4, fullName: 'Other', email: null, phone: '998901234568', source: 'WEBSITE', resumeName: null },
    ]);
    const matches = await service.duplicates(2, 1);
    expect(matches.map((candidate) => candidate.id)).toEqual([3]);
    expect(db.candidate.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 2 }) }));
  });

  it('moves applications only after HR chooses a profile and retains the source', async () => {
    const result = await service.merge(2, 1, 3, 'HR user');
    expect(result).toEqual({ id: 1, mergedId: 3 });
    expect(db.application.updateMany).toHaveBeenCalledWith({ where: { companyId: 2, candidateId: 3 }, data: { candidateId: 1 } });
    expect(db.candidate.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { mergedIntoId: 1 } });
  });

  it('blocks merging two applications for the same vacancy', async () => {
    db.application.findMany.mockReset().mockResolvedValueOnce([{ vacancyId: 5 }]).mockResolvedValueOnce([{ vacancyId: 5 }]);
    await expect(service.merge(2, 1, 3, 'HR user')).rejects.toBeInstanceOf(ConflictException);
    expect(db.candidate.update).not.toHaveBeenCalled();
  });
});
