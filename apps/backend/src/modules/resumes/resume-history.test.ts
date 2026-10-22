import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ResumesService } from './resumes.service';
import { candidateSelect } from '../candidates/candidates.service';

function setup(record: unknown) {
  const db = { resume: { findFirst: vi.fn().mockResolvedValue(record) } };
  const storage = { get: vi.fn().mockResolvedValue(Buffer.from('pdf-bytes')) };
  return { db, storage, service: new ResumesService(db as never, storage as never, {} as never, {} as never) };
}

describe('candidate CV history', () => {
  it('downloads one specific CV of the candidate within the company', async () => {
    const { db, storage, service } = setup({ fileName: 'cv-2.pdf', mimeType: 'application/pdf', objectKey: 'companies/3/resumes/abc.pdf' });
    const result = await service.downloadResume(3, 7, 12);
    expect(db.resume.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 12, candidateId: 7, companyId: 3 } }));
    expect(storage.get).toHaveBeenCalledWith('companies/3/resumes/abc.pdf');
    expect(result).toMatchObject({ resumeName: 'cv-2.pdf', resumeMime: 'application/pdf' });
  });

  it('refuses a CV that is missing or has no stored file', async () => {
    await expect(setup(null).service.downloadResume(3, 7, 99)).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ fileName: 'x.pdf', mimeType: null, objectKey: null }).service.downloadResume(3, 7, 12)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('the candidate payload carries every application and every submitted CV', () => {
    expect(candidateSelect.applications.select).toMatchObject({ id: true, status: true, assessmentScore: true, vacancy: { select: { id: true, title: true } } });
    expect(candidateSelect.resumes.select).toMatchObject({ id: true, fileName: true, createdAt: true });
  });
});
