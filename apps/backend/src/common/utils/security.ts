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
  email: string | null;
  phone?: string | null;
  platformRole?: 'SUPER_ADMIN' | null;
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

  /**
   * BullMQ Queue va Worker uchun alohida Redis connection yaratadi.
   * BullMQ blocking commandlar ishlatgani uchun maxRetriesPerRequest: null talab qilinadi
   * va this.redis bilan bir xil ulanishni qayta ishlatib bo'lmaydi.
   * Connection egasi (ResumeQueueService) uni onModuleDestroy da o'zi yopadi.
   */
  createBullMqConnection(): Redis {
    const conn = new Redis(this.config.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    conn.on('error', () => {
      /* BullMQ connection xatolari silent — worker o'zi qayta urinadi. */
    });
    return conn;
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
      // The per-user index lets a password reset close every open session of that user
      await this.redis
        .multi()
        .set(`session:${sid}`, String(user.id), 'EX', 28800)
        .sadd(`user-sessions:${user.id}`, sid)
        .expire(`user-sessions:${user.id}`, 28800)
        .exec();
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

  /** Ends every session the user has open (after a password reset). */
  async revokeUserSessions(userId: number) {
    try {
      const key = `user-sessions:${userId}`;
      const sids = await this.redis.smembers(key);
      const keys = sids.flatMap((sid) => [`session:${sid}`, `session-user:${sid}`]);
      await this.redis.del(key, ...keys);
    } catch {
      this.unavailable();
    }
  }

  async logout(sid: string, res: Response) {
    try {
      // Session va user cache ikkalasini bir vaqtda o'chirish
      const userId = await this.redis.get(`session:${sid}`);
      await this.redis.del(`session:${sid}`, `session-user:${sid}`);
      if (userId) await this.redis.srem(`user-sessions:${userId}`, sid);
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
