import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, HttpException } from '@nestjs/common';
import { compare } from 'bcryptjs';
import { passwordResetConfirm, passwordResetRequest } from '../../common/pipes/validation';
import { AuthService } from './auth.service';

/** Just enough of ioredis for the reset flow, kept in memory. */
function fakeRedis() {
  const store = new Map<string, string>();
  const redis = {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (...keys: string[]) => keys.filter((key) => store.delete(key)).length),
    incr: vi.fn(async (key: string) => {
      const next = Number(store.get(key) ?? 0) + 1;
      store.set(key, String(next));
      return next;
    }),
    expire: vi.fn(async () => 1),
    multi: () => {
      const ops: Array<() => Promise<unknown>> = [];
      const chain = {
        set: (key: string, value: string) => (ops.push(() => redis.set(key, value)), chain),
        del: (...keys: string[]) => (ops.push(() => redis.del(...keys)), chain),
        exec: async () => {
          for (const op of ops) await op();
          return [];
        },
      };
      return chain;
    },
  };
  return redis;
}

const user = { id: 7, email: 'hr@test.com', isActive: true, company: { isActive: true } };

describe('password reset by email code', () => {
  let redis: ReturnType<typeof fakeRedis>;
  let limits: Map<string, number>;
  const db = { user: { findUnique: vi.fn(), updateMany: vi.fn() } };
  const email = { sendMail: vi.fn() };
  const security = {
    redis: undefined as unknown as ReturnType<typeof fakeRedis>,
    limit: vi.fn(),
    unavailable: vi.fn(() => {
      throw new Error('unavailable');
    }),
    revokeUserSessions: vi.fn(),
  };
  const service = new AuthService(db as never, security as never, email as never);

  const request = (address = 'HR@test.com') =>
    service.requestPasswordReset(passwordResetRequest.parse({ email: address, lang: 'ru' }), '1.1.1.1');
  const sentCode = () => /\b(\d{6})\b/.exec(email.sendMail.mock.calls.at(-1)![0].text)![1];
  const confirm = (code: string, password = 'new-password-1') =>
    service.confirmPasswordReset(
      passwordResetConfirm.parse({ email: 'hr@test.com', code, password }),
      '1.1.1.1',
    );

  beforeEach(() => {
    vi.clearAllMocks();
    redis = fakeRedis();
    security.redis = redis;
    limits = new Map();
    security.limit.mockImplementation(async (key: string, max: number) => {
      const count = (limits.get(key) ?? 0) + 1;
      limits.set(key, count);
      if (count > max) throw new HttpException('Too many requests', 429);
    });
    db.user.findUnique.mockResolvedValue(user);
    db.user.updateMany.mockResolvedValue({ count: 1 });
    email.sendMail.mockResolvedValue({ success: true });
  });

  it('answers the same for unknown addresses and sends nothing', async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(request('nobody@test.com')).resolves.toEqual({ ok: true });
    expect(email.sendMail).not.toHaveBeenCalled();
    expect(redis.store.size).toBe(0);
  });

  it('does not send a code to a deactivated account', async () => {
    db.user.findUnique.mockResolvedValue({ ...user, isActive: false });
    await expect(request()).resolves.toEqual({ ok: true });
    expect(email.sendMail).not.toHaveBeenCalled();
  });

  it('emails a 6-digit code in the page language and stores only its hash', async () => {
    await expect(request()).resolves.toEqual({ ok: true });
    const mail = email.sendMail.mock.calls[0][0];
    expect(mail.to).toBe('hr@test.com');
    expect(mail.subject).toContain('пароля');
    const code = sentCode();
    expect([...redis.store.values()].join()).not.toContain(code);
  });

  it('sets the new password, closes every session and accepts the code once', async () => {
    await request();
    const code = sentCode();
    await expect(confirm(code)).resolves.toEqual({ ok: true });
    const { where, data } = db.user.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: 7, email: 'hr@test.com', isActive: true });
    expect(await compare('new-password-1', data.password)).toBe(true);
    expect(security.revokeUserSessions).toHaveBeenCalledWith(7);
    await expect(confirm(code)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cancels the code after 5 wrong tries', async () => {
    await request();
    const code = sentCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await expect(confirm(wrong)).rejects.toBeInstanceOf(BadRequestException);
    await expect(confirm(code)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it('a new code replaces the old one', async () => {
    await request();
    const first = sentCode();
    await request();
    const second = sentCode();
    if (first !== second) await expect(confirm(first)).rejects.toBeInstanceOf(BadRequestException);
    await expect(confirm(second)).resolves.toEqual({ ok: true });
  });

  it('rejects an expired or never requested code', async () => {
    await expect(confirm('123456')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('limits code requests to 3 per address in 15 minutes', async () => {
    for (let i = 0; i < 3; i++) await request();
    await expect(request()).rejects.toMatchObject({ status: 429 });
  });

  it('validates the code format and the new password', () => {
    expect(passwordResetConfirm.safeParse({ email: 'a@test.com', code: '12345', password: 'long-enough' }).success).toBe(false);
    expect(passwordResetConfirm.safeParse({ email: 'a@test.com', code: '123456', password: 'short' }).success).toBe(false);
    expect(passwordResetConfirm.safeParse({ email: 'a@test.com', code: '123456', password: 'long-enough' }).success).toBe(true);
  });
});
