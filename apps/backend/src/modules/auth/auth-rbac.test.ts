import { describe, expect, it, vi } from 'vitest';
import { RbacGuard, Permission, ROLE_PERMISSIONS } from '../../common/guards/rbac.guard';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

describe('RBAC Permission Matrix & Guard', () => {
  function createMockContext(
    user: any,
    handlerRoles?: any[],
    handlerPermissions?: any[],
  ): ExecutionContext {
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
    expect(interviewerPerms).toEqual([Permission.CONDUCT_INTERVIEW, Permission.SUBMIT_SCORECARD]);
    expect(interviewerPerms).not.toContain(Permission.MANAGE_CANDIDATES);
    expect(interviewerPerms).not.toContain(Permission.DELETE_APPLICATIONS);
  });

  it('RbacGuard allows authorized role and blocks unauthorized role', () => {
    const { context, guard } = createMockContext({ role: 'RECRUITER' }, ['ADMIN', 'HR']);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);

    const { context: allowedCtx, guard: allowedGuard } = createMockContext({ role: 'HR' }, [
      'ADMIN',
      'HR',
    ]);
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
    const { context: hrCtx, guard: hrGuard } = createMockContext({ role: 'HR' }, undefined, [
      Permission.DELETE_CANDIDATES,
    ]);
    expect(hrGuard.canActivate(hrCtx)).toBe(true);
  });
});
