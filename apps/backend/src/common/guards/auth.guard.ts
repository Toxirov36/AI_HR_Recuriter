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

    // Redis dan session va user ma'lumotlarini bir vaqtda olish
    let sessionValue: string | null = null;
    let cachedUser: string | null = null;
    try {
      if (typeof this.security?.redis?.mget === 'function') {
        [sessionValue, cachedUser] = await this.security.redis.mget(
          `session:${claims.sid}`,
          `session-user:${claims.sid}`,
        );
      } else if (typeof this.security?.redis?.get === 'function') {
        sessionValue = await this.security.redis.get(`session:${claims.sid}`);
      }
    } catch {
      if (typeof this.security?.unavailable === 'function') {
        this.security.unavailable();
      }
      throw new UnauthorizedException('Session expired');
    }

    if (sessionValue !== String(claims.sub)) throw new UnauthorizedException('Session expired');

    let identity: Identity;

    if (cachedUser) {
      // Cache hit — DB ga murojaat shart emas
      try {
        identity = JSON.parse(cachedUser) as Identity;
      } catch {
        // Buzilgan cache — DB dan qayta yuklaymiz
        identity = await this.loadUserFromDb(claims.sub, claims.sid);
      }
    } else {
      // Cache miss — DB dan yuklab, Redis ga yozamiz
      identity = await this.loadUserFromDb(claims.sub, claims.sid);
    }

    req.user = identity;
    req.sessionId = claims.sid;
    // Rate limiting bu yerda emas — har endpoint o'z chegarasini o'zi boshqaradi.
    // Masalan: AI, auth va resume endpointlari allaqachon security.limit() chaqiradi.
    return true;
  }

  private async loadUserFromDb(userId: number, sid: string): Promise<Identity> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        companyId: true,
        role: true,
        fullName: true,
        email: true,
        phone: true,
        isActive: true,
        platformRole: true,
        company: { select: { isActive: true } },
      },
    });
    if (!user || user.isActive === false || user.company?.isActive === false)
      throw new UnauthorizedException('Account unavailable');
    const { company: _company, ...identity } = user;

    // User Identity ni session bilan bir xil TTL (8 soat) bilan cache qilamiz
    try {
      await this.security.redis.set(
        `session-user:${sid}`,
        JSON.stringify(identity),
        'EX',
        28800,
      );
    } catch {
      // Cache yozish muvaffaqiyatsiz bo'lsa ham davom etamiz
    }

    return identity;
  }
}

