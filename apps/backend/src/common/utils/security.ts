import {
  HttpException,
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import Redis from 'ioredis';
import { Request, Response } from 'express';
import { getConfig } from '../../config/app.config';

export type Identity = {
  id: number;
  companyId: number;
  role: string;
  fullName: string;
  email: string;
};

export type AuthRequest = Request & { user: Identity; sessionId: string };

export const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class Security implements OnModuleDestroy {
  readonly redis: Redis;
  readonly jwt: JwtService;
  readonly config = getConfig();

  constructor() {
    this.redis = new Redis(this.config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });
    this.redis.on('error', () => {
      /* Never log credentials or connection URLs. Health endpoint reports unavailability. */
    });
    this.jwt = new JwtService({
      secret: this.config.JWT_SECRET,
      signOptions: { expiresIn: '8h', issuer: 'recruiter', audience: 'recruiter-web' },
    });
  }

  async onModuleDestroy() {
    this.redis.disconnect();
  }

  unavailable(): never {
    throw new ServiceUnavailableException(
      this.config.NODE_ENV === 'production'
        ? 'Session service unavailable'
        : 'Redis session service is unavailable. Start Redis in WSL with "sudo service redis-server start" and check REDIS_URL.',
    );
  }

  async limit(key: string, max = 100, seconds = 60) {
    try {
      const count = (await this.redis.eval(
        'local n = redis.call("INCR", KEYS[1]); if n == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end; return n',
        1,
        `limit:${key}`,
        seconds,
      )) as number;
      if (count > max) throw new HttpException('Too many requests. Try again shortly.', 429);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.unavailable();
    }
  }

  async issue(user: Identity, res: Response) {
    const sid = randomBytes(32).toString('hex');
    try {
      await this.redis.set(`session:${sid}`, String(user.id), 'EX', 28800);
    } catch {
      this.unavailable();
    }
    const token = await this.jwt.signAsync({ sub: user.id, sid });
    res.cookie('session', token, {
      httpOnly: true,
      secure: this.config.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api',
      maxAge: 28800000,
    });
    return user;
  }

  async logout(sid: string, res: Response) {
    try {
      await this.redis.del(`session:${sid}`);
    } catch {
      this.unavailable();
    }
    res.clearCookie('session', {
      httpOnly: true,
      secure: this.config.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api',
    });
  }
}
