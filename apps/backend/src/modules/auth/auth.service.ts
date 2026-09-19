import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { hash, compare } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { Database } from '../../database/prisma.service';
import { Security, Identity, hashToken } from '../../common/utils/security';
import { admin } from '../../common/guards/auth.guard';
import { acceptInvite, invitation, login, registration } from '../../common/pipes/validation';
import { z } from 'zod';

export const userSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  companyId: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(Security) private security: Security,
  ) {}

  private async limitAuth(action: string, ip: string | undefined, identity: string) {
    const identityHash = hashToken(identity.trim().toLowerCase()).slice(0, 32);
    await this.security.limit(`auth:${action}:${ip ?? 'unknown'}:${identityHash}`, 10, 900);
  }

  async register(data: z.infer<typeof registration>, ip: string | undefined, res: Response) {
    await this.limitAuth('register', ip, data.email);
    const user = await this.db.user.create({
      data: {
        fullName: data.fullName,
        email: data.email,
        password: await hash(data.password, 12),
        role: 'ADMIN',
        company: { create: { name: data.companyName } },
      },
      select: userSelect,
    });
    return this.security.issue(user, res);
  }

  async login(data: z.infer<typeof login>, ip: string | undefined, res: Response) {
    await this.limitAuth('login', ip, data.email);
    const user = await this.db.user.findUnique({ where: { email: data.email } });
    // Fixed valid bcrypt hash ensures unknown accounts also perform password work.
    const valid = await compare(
      data.password,
      user?.password ?? '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW',
    );
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');
    const { password: _, ...safe } = user;
    return this.security.issue(safe, res);
  }

  async me(user: Identity) {
    return {
      ...user,
      company: await this.db.company.findUnique({
        where: { id: user.companyId },
        select: { id: true, name: true },
      }),
      aiConfigured: Boolean(this.security.config.GEMINI_API_KEY),
    };
  }

  async logout(sessionId: string, res: Response) {
    await this.security.logout(sessionId, res);
    return { ok: true };
  }

  async team(user: Identity) {
    admin(user);
    return this.db.user.findMany({ where: { companyId: user.companyId }, select: userSelect });
  }

  async invite(user: Identity, data: z.infer<typeof invitation>) {
    admin(user);
    const token = randomBytes(32).toString('hex');
    await this.db.invitation.create({
      data: {
        ...data,
        companyId: user.companyId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    return {
      inviteUrl: `${this.security.config.FRONTEND_ORIGIN}/?invite=${token}`,
      expiresInHours: 24,
    };
  }

  async accept(data: z.infer<typeof acceptInvite>, ip: string | undefined, res: Response) {
    await this.limitAuth('accept', ip, data.token);
    const hashed = await hash(data.password, 12);
    const user = await this.db.$transaction(async (tx) => {
      const invite = await tx.invitation.findUnique({
        where: { tokenHash: hashToken(data.token) },
      });
      if (!invite || invite.usedAt || invite.expiresAt < new Date())
        throw new UnauthorizedException('Invitation is invalid or expired');
      const claimed = await tx.invitation.updateMany({
        where: { id: invite.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (!claimed.count) throw new UnauthorizedException('Invitation already used');
      return tx.user.create({
        data: {
          fullName: data.fullName,
          email: invite.email,
          password: hashed,
          role: invite.role,
          companyId: invite.companyId,
        },
        select: userSelect,
      });
    });
    return this.security.issue(user, res);
  }
}
