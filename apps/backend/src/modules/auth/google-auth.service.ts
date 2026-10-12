import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { randomBytes } from 'node:crypto';
import { hash } from 'bcryptjs';
import type { Request, Response } from 'express';
import { Database } from '../../database/prisma.service';
import { Security, hashToken } from '../../common/utils/security';
import { userSelect } from './auth.service';
import type { GoogleRegisterDto } from './dto/google.dto';

const cookieName = 'google_signin';
type GoogleIdentity = { subject: string; email: string; fullName: string; authoritative: boolean };
type Signup = GoogleIdentity & { browser: string };

@Injectable()
export class GoogleAuthService {
  private readonly client = new OAuth2Client();
  constructor(
    @Inject(Database) private db: Database,
    @Inject(Security) private security: Security,
  ) {}

  config() {
    return {
      configured: Boolean(this.security.config.GOOGLE_CLIENT_ID),
      clientId: this.security.config.GOOGLE_CLIENT_ID || null,
    };
  }

  private configuredClientId() {
    const id = this.security.config.GOOGLE_CLIENT_ID;
    if (!id) throw new ServiceUnavailableException('Google orqali kirish hozircha mavjud emas.');
    return id;
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.security.config.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/api/auth/google',
    };
  }

  async challenge(ip: string | undefined, res: Response) {
    this.configuredClientId();
    await this.security.limit(`google:challenge:${ip || 'unknown'}`, 30, 900);
    const browser = randomBytes(32).toString('hex');
    const nonce = randomBytes(32).toString('hex');
    await this.security.redis.set(`google:nonce:${hashToken(browser)}`, nonce, 'EX', 600);
    res.cookie(cookieName, browser, { ...this.cookieOptions(), maxAge: 600000 });
    return { nonce };
  }

  async verify(credential: string, req: Request, res: Response) {
    const audience = this.configuredClientId();
    await this.security.limit(`google:verify:${req.ip || 'unknown'}`, 20, 900);
    const browser = req.cookies?.[cookieName];
    if (typeof browser !== 'string' || !/^[a-f0-9]{64}$/.test(browser))
      throw new UnauthorizedException('Google kirish sessiyasi tugagan. Qayta urinib ko‘ring.');
    let payload: TokenPayload & { nonce?: string };
    try {
      const ticket = await this.client.verifyIdToken({ idToken: credential, audience });
      payload = ticket.getPayload()!;
      if (!payload?.sub || !payload.email || payload.email_verified !== true)
        throw new Error('Unverified identity');
    } catch {
      throw new UnauthorizedException('Google hisobini tasdiqlab bo‘lmadi. Qayta urinib ko‘ring.');
    }
    const key = `google:nonce:${hashToken(browser)}`;
    const nonce = await this.security.redis.get(key);
    if (!nonce || payload.nonce !== nonce)
      throw new UnauthorizedException('Google kirish sessiyasi mos kelmadi. Qayta urinib ko‘ring.');
    if ((await this.security.redis.getdel(key)) !== nonce)
      throw new UnauthorizedException('Google kirish so‘rovi allaqachon ishlatilgan.');

    const identity: GoogleIdentity = {
      subject: payload.sub,
      email: payload.email!.toLowerCase(),
      fullName: (payload.name || payload.email!).slice(0, 160),
      authoritative: payload.email!.toLowerCase().endsWith('@gmail.com') || Boolean(payload.hd),
    };
    const select = {
      ...userSelect,
      googleSubject: true,
      company: { select: { isActive: true } },
    } as const;
    let user = await this.db.user.findUnique({
      where: { googleSubject: identity.subject },
      select,
    });
    if (!user) {
      user = await this.db.user.findUnique({ where: { email: identity.email }, select });
      if (user) {
        if (
          !identity.authoritative ||
          (user.googleSubject && user.googleSubject !== identity.subject)
        ) {
          throw new UnauthorizedException(
            'Bu hisobga email va parol orqali kiring. Google bilan avtomatik ulash mumkin emas.',
          );
        }
        if (!user.isActive || !user.company.isActive)
          throw new UnauthorizedException('Hisob faol emas.');
        // A concurrent link to another Google subject must never be overwritten.
        const linked = await this.db.user.updateMany({
          where: { id: user.id, googleSubject: null, isActive: true, company: { isActive: true } },
          data: { googleSubject: identity.subject },
        });
        if (!linked.count)
          throw new UnauthorizedException(
            'Google hisobini ulash bajarilmadi. Qayta urinib ko‘ring.',
          );
      }
    }
    if (user) {
      if (!user.isActive || !user.company.isActive)
        throw new UnauthorizedException('Hisob faol emas.');
      res.clearCookie(cookieName, this.cookieOptions());
      const { googleSubject: _subject, company: _company, ...safe } = user;
      return this.security.issue(safe, res);
    }

    const signupToken = randomBytes(32).toString('hex');
    await this.security.redis.set(
      `google:signup:${hashToken(signupToken)}`,
      JSON.stringify({ ...identity, browser: hashToken(browser) } satisfies Signup),
      'EX',
      600,
    );
    return {
      googleRegistrationRequired: true as const,
      signupToken,
      email: identity.email,
      fullName: identity.fullName,
    };
  }

  async register(data: GoogleRegisterDto, req: Request, res: Response) {
    this.configuredClientId();
    await this.security.limit(`google:register:${req.ip || 'unknown'}`, 10, 900);
    const browser = req.cookies?.[cookieName];
    const key = `google:signup:${hashToken(data.signupToken)}`;
    const saved = await this.security.redis.get(key);
    if (!saved || typeof browser !== 'string')
      throw new UnauthorizedException(
        'Ro‘yxatdan o‘tish sessiyasi tugagan. Google hisobingizni qayta tanlang.',
      );
    const identity = JSON.parse(saved) as Signup;
    if (identity.browser !== hashToken(browser))
      throw new UnauthorizedException('Ro‘yxatdan o‘tish sessiyasi mos kelmadi.');
    if ((await this.security.redis.getdel(key)) !== saved)
      throw new UnauthorizedException('Ro‘yxatdan o‘tish so‘rovi allaqachon ishlatilgan.');
    let user;
    try {
      user = await this.db.user.create({
        data: {
          email: identity.email,
          googleSubject: identity.subject,
          fullName: data.fullName,
          password: await hash(randomBytes(32).toString('hex'), 12),
          role: 'ADMIN',
          company: { create: { name: data.companyName } },
        },
        select: userSelect,
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictException('Hisob allaqachon mavjud. Google orqali qayta kiring.');
      throw error;
    }
    res.clearCookie(cookieName, this.cookieOptions());
    return this.security.issue(user, res);
  }
}
