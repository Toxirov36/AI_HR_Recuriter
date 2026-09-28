import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { CompanyAdminService, companySettingsSchema, memberAccessSchema } from './company-admin.service';
import { AuthGuard } from '../../common/guards/auth.guard';

describe('company administrator access', () => {
  const actor = { id: 1, companyId: 10, role: 'ADMIN', fullName: 'Admin', email: 'admin@example.com' };
  const tx: any = { $queryRaw: vi.fn(), user: { findFirst: vi.fn(), count: vi.fn(), update: vi.fn() }, company: { update: vi.fn() }, auditLog: { create: vi.fn() } };
  const db: any = { $transaction: vi.fn() };
  const service = new CompanyAdminService(db, {} as any);
  beforeEach(() => {
    vi.resetAllMocks();
    db.$transaction.mockImplementation((fn: any) => fn(tx));
    tx.user.findFirst.mockResolvedValueOnce(actor);
  });
  it('rejects non-administrators before accessing the database', async () => {
    await expect(service.member({ ...actor, role: 'HR' }, 2, { role: 'HR', isActive: false })).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('prevents self-lockout', async () => {
    await expect(service.member(actor, 1, { role: 'HR', isActive: false })).rejects.toBeInstanceOf(ConflictException);
  });
  it('does not update a member outside the company', async () => {
    tx.user.findFirst.mockResolvedValueOnce(null);
    await expect(service.member(actor, 22, { role: 'HR', isActive: false })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.user.findFirst).toHaveBeenLastCalledWith({ where: { id: 22, companyId: 10 } });
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('preserves the last active admin', async () => {
    tx.user.findFirst.mockResolvedValueOnce({ id: 2, role: 'ADMIN', isActive: true });
    tx.user.count.mockResolvedValue(1);
    await expect(service.member(actor, 2, { role: 'HR', isActive: false })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('updates member access with a tenant-scoped audit event in the transaction', async () => {
    tx.user.findFirst.mockResolvedValueOnce({ id: 2, role: 'HR', isActive: true });
    await service.member(actor, 2, { role: 'RECRUITER', isActive: false });
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 2, companyId: 10 }, data: { role: 'RECRUITER', isActive: false } }));
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ companyId: 10, userId: 1, action: 'MEMBER_ACCESS_UPDATED' }) });
  });
  it('rejects tenant injection and invalid retention periods', () => {
    expect(companySettingsSchema.safeParse({ name: 'Company', retentionDays: 29 }).success).toBe(false);
    expect(companySettingsSchema.safeParse({ name: 'Company', retentionDays: 180, companyId: 99 }).success).toBe(false);
    expect(memberAccessSchema.safeParse({ role: 'OWNER', isActive: true }).success).toBe(false);
  });
  it('blocks an existing session as soon as its member is disabled', async () => {
    const security: any = { jwt: { verifyAsync: vi.fn().mockResolvedValue({ sub: 2, sid: 'session' }) }, redis: { get: vi.fn().mockResolvedValue('2') }, limit: vi.fn() };
    const database: any = { user: { findUnique: vi.fn().mockResolvedValue({ id: 2, isActive: false }) } };
    const guard = new AuthGuard(security, database);
    const context: any = { switchToHttp: () => ({ getRequest: () => ({ cookies: { session: 'token' } }) }) };
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(security.limit).not.toHaveBeenCalled();
  });
});
