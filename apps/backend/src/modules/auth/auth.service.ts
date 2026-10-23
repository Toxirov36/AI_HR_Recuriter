import { textAiProvider } from '../../config/app.config';
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
  phone: true,
  role: true,
  companyId: true,
  isActive: true,
  platformRole: true,
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
    const user = await this.db.user.findUnique({
      where: { email: data.email },
      include: { company: { select: { isActive: true } } },
    });
    // Fixed valid bcrypt hash ensures unknown accounts also perform password work.
    const valid = await compare(
      data.password,
      user?.password ?? '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW',
    );
    if (!user || user.isActive === false || user.company?.isActive === false || !valid)
      throw new UnauthorizedException('Invalid credentials');

    const {
      password: _,
      mfaEnabled: _mfa,
      mfaSecret: _secret,
      mfaRecoveryCodes: _codes,
      googleSubject: _google,
      company: _company,
      ...safe
    } = user;
    return this.security.issue(safe, res);
  }

  async me(user: Identity) {
    const cacheKey = `company:${user.companyId}`;

    // Kompaniya ma'lumotlari kamdan-kam o'zgaradi — 5 daqiqa cache yetarli.
    let company: { id: number; name: string } | null = null;
    try {
      const cached = await this.security.redis.get(cacheKey);
      if (cached) {
        company = JSON.parse(cached) as { id: number; name: string };
      }
    } catch {
      // Redis mavjud bo'lmasa DB dan yuklaymiz
    }

    if (!company) {
      company = await this.db.company.findUnique({
        where: { id: user.companyId },
        select: { id: true, name: true },
      });
      if (company) {
        try {
          await this.security.redis.set(cacheKey, JSON.stringify(company), 'EX', 300);
        } catch {
          // Cache yozish muvaffaqiyatsiz — davom etamiz
        }
      }
    }

    return {
      ...user,
      company,
      aiConfigured: Boolean(textAiProvider(this.security.config)),
    };
  }

  async updateProfile(user: Identity, data: { fullName: string; companyName?: string }, sessionId?: string) {
    const updatedUser = await this.db.user.update({
      where: { id: user.id },
      data: { fullName: data.fullName },
      select: userSelect,
    });

    if (sessionId) {
      try {
        await this.security.redis.del(`session-user:${sessionId}`);
      } catch {}
    }

    if (data.companyName && user.role === 'ADMIN' && data.companyName.trim()) {
      await this.db.company.update({
        where: { id: user.companyId },
        data: { name: data.companyName.trim() },
      });
      try {
        await this.security.redis.del(`company:${user.companyId}`);
      } catch {}
      await this.db.auditLog.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          actorName: updatedUser.fullName,
          actorRole: updatedUser.role,
          action: 'COMPANY_SETTINGS_UPDATED',
          resourceType: 'COMPANY',
          resourceId: String(user.companyId),
          details: { name: data.companyName.trim() },
        },
      });
    }

    return this.me(updatedUser);
  }

  async updatePassword(user: Identity, data: { password: string }) {
    const hashedPassword = await hash(data.password, 12);
    await this.db.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });
    return { ok: true };
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
      inviteUrl: `${this.security.config.FRONTEND_ORIGIN}/register?invite=${token}`,
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
      const company = await tx.company.findUnique({
        where: { id: invite.companyId },
        select: { isActive: true },
      });
      if (!company?.isActive) throw new UnauthorizedException('Invitation is unavailable');
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
