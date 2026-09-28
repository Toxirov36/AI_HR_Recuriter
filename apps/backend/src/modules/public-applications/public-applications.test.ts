import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { publicApplicationSchema, PublicApplicationsService } from './public-applications.service';

describe('public applications', () => {
  const vacancy = { id: 4, companyId: 2, title: 'Backend Developer', description: 'Build APIs', company: { name: 'Acme', retentionDays: 180 } };
  const db: any = {
    vacancy: { findUnique: vi.fn() },
    candidate: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  const tx: any = {
    vacancy: { findUnique: vi.fn() },
    application: { create: vi.fn() },
    candidateEvent: { create: vi.fn() },
  };
  const security: any = { limit: vi.fn() };
  const resumes: any = { upload: vi.fn() };
  const candidates: any = { deleteCandidate: vi.fn() };
  const service = new PublicApplicationsService(db, security, resumes, candidates);
  const file = { buffer: Buffer.from('%PDF-sample'), size: 11, originalname: 'cv.pdf' } as Express.Multer.File;

  beforeEach(() => {
    vi.resetAllMocks();
    candidates.deleteCandidate.mockResolvedValue({ ok: true });
    db.vacancy.findUnique.mockResolvedValue(vacancy);
    db.candidate.create.mockResolvedValue({ id: 9 });
    tx.vacancy.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    db.$transaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => callback(tx));
  });

  it('requires contact details and explicit application consent', () => {
    expect(publicApplicationSchema.safeParse({ fullName: 'Ali Valiyev', privacyAccepted: 'false' }).success).toBe(false);
    expect(publicApplicationSchema.safeParse({ fullName: 'Ali Valiyev', privacyAccepted: 'true' }).success).toBe(false);
  });

  it('creates an application with CV without running AI when not opted in', async () => {
    const data = publicApplicationSchema.parse({ fullName: 'Ali Valiyev', email: 'ALI@EXAMPLE.COM', phone: '', privacyAccepted: 'true', aiConsent: 'false' });
    await expect(service.apply('token', data, file, '127.0.0.1')).resolves.toEqual({ ok: true });
    expect(db.candidate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: 'ali@example.com', phone: null, aiConsentAt: null, publicSubmittedAt: expect.any(Date) }),
    }));
    expect(resumes.upload).toHaveBeenCalledWith(2, 9, file);
    expect(tx.application.create).toHaveBeenCalledWith({ data: { companyId: 2, vacancyId: 4, candidateId: 9, status: 'NEW' } });
  });

  it('removes the partial candidate if the vacancy closes during upload', async () => {
    tx.vacancy.findUnique.mockResolvedValue({ status: 'CLOSED' });
    const data = publicApplicationSchema.parse({ fullName: 'Ali Valiyev', phone: '+998901234567', privacyAccepted: 'true' });
    await expect(service.apply('token', data, file)).rejects.toBeInstanceOf(NotFoundException);
    expect(candidates.deleteCandidate).toHaveBeenCalledWith(2, 9);
  });

  it('does not expose inactive vacancies', async () => {
    db.vacancy.findUnique.mockResolvedValue(null);
    await expect(service.publicVacancy('token')).rejects.toBeInstanceOf(NotFoundException);
  });
});
