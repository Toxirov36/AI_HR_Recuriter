import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PlatformAdminService, platformQuery, companyStatusSchema } from './platform-admin.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { memberAccessSchema } from '../company-admin/company-admin.service';
import { registration } from '../../common/pipes/validation';

describe('platform administrator boundaries', () => {
  const actor = {
    id: 1,
    companyId: 10,
    role: 'ADMIN',
    platformRole: 'SUPER_ADMIN' as const,
    fullName: 'Operator',
    email: 'operator@example.com',
  };
  const input = { isActive: false, expectedIsActive: true, reason: 'Operator review' };
  const tx: any = {
    $queryRaw: vi.fn(),
    user: { findFirst: vi.fn() },
    company: { findUnique: vi.fn(), update: vi.fn() },
    platformAuditLog: { create: vi.fn() },
  };
  const db: any = { $transaction: vi.fn() };
  const service = new PlatformAdminService(db);
  beforeEach(() => {
    vi.resetAllMocks();
    db.$transaction.mockImplementation((fn: any) => fn(tx));
    tx.user.findFirst.mockResolvedValueOnce({ id: 1 }).mockResolvedValue(null);
    tx.company.findUnique.mockResolvedValue({ id: 20, name: 'Tenant', isActive: true });
  });
  it('denies ordinary company administrators on every operation', async () => {
    const regular = { ...actor, platformRole: null };
    for (const operation of [
      () => service.overview(regular),
      () => service.companies(regular, platformQuery.parse({})),
      () => service.setStatus(regular, 20, input),
      () => service.audit(regular, 1),
    ]) {
      await expect(operation()).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('prevents self-company lockout', async () => {
    await expect(service.setStatus(actor, 10, input)).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects nonexistent companies without recording a change', async () => {
    tx.company.findUnique.mockResolvedValue(null);
    await expect(service.setStatus(actor, 20, input)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.company.update).not.toHaveBeenCalled();
  });
  it('rejects stale edits', async () => {
    tx.company.findUnique.mockResolvedValue({ id: 20, isActive: false });
    await expect(service.setStatus(actor, 20, input)).rejects.toBeInstanceOf(ConflictException);
  });
  it('protects companies containing platform administrators', async () => {
    tx.user.findFirst.mockReset().mockResolvedValue({ id: 1 });
    await expect(service.setStatus(actor, 20, input)).rejects.toBeInstanceOf(ConflictException);
  });
  it('records the reason and actor in the same transaction as suspension', async () => {
    await service.setStatus(actor, 20, input);
    expect(tx.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 20 }, data: { isActive: false } }),
    );
    expect(tx.platformAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 1,
        companyId: 20,
        action: 'COMPANY_BLOCKED',
        reason: input.reason,
        previousActive: true,
        newActive: false,
      }),
    });
  });
  it('rejects role injection, invalid pagination and missing reasons', () => {
    expect(
      memberAccessSchema.safeParse({ role: 'ADMIN', isActive: true, platformRole: 'SUPER_ADMIN' })
        .success,
    ).toBe(false);
    expect(
      registration.safeParse({
        companyName: 'Demo',
        fullName: 'Test',
        email: 'a@example.com',
        password: 'long-password',
        platformRole: 'SUPER_ADMIN',
      }).success,
    ).toBe(false);
    expect(companyStatusSchema.safeParse({ ...input, reason: ' ' }).success).toBe(true);
    expect(companyStatusSchema.safeParse({ ...input, unknownField: true }).success).toBe(false);
  });
  it('rejects an existing session in a suspended company', async () => {
    const security: any = {
      jwt: { verifyAsync: vi.fn().mockResolvedValue({ sub: 2, sid: 'session' }) },
      redis: { get: vi.fn().mockResolvedValue('2') },
      limit: vi.fn(),
    };
    const database: any = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 2, isActive: true, company: { isActive: false } }),
      },
    };
    const context: any = {
      switchToHttp: () => ({ getRequest: () => ({ cookies: { session: 'token' } }) }),
    };
    await expect(new AuthGuard(security, database).canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
