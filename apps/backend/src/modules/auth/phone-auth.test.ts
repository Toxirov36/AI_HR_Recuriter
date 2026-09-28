import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hash } from 'bcryptjs';
import { login, registration } from '../../common/pipes/validation';
import { AuthService } from './auth.service';

const base = {
  companyName: 'Test Company',
  fullName: 'Test User',
  password: 'secure-password-123',
};

describe('phone authentication', () => {
  it('normalizes Uzbek phone numbers and accepts international numbers', () => {
    expect(registration.parse({ ...base, phone: '90 123 45 67' }).phone).toBe('+998901234567');
    expect(login.parse({ phone: '998901234567', password: 'secret' }).phone).toBe('+998901234567');
    expect(login.parse({ phone: '+1 (202) 555-0100', password: 'secret' }).phone).toBe('+12025550100');
  });

  it('requires exactly one valid contact method', () => {
    expect(registration.safeParse(base).success).toBe(false);
    expect(registration.safeParse({ ...base, email: 'a@test.com', phone: '+998901234567' }).success).toBe(false);
    expect(login.safeParse({ phone: 'abc', password: 'secret' }).success).toBe(false);
    expect(registration.parse({ ...base, email: 'USER@TEST.COM' }).email).toBe('user@test.com');
  });

  const db = { user: { create: vi.fn(), findUnique: vi.fn() } };
  const security = { limit: vi.fn(), issue: vi.fn() };
  const service = new AuthService(db as any, security as any, {} as any);

  beforeEach(() => {
    vi.clearAllMocks();
    security.issue.mockImplementation((user) => user);
  });

  it('creates a phone-only account and signs in by phone', async () => {
    const password = await hash(base.password, 4);
    const user = { id: 1, email: null, phone: '+998901234567', password, mfaEnabled: false };
    db.user.create.mockResolvedValue(user);
    db.user.findUnique.mockResolvedValue(user);
    await service.register(registration.parse({ ...base, phone: '90 123 45 67' }), '127.0.0.1', {} as any);
    expect(db.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: null, phone: '+998901234567' }),
    }));
    await service.login(login.parse({ phone: '998901234567', password: base.password }), '127.0.0.1', {} as any);
    expect(db.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { phone: '+998901234567' } }));
    expect(security.issue).toHaveBeenCalledWith(expect.objectContaining({ phone: '+998901234567' }), expect.anything());
  });

  it('keeps email login working', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 2, email: 'user@test.com', phone: null, password: await hash(base.password, 4), mfaEnabled: false,
    });
    await service.login(login.parse({ email: 'USER@TEST.COM', password: base.password }), '127.0.0.1', {} as any);
    expect(db.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'user@test.com' } }));
  });
});
