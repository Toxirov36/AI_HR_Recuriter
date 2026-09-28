import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthRequest } from '../utils/security';

export type UserRoleType = 'ADMIN' | 'HR' | 'RECRUITER' | 'INTERVIEWER';

export enum Permission {
  MANAGE_COMPANY = 'MANAGE_COMPANY',
  MANAGE_TEAM = 'MANAGE_TEAM',
  VIEW_AUDIT_LOGS = 'VIEW_AUDIT_LOGS',
  EXPORT_AUDIT_LOGS = 'EXPORT_AUDIT_LOGS',
  CONFIGURE_RETENTION = 'CONFIGURE_RETENTION',
  PURGE_RETENTION = 'PURGE_RETENTION',
  MANAGE_VACANCIES = 'MANAGE_VACANCIES',
  DELETE_VACANCIES = 'DELETE_VACANCIES',
  MANAGE_CANDIDATES = 'MANAGE_CANDIDATES',
  DELETE_CANDIDATES = 'DELETE_CANDIDATES',
  ANONYMIZE_CANDIDATES = 'ANONYMIZE_CANDIDATES',
  MANAGE_APPLICATIONS = 'MANAGE_APPLICATIONS',
  DELETE_APPLICATIONS = 'DELETE_APPLICATIONS',
  CONDUCT_INTERVIEW = 'CONDUCT_INTERVIEW',
  SUBMIT_SCORECARD = 'SUBMIT_SCORECARD',
}

export const ROLE_PERMISSIONS: Record<UserRoleType, Permission[]> = {
  ADMIN: Object.values(Permission),
  HR: [
    Permission.MANAGE_VACANCIES,
    Permission.DELETE_VACANCIES,
    Permission.MANAGE_CANDIDATES,
    Permission.DELETE_CANDIDATES,
    Permission.ANONYMIZE_CANDIDATES,
    Permission.MANAGE_APPLICATIONS,
    Permission.DELETE_APPLICATIONS,
    Permission.CONDUCT_INTERVIEW,
    Permission.SUBMIT_SCORECARD,
  ],
  RECRUITER: [
    Permission.MANAGE_CANDIDATES,
    Permission.MANAGE_APPLICATIONS,
    Permission.CONDUCT_INTERVIEW,
    Permission.SUBMIT_SCORECARD,
  ],
  INTERVIEWER: [
    Permission.CONDUCT_INTERVIEW,
    Permission.SUBMIT_SCORECARD,
  ],
};

export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';

export const Roles = (...roles: UserRoleType[]) => SetMetadata(ROLES_KEY, roles);
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

@Injectable()
export class RbacGuard implements CanActivate {
  private reflector: Reflector;

  constructor(@Optional() reflector?: Reflector) {
    this.reflector = reflector || new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRoleType[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredPermissions = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles or permissions specified on endpoint, pass through
    if (!requiredRoles?.length && !requiredPermissions?.length) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthRequest>();
    const user = req.user;

    if (!user || !user.role) {
      throw new ForbiddenException('Access denied: Authentication required');
    }

    const userRole = user.role as UserRoleType;

    // 1. Role match
    if (requiredRoles?.length) {
      const hasRole = requiredRoles.includes(userRole);
      if (!hasRole) {
        throw new ForbiddenException(
          `Access denied: Required role [${requiredRoles.join(', ')}]. Your role: ${userRole}`,
        );
      }
    }

    // 2. Permission match
    if (requiredPermissions?.length) {
      const grantedPermissions = ROLE_PERMISSIONS[userRole] || [];
      const hasAllPermissions = requiredPermissions.every((perm) =>
        grantedPermissions.includes(perm),
      );

      if (!hasAllPermissions) {
        throw new ForbiddenException(
          `Access denied: Missing required permission for role ${userRole}`,
        );
      }
    }

    return true;
  }
}
