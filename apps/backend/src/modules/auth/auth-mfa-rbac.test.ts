import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service';
import { TotpService } from './totp.service';
import { RbacGuard, Permission, ROLE_PERMISSIONS } from '../../common/guards/rbac.guard';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

describe('MFA & RBAC Integration Tests', () => {
  let authService: AuthService;
  let totpService: TotpService;
  let mockDb: any;
  let mockSecurity: any;
  let redisStore: Map<string, string>;

  beforeEach(() => {
    redisStore = new Map();
    totpService = new TotpService();

    mockDb = {
      user: {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        update: vi.fn(),
      },
    };

    mockSecurity = {
      limit: vi.fn(),
      redis: {
        get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
        set: vi.fn(async (key: string, val: string) => {
          redisStore.set(key, val);
          return 'OK';
        }),
        del: vi.fn(async (key: string) => {
          redisStore.delete(key);
          return 1;
        }),
      },
      issue: vi.fn((user: any) => ({ user, token: 'mock-session-jwt' })),
    };

    authService = new AuthService(mockDb, mockSecurity, totpService);
  });

  describe('MFA Authentication Flow', () => {
    it('requires MFA challenge when user.mfaEnabled is true', async () => {
      const hashedPassword =
        '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'; // "secret"
      mockDb.user.findUnique.mockResolvedValue({
        id: 42,
        email: 'admin@company.com',
        password: hashedPassword,
        mfaEnabled: true,
      });

      const res: any = {};
      const result: any = await authService.login(
        { email: 'admin@company.com', password: 'secret' },
        '127.0.0.1',
        res,
      );

      expect(result.mfaRequired).toBe(true);
      expect(result.challengeToken).toBeDefined();
      expect(mockSecurity.issue).not.toHaveBeenCalled();

      // Check redis stored challenge
      expect(redisStore.get(`mfa:challenge:${result.challengeToken}`)).toBe('42');
    });

    it('completes MFA challenge login with valid 6-digit TOTP code', async () => {
      const secret = totpService.generateSecret();
      const validCode = totpService.generateCode(secret);

      mockDb.user.findUnique.mockResolvedValue({
        id: 42,
        fullName: 'Admin User',
        email: 'admin@company.com',
        role: 'ADMIN',
        companyId: 1,
        mfaEnabled: true,
        mfaSecret: secret,
        mfaRecoveryCodes: [],
      });

      redisStore.set('mfa:challenge:token123', '42');

      const res: any = {};
      const result: any = await authService.verifyMfaLogin('token123', validCode, res);

      expect(result.token).toBe('mock-session-jwt');
      expect(result.user.id).toBe(42);
      expect(redisStore.has('mfa:challenge:token123')).toBe(false);
    });

    it('allows login with one-time emergency recovery code and consumes it', async () => {
      const secret = totpService.generateSecret();
      const { plainCodes, hashedCodes } = totpService.generateRecoveryCodes(4);
      const usedRecoveryCode = plainCodes[0];

      mockDb.user.findUnique.mockResolvedValue({
        id: 42,
        fullName: 'Admin User',
        email: 'admin@company.com',
        role: 'ADMIN',
        companyId: 1,
        mfaEnabled: true,
        mfaSecret: secret,
        mfaRecoveryCodes: [...hashedCodes],
      });

      redisStore.set('mfa:challenge:recov123', '42');

      const res: any = {};
      const result: any = await authService.verifyMfaLogin('recov123', usedRecoveryCode, res);

      expect(result.user.id).toBe(42);
      // Verify db.user.update was called to remove the used recovery code
      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: { mfaRecoveryCodes: hashedCodes.slice(1) },
      });
    });

    it('rejects invalid TOTP code during challenge', async () => {
      const secret = totpService.generateSecret();
      mockDb.user.findUnique.mockResolvedValue({
        id: 42,
        email: 'admin@company.com',
        mfaEnabled: true,
        mfaSecret: secret,
        mfaRecoveryCodes: [],
      });

      redisStore.set('mfa:challenge:badtoken', '42');

      await expect(
        authService.verifyMfaLogin('badtoken', '000000', {} as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('RBAC Permission Matrix & Guard', () => {
    function createMockContext(user: any, handlerRoles?: any[], handlerPermissions?: any[]): ExecutionContext {
      const reflector = {
        getAllAndOverride: vi.fn((key: string) => {
          if (key === 'roles') return handlerRoles;
          if (key === 'permissions') return handlerPermissions;
          return undefined;
        }),
      } as unknown as Reflector;

      const req: any = { user };
      const context = {
        switchToHttp: () => ({
          getRequest: () => req,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      return { context, guard: new RbacGuard(reflector) } as any;
    }

    it('grants ADMIN all permissions across the system', () => {
      const adminPerms = ROLE_PERMISSIONS['ADMIN'];
      expect(adminPerms).toContain(Permission.MANAGE_COMPANY);
      expect(adminPerms).toContain(Permission.MANAGE_TEAM);
      expect(adminPerms).toContain(Permission.VIEW_AUDIT_LOGS);
      expect(adminPerms).toContain(Permission.CONFIGURE_RETENTION);
      expect(adminPerms).toContain(Permission.DELETE_APPLICATIONS);
    });

    it('allows HR to manage vacancies and candidates but forbids team/retention administration', () => {
      const hrPerms = ROLE_PERMISSIONS['HR'];
      expect(hrPerms).toContain(Permission.MANAGE_VACANCIES);
      expect(hrPerms).toContain(Permission.MANAGE_CANDIDATES);
      expect(hrPerms).toContain(Permission.ANONYMIZE_CANDIDATES);
      expect(hrPerms).not.toContain(Permission.MANAGE_TEAM);
      expect(hrPerms).not.toContain(Permission.CONFIGURE_RETENTION);
    });

    it('limits INTERVIEWER strictly to conducting interviews and scorecards', () => {
      const interviewerPerms = ROLE_PERMISSIONS['INTERVIEWER'];
      expect(interviewerPerms).toEqual([
        Permission.CONDUCT_INTERVIEW,
        Permission.SUBMIT_SCORECARD,
      ]);
      expect(interviewerPerms).not.toContain(Permission.MANAGE_CANDIDATES);
      expect(interviewerPerms).not.toContain(Permission.DELETE_APPLICATIONS);
    });

    it('RbacGuard allows authorized role and blocks unauthorized role', () => {
      const { context, guard } = createMockContext({ role: 'RECRUITER' }, ['ADMIN', 'HR']);
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);

      const { context: allowedCtx, guard: allowedGuard } = createMockContext(
        { role: 'HR' },
        ['ADMIN', 'HR'],
      );
      expect(allowedGuard.canActivate(allowedCtx)).toBe(true);
    });

    it('RbacGuard validates required permissions against user role', () => {
      // Recruiter attempting to delete candidate (requires DELETE_CANDIDATES)
      const { context: blockedCtx, guard: blockedGuard } = createMockContext(
        { role: 'RECRUITER' },
        undefined,
        [Permission.DELETE_CANDIDATES],
      );
      expect(() => blockedGuard.canActivate(blockedCtx)).toThrow(ForbiddenException);

      // HR attempting to delete candidate (has DELETE_CANDIDATES)
      const { context: hrCtx, guard: hrGuard } = createMockContext(
        { role: 'HR' },
        undefined,
        [Permission.DELETE_CANDIDATES],
      );
      expect(hrGuard.canActivate(hrCtx)).toBe(true);
    });
  });
});
