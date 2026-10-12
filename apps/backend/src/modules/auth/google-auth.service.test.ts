import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { GoogleAuthService } from './google-auth.service';
const google = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = google.verify;
  },
}));

function fixture() {
  const store = new Map<string, string>();
  const db = {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn(),
    },
  };
  const security = {
    config: { GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com', NODE_ENV: 'production' },
    limit: vi.fn(),
    issue: vi.fn(async (user) => user),
    redis: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      getdel: vi.fn(async (key: string) => {
        const value = store.get(key) ?? null;
        store.delete(key);
        return value;
      }),
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
    },
  };
  const service = new GoogleAuthService(db as never, security as never);
  const response = { cookie: vi.fn(), clearCookie: vi.fn() };
  const payload = {
    sub: 'google-123',
    email: 'member@gmail.com',
    email_verified: true,
    name: 'Google Member',
    nonce: '',
  };
  google.verify.mockResolvedValue({ getPayload: () => payload });
  async function challenge() {
    payload.nonce = (await service.challenge('127.0.0.1', response as never)).nonce;
    const browser = response.cookie.mock.calls.at(-1)![1];
    return { ip: '127.0.0.1', cookies: { google_signin: browser } };
  }
  return { service, db, security, response, payload, challenge };
}
const existingUser = (changes = {}) => ({
  id: 9,
  companyId: 3,
  role: 'HR',
  fullName: 'Existing Member',
  email: 'member@gmail.com',
  phone: null,
  mfaEnabled: false,
  isActive: true,
  platformRole: null,
  googleSubject: 'google-123',
  company: { isActive: true },
  ...changes,
});

beforeEach(() => vi.clearAllMocks());
describe('Google authentication', () => {
  it('is disabled without a client id and creates a secure browser-bound nonce when enabled', async () => {
    const f = fixture();
    f.security.config.GOOGLE_CLIENT_ID = '';
    expect(f.service.config()).toEqual({ configured: false, clientId: null });
    await expect(f.challenge()).rejects.toThrow();
    f.security.config.GOOGLE_CLIENT_ID = 'test.apps.googleusercontent.com';
    await f.challenge();
    expect(f.response.cookie).toHaveBeenCalledWith(
      'google_signin',
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/api/auth/google',
      }),
    );
  });
  it('verifies the configured audience and logs an existing subject into its original company/role', async () => {
    const f = fixture(),
      req = await f.challenge();
    f.db.user.findUnique.mockResolvedValue(existingUser());
    const result = await f.service.verify('signed-token', req as never, f.response as never);
    expect(google.verify).toHaveBeenCalledWith({
      idToken: 'signed-token',
      audience: 'test.apps.googleusercontent.com',
    });
    expect(result).toMatchObject({ id: 9, companyId: 3, role: 'HR' });
    expect(result).not.toHaveProperty('googleSubject');
    expect(f.db.user.create).not.toHaveBeenCalled();
    await expect(
      f.service.verify('signed-token', req as never, f.response as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(f.security.issue).toHaveBeenCalledTimes(1);
  });
  it.each(['signature', 'unverified email', 'nonce', 'browser'])(
    'rejects invalid %s before database access',
    async (failure) => {
      const f = fixture(),
        req = await f.challenge();
      if (failure === 'signature') google.verify.mockRejectedValue(new Error('Bad signature'));
      if (failure === 'unverified email') f.payload.email_verified = false;
      if (failure === 'nonce') f.payload.nonce = 'other-nonce';
      if (failure === 'browser') req.cookies.google_signin = 'a'.repeat(64);
      await expect(
        f.service.verify('bad-token', req as never, f.response as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(f.db.user.findUnique).not.toHaveBeenCalled();
      expect(f.security.issue).not.toHaveBeenCalled();
    },
  );
  it('links only authoritative Google email accounts without replacing a prior subject', async () => {
    const f = fixture(),
      req = await f.challenge();
    f.db.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingUser({ googleSubject: null }));
    await f.service.verify('signed-token', req as never, f.response as never);
    expect(f.db.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ googleSubject: null }),
        data: { googleSubject: 'google-123' },
      }),
    );
    const g = fixture(),
      req2 = await g.challenge();
    g.payload.email = 'member@third-party.example';
    g.db.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingUser({ googleSubject: null }));
    await expect(
      g.service.verify('signed-token', req2 as never, g.response as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(g.db.user.updateMany).not.toHaveBeenCalled();
  });
  it.each([{ isActive: false }, { company: { isActive: false } }])(
    'blocks inactive accounts or companies',
    async (changes) => {
      const f = fixture(),
        req = await f.challenge();
      f.db.user.findUnique.mockResolvedValue(existingUser(changes));
      await expect(
        f.service.verify('signed-token', req as never, f.response as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(f.security.issue).not.toHaveBeenCalled();
    },
  );
  it('issues a session for previously MFA-enabled accounts after Google verification', async () => {
    const f = fixture(),
      req = await f.challenge();
    f.db.user.findUnique.mockResolvedValue(existingUser({ mfaEnabled: true }));
    const result = await f.service.verify('signed-token', req as never, f.response as never);
    expect(result).not.toHaveProperty('mfaRequired');
    expect(f.security.issue).toHaveBeenCalledOnce();
  });
  it('requires explicit company registration, binds signup to the browser and consumes it once', async () => {
    const f = fixture(),
      req = await f.challenge();
    const verified = (await f.service.verify(
      'signed-token',
      req as never,
      f.response as never,
    )) as { signupToken: string };
    expect(f.db.user.create).not.toHaveBeenCalled();
    const data = {
      signupToken: verified.signupToken,
      fullName: 'New Member',
      companyName: 'New Company',
    };
    await expect(
      f.service.register(
        data,
        { cookies: { google_signin: 'b'.repeat(64) } } as never,
        f.response as never,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    f.db.user.create.mockResolvedValue(existingUser({ role: 'ADMIN' }));
    await f.service.register(data, req as never, f.response as never);
    expect(f.db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          googleSubject: 'google-123',
          email: 'member@gmail.com',
          role: 'ADMIN',
          company: { create: { name: 'New Company' } },
        }),
      }),
    );
    await expect(
      f.service.register(data, req as never, f.response as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(f.db.user.create).toHaveBeenCalledTimes(1);
  });
});
