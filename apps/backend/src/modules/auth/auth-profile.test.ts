import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import type { Identity } from '../../common/utils/security';

describe('AuthService Profile & Password Update', () => {
  const db = {
    user: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    company: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  const security = {
    redis: {
      del: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
    },
    config: {
      GEMINI_API_KEY: 'test-key',
    },
  };

  const service = new AuthService(db as never, security as never);

  const adminActor: Identity = {
    id: 1,
    fullName: 'Original Name',
    email: 'admin@company.com',
    phone: null,
    role: 'ADMIN',
    companyId: 10,
    isActive: true,
  };

  const hrActor: Identity = {
    id: 2,
    fullName: 'HR Name',
    email: 'hr@company.com',
    phone: null,
    role: 'HR',
    companyId: 10,
    isActive: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates full name and company name when user is ADMIN', async () => {
    db.user.update.mockResolvedValue({
      id: 1,
      fullName: 'Updated Name',
      email: 'admin@company.com',
      phone: null,
      role: 'ADMIN',
      companyId: 10,
      isActive: true,
    });
    db.company.findUnique.mockResolvedValue({
      id: 10,
      name: 'Updated Company Ltd',
    });

    const result = await service.updateProfile(
      adminActor,
      {
        fullName: 'Updated Name',
        companyName: 'Updated Company Ltd',
      },
      'test-session-id',
    );

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { fullName: 'Updated Name' },
      select: expect.any(Object),
    });

    expect(db.company.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { name: 'Updated Company Ltd' },
    });

    expect(security.redis.del).toHaveBeenCalledWith('session-user:test-session-id');
    expect(security.redis.del).toHaveBeenCalledWith('company:10');

    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'COMPANY_SETTINGS_UPDATED',
        companyId: 10,
        userId: 1,
      }),
    });

    expect(result.fullName).toBe('Updated Name');
  });

  it('updates only user full name and ignores company update when user is not ADMIN', async () => {
    db.user.update.mockResolvedValue({
      id: 2,
      fullName: 'Updated HR Name',
      email: 'hr@company.com',
      phone: null,
      role: 'HR',
      companyId: 10,
      isActive: true,
    });
    db.company.findUnique.mockResolvedValue({
      id: 10,
      name: 'Existing Company',
    });

    await service.updateProfile(
      hrActor,
      {
        fullName: 'Updated HR Name',
        companyName: 'Trying to change company',
      },
      'hr-session-id',
    );

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { fullName: 'Updated HR Name' },
      select: expect.any(Object),
    });

    expect(db.company.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('updates password and hashes it with bcrypt', async () => {
    db.user.update.mockResolvedValue({ id: 1 });

    const result = await service.updatePassword(adminActor, {
      password: 'superSecretPassword123',
    });

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { password: expect.stringMatching(/^\$2[aby]\$\d+\$/) },
    });
    expect(result.ok).toBe(true);
  });
});
