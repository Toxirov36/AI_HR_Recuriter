import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { hash, compare } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { Database } from '../../database/prisma.service';
import { Security, Identity, hashToken } from '../../common/utils/security';
import { admin } from '../../common/guards/auth.guard';
import { acceptInvite, invitation, login, registration } from '../../common/pipes/validation';
import { z } from 'zod';

import { TotpService } from './totp.service';

export const userSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  companyId: true,
  mfaEnabled: true,
  isActive: true,
  platformRole: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(Security) private security: Security,
    @Inject(TotpService) private totp: TotpService,
  ) {}

  private async limitAuth(action: string, ip: string | undefined, identity: string) {
    const identityHash = hashToken(identity.trim().toLowerCase()).slice(0, 32);
    await this.security.limit(`auth:${action}:${ip ?? 'unknown'}:${identityHash}`, 10, 900);
  }

  async register(data: z.infer<typeof registration>, ip: string | undefined, res: Response) {
    await this.limitAuth('register', ip, data.email ?? data.phone!);
    const user = await this.db.user.create({
      data: {
        fullName: data.fullName,
        email: data.email ?? null,
        phone: data.phone ?? null,
        password: await hash(data.password, 12),
        role: 'ADMIN',
        company: { create: { name: data.companyName } },
      },
      select: userSelect,
    });
    return this.security.issue(user, res);
  }

  async login(data: z.infer<typeof login>, ip: string | undefined, res: Response) {
    await this.limitAuth('login', ip, data.email ?? data.phone!);
    const user = await this.db.user.findUnique({
      where: data.email ? { email: data.email } : { phone: data.phone! },
      include: { company: { select: { isActive: true } } },
    });
    // Fixed valid bcrypt hash ensures unknown accounts also perform password work.
    const valid = await compare(
      data.password,
      user?.password ?? '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW',
    );
    if (!user || user.isActive === false || user.company?.isActive === false || !valid) throw new UnauthorizedException('Invalid credentials');

    if (user.mfaEnabled) {
      const challengeToken = randomBytes(32).toString('hex');
      await this.security.redis.set(`mfa:challenge:${challengeToken}`, String(user.id), 'EX', 300);
      return { mfaRequired: true, challengeToken };
    }

    const { password: _, mfaSecret: _secret, mfaRecoveryCodes: _codes, company: _company, ...safe } = user;
    return this.security.issue(safe, res);
  }

  async setupMfa(userId: number) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = this.totp.generateSecret();
    await this.security.redis.set(`mfa:setup:${userId}`, secret, 'EX', 600);
    const otpAuthUri = this.totp.getOtpAuthUri(user.email ?? user.phone ?? String(user.id), secret, 'Shortlist HR');
    return { secret, otpAuthUri };
  }

  async enableMfa(userId: number, code: string) {
    const secret = await this.security.redis.get(`mfa:setup:${userId}`);
    if (!secret) throw new UnauthorizedException('MFA setup session expired. Start setup again.');
    if (!this.totp.verifyCode(code, secret)) {
      throw new UnauthorizedException('Invalid 6-digit code. Check your authenticator app.');
    }
    const { plainCodes, hashedCodes } = this.totp.generateRecoveryCodes(8);
    await this.db.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaSecret: secret,
        mfaRecoveryCodes: hashedCodes,
      },
    });
    await this.security.redis.del(`mfa:setup:${userId}`);
    return { enabled: true, recoveryCodes: plainCodes };
  }

  async verifyMfaLogin(challengeToken: string, code: string, res: Response) {
    const userIdStr = await this.security.redis.get(`mfa:challenge:${challengeToken}`);
    if (!userIdStr) throw new UnauthorizedException('MFA challenge expired or invalid');
    const user = await this.db.user.findUnique({ where: { id: parseInt(userIdStr, 10) }, include: { company: { select: { isActive: true } } } });
    if (!user || user.isActive === false || user.company?.isActive === false || !user.mfaSecret) throw new UnauthorizedException('MFA not configured');

    const isTotpValid = this.totp.verifyCode(code, user.mfaSecret);
    const recIndex = !isTotpValid ? this.totp.findRecoveryCodeIndex(code, user.mfaRecoveryCodes) : -1;

    if (!isTotpValid && recIndex === -1) {
      throw new UnauthorizedException('Invalid 6-digit code or recovery code');
    }

    if (recIndex !== -1) {
      const updatedCodes = [...user.mfaRecoveryCodes];
      updatedCodes.splice(recIndex, 1);
      await this.db.user.update({
        where: { id: user.id },
        data: { mfaRecoveryCodes: updatedCodes },
      });
    }

    await this.security.redis.del(`mfa:challenge:${challengeToken}`);
    const { password: _, mfaSecret: _secret, mfaRecoveryCodes: _codes, company: _company, ...safe } = user;
    return this.security.issue(safe, res);
  }

  async disableMfa(userId: number, password: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid password');
    await this.db.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaRecoveryCodes: [],
      },
    });
    return { disabled: true };
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
      const company = await tx.company.findUnique({ where: { id: invite.companyId }, select: { isActive: true } });
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
