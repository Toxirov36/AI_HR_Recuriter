import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hash } from 'bcryptjs';
import { login, registration } from '../../common/pipes/validation';
import { AuthService } from './auth.service';
const base = {
  companyName: 'Test Company',
  fullName: 'Test User',
  password: 'secure-password-123',
};
describe('email authentication', () => {
  it('requires an email for both registration and login and rejects phone credentials', () => {
    expect(registration.safeParse({ ...base, phone: '+998901234567' }).success).toBe(false);
    expect(
      registration.safeParse({ ...base, email: 'a@test.com', phone: '+998901234567' }).success,
    ).toBe(false);
    expect(login.safeParse({ phone: '+998901234567', password: base.password }).success).toBe(
      false,
    );
    expect(
      login.safeParse({ email: 'a@test.com', phone: '+998901234567', password: base.password })
        .success,
    ).toBe(false);
    expect(registration.parse({ ...base, email: 'USER@TEST.COM' }).email).toBe('user@test.com');
  });
  const db = { user: { create: vi.fn(), findUnique: vi.fn() } };
  const security = { limit: vi.fn(), issue: vi.fn() };
  const service = new AuthService(db as never, security as never);
  beforeEach(() => {
    vi.clearAllMocks();
    security.issue.mockImplementation((user) => user);
  });
  it('creates an email account and signs in using the normalized email', async () => {
    const user = {
      id: 2,
      email: 'user@test.com',
      password: await hash(base.password, 4),
      isActive: true,
      company: { isActive: true },
    };
    db.user.create.mockResolvedValue(user);
    db.user.findUnique.mockResolvedValue(user);
    await service.register(
      registration.parse({ ...base, email: 'USER@TEST.COM' }),
      '127.0.0.1',
      {} as never,
    );
    expect(db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'user@test.com' }) }),
    );
    expect(db.user.create.mock.calls[0][0].data).not.toHaveProperty('phone');
    await service.login(
      login.parse({ email: 'USER@TEST.COM', password: base.password }),
      '127.0.0.1',
      {} as never,
    );
    expect(db.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'user@test.com' } }),
    );
  });
  it('signs in previously 2FA-enabled accounts without exposing their old secrets', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 3,
      email: 'legacy@test.com',
      password: await hash(base.password, 4),
      mfaEnabled: true,
      mfaSecret: 'legacy-secret',
      mfaRecoveryCodes: ['legacy-code'],
    });
    const result = await service.login(
      { email: 'legacy@test.com', password: base.password },
      '127.0.0.1',
      {} as never,
    );
    expect(security.issue).toHaveBeenCalledOnce();
    for (const field of ['mfaRequired', 'mfaSecret', 'mfaRecoveryCodes'])
      expect(result).not.toHaveProperty(field);
  });
});
