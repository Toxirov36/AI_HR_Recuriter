import { textAiProvider } from '../../config/app.config';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { hash, compare } from 'bcryptjs';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Database } from '../../database/prisma.service';
import { Security, Identity, hashToken } from '../../common/utils/security';
import { admin } from '../../common/guards/auth.guard';
import {
  acceptInvite,
  invitation,
  login,
  passwordResetConfirm,
  passwordResetRequest,
  registration,
} from '../../common/pipes/validation';
import { EmailService } from '../notifications/email.service';
import { passwordResetEmail } from './password-reset-email';
import { z } from 'zod';

const RESET_TTL_SECONDS = 900;
const RESET_MAX_ATTEMPTS = 5;

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
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(Database) private db: Database,
    @Inject(Security) private security: Security,
    @Inject(EmailService) private email: EmailService,
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

  private resetKeys(email: string) {
    const id = hashToken(email);
    return { code: `pwreset:${id}`, attempts: `pwreset-attempts:${id}` };
  }

  /**
   * Emails a 6-digit code when the address belongs to an active account. The answer is the same either way
   * and the email is sent in the background, so the response doesn't reveal which addresses are registered.
   */
  async requestPasswordReset(data: z.infer<typeof passwordResetRequest>, ip: string | undefined) {
    await this.limitAuth('reset-request', ip, data.email);
    await this.security.limit(`auth:reset-email:${hashToken(data.email).slice(0, 32)}`, 3, RESET_TTL_SECONDS);
    const user = await this.db.user.findUnique({
      where: { email: data.email },
      select: { id: true, email: true, isActive: true, company: { select: { isActive: true } } },
    });
    if (!user?.email || !user.isActive || user.company?.isActive === false) return { ok: true };

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const keys = this.resetKeys(data.email);
    try {
      // A new code replaces the previous one and starts the attempt count again
      await this.security.redis
        .multi()
        .set(keys.code, JSON.stringify({ userId: user.id, codeHash: hashToken(`${user.id}:${code}`) }), 'EX', RESET_TTL_SECONDS)
        .del(keys.attempts)
        .exec();
    } catch {
      this.security.unavailable();
    }
    void this.email
      .sendMail({ to: user.email, ...passwordResetEmail(code, data.lang) })
      .then((result) => {
        if (!result.success) this.logger.warn(`Password reset email was not sent: ${result.error}`);
      });
    return { ok: true };
  }

  /** Checks the code (5 tries per code), sets the new password and ends all of the user's sessions. */
  async confirmPasswordReset(data: z.infer<typeof passwordResetConfirm>, ip: string | undefined) {
    await this.limitAuth('reset-confirm', ip, data.email);
    const invalid = () => new BadRequestException('The code is invalid or expired');
    const keys = this.resetKeys(data.email);
    let entry: { userId: number; codeHash: string } | null = null;
    let attempts = 0;
    try {
      const raw = await this.security.redis.get(keys.code);
      if (!raw) throw invalid();
      entry = JSON.parse(raw) as { userId: number; codeHash: string };
      attempts = await this.security.redis.incr(keys.attempts);
      if (attempts === 1) await this.security.redis.expire(keys.attempts, RESET_TTL_SECONDS);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.security.unavailable();
    }
    if (!entry) throw invalid();

    const expected = Buffer.from(entry.codeHash);
    const given = Buffer.from(hashToken(`${entry.userId}:${data.code}`));
    const matches = attempts <= RESET_MAX_ATTEMPTS && timingSafeEqual(expected, given);
    if (!matches) {
      if (attempts >= RESET_MAX_ATTEMPTS) await this.security.redis.del(keys.code, keys.attempts).catch(() => 0);
      throw invalid();
    }
    // Deleting the key claims the code, so two requests with the same code can't both succeed
    const claimed = await this.security.redis.del(keys.code).catch(() => 0);
    if (!claimed) throw invalid();
    await this.security.redis.del(keys.attempts).catch(() => 0);

    const updated = await this.db.user.updateMany({
      where: { id: entry.userId, email: data.email, isActive: true },
      data: { password: await hash(data.password, 12) },
    });
    if (!updated.count) throw invalid();
    await this.security.revokeUserSessions(entry.userId);
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
