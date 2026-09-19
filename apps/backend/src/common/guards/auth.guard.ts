import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { Security, Identity, AuthRequest } from '../utils/security';

export { Identity, AuthRequest };

export function admin(user: Identity) {
  if (user.role !== 'ADMIN') throw new ForbiddenException('Company administrator access required');
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Security) protected security: Security,
    @Inject(Database) protected db: Database,
  ) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    let claims: { sub: number; sid: string };
    try {
      claims = await this.security.jwt.verifyAsync(req.cookies?.session ?? '', {
        issuer: 'recruiter',
        audience: 'recruiter-web',
      });
    } catch {
      throw new UnauthorizedException('Please sign in');
    }
    let active: string | null;
    try {
      active = await this.security.redis.get(`session:${claims.sid}`);
    } catch {
      this.security.unavailable();
    }
    if (active !== String(claims.sub)) throw new UnauthorizedException('Session expired');
    const user = await this.db.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, companyId: true, role: true, fullName: true, email: true },
    });
    if (!user) throw new UnauthorizedException();
    req.user = user;
    req.sessionId = claims.sid;
    await this.security.limit(`user:${user.id}`);
    return true;
  }
}
