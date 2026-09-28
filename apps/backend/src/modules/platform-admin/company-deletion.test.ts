import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CompanyDeletionService, deleteCompanySchema } from './company-deletion.service';

describe('company deletion', () => {
  const actor = {
    id: 1,
    companyId: 10,
    role: 'ADMIN',
    platformRole: 'SUPER_ADMIN' as const,
    fullName: 'Operator',
    email: 'operator@example.com',
  };
  const input = { confirmationName: 'Tenant', reason: 'Synthetic deletion test' };
  let tasks: Array<{ id: number; companyId: number; objectKey: string }>;
  let tx: any;
  let db: any;
  let storage: any;
  let service: CompanyDeletionService;
  beforeEach(() => {
    tasks = [];
    tx = {
      $queryRaw: vi.fn(),
      user: {
        findFirst: vi.fn().mockResolvedValueOnce({ id: 1 }).mockResolvedValue(null),
        deleteMany: vi.fn(),
      },
      company: {
        findUnique: vi.fn().mockResolvedValue({ id: 20, name: 'Tenant', isActive: true }),
        delete: vi.fn(),
      },
      candidate: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
      resume: { findMany: vi.fn().mockResolvedValue([]) },
      companyFileCleanup: {
        createMany: vi.fn().mockImplementation(({ data }) => {
          tasks = data.map((item: any, i: number) => ({ ...item, id: i + 1 }));
        }),
      },
      platformAuditLog: { create: vi.fn() },
    };
    for (const table of [
      'application',
      'vacancy',
      'invitation',
      'telegramConnectRequest',
      'telegramBusinessConnection',
      'auditLog',
    ])
      tx[table] = { deleteMany: vi.fn() };
    db = {
      $transaction: vi.fn().mockImplementation((fn: any) => fn(tx)),
      companyFileCleanup: {
        findMany: vi.fn().mockImplementation(() => tasks.slice(0, 10)),
        count: vi.fn().mockImplementation(() => tasks.length),
        deleteMany: vi.fn().mockImplementation(({ where }) => {
          tasks = tasks.filter((item) => item.id !== where.id);
        }),
      },
    };
    storage = { enabled: true, delete: vi.fn().mockResolvedValue(undefined) };
    service = new CompanyDeletionService(db, storage);
  });
  it('denies ordinary admins and self-company deletion', async () => {
    await expect(
      service.remove({ ...actor, platformRole: null }, 20, input),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove(actor, 10, input)).rejects.toBeInstanceOf(ConflictException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('requires exact current name and protects platform accounts', async () => {
    await expect(
      service.remove(actor, 20, { ...input, confirmationName: 'Wrong' }),
    ).rejects.toBeInstanceOf(ConflictException);
    tx.user.findFirst.mockReset().mockResolvedValue({ id: 1 });
    await expect(service.remove(actor, 20, input)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.company.delete).not.toHaveBeenCalled();
  });
  it('returns not found for an already deleted company', async () => {
    tx.company.findUnique.mockResolvedValue(null);
    await expect(service.remove(actor, 20, input)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('removes only tenant-owned rows and keeps platform audit history', async () => {
    expect(await service.remove(actor, 20, input)).toEqual({ deleted: true, pendingFiles: 0 });
    for (const table of [
      'application',
      'vacancy',
      'candidate',
      'invitation',
      'user',
      'telegramConnectRequest',
      'telegramBusinessConnection',
      'auditLog',
    ])
      expect(tx[table].deleteMany).toHaveBeenCalledWith({ where: { companyId: 20 } });
    expect(tx.platformAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'COMPANY_DELETED',
        companyId: 20,
        reason: input.reason,
      }),
    });
  });
  it('deduplicates current and historical CV keys and deletes them after commit', async () => {
    tx.candidate.findMany.mockResolvedValue([{ resumeObjectKey: 'companies/20/current.pdf' }]);
    tx.resume.findMany.mockResolvedValue([
      { objectKey: 'companies/20/current.pdf' },
      { objectKey: 'companies/20/old.pdf' },
    ]);
    let committed = false;
    db.$transaction.mockImplementation(async (fn: any) => {
      const result = await fn(tx);
      committed = true;
      return result;
    });
    storage.delete.mockImplementation(async () => {
      expect(committed).toBe(true);
    });
    expect(await service.remove(actor, 20, input)).toEqual({ deleted: true, pendingFiles: 0 });
    expect(storage.delete).toHaveBeenCalledTimes(2);
  });
  it('keeps a durable task when storage fails and removes it after retry', async () => {
    tx.candidate.findMany.mockResolvedValue([{ resumeObjectKey: 'companies/20/cv.pdf' }]);
    storage.delete.mockRejectedValue(new Error('Storage unavailable'));
    expect(await service.remove(actor, 20, input)).toEqual({ deleted: true, pendingFiles: 1 });
    expect(tasks).toHaveLength(1);
    storage.delete.mockResolvedValue(undefined);
    expect(await service.retry(actor, 20)).toEqual({ pendingFiles: 0 });
  });
  it('does not delete files when the database transaction fails', async () => {
    db.$transaction.mockRejectedValue(new Error('Rollback'));
    await expect(service.remove(actor, 20, input)).rejects.toThrow('Rollback');
    expect(storage.delete).not.toHaveBeenCalled();
  });
  it('rejects an out-of-tenant file pointer', async () => {
    tx.candidate.findMany.mockResolvedValue([{ resumeObjectKey: 'companies/99/cv.pdf' }]);
    await expect(service.remove(actor, 20, input)).rejects.toBeInstanceOf(ConflictException);
    expect(storage.delete).not.toHaveBeenCalled();
    expect(tx.company.delete).not.toHaveBeenCalled();
  });
  it('requires a reason and rejects injected fields', () => {
    expect(deleteCompanySchema.safeParse({ ...input, reason: '' }).success).toBe(false);
    expect(deleteCompanySchema.safeParse({ ...input, companyId: 99 }).success).toBe(false);
  });
});
