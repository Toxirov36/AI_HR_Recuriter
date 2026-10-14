import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { HeadHunterService } from './headhunter.service';

afterEach(() => vi.unstubAllGlobals());

describe('HeadHunter OAuth connection', () => {
  it('accepts only an employer manager and stores encrypted tokens', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const db = { headHunterConnection: { upsert } };
    const security = {
      redis: { getdel: vi.fn().mockResolvedValue(JSON.stringify({ companyId: 3, userId: 7 })) },
      config: { HH_CLIENT_ID: 'client', HH_CLIENT_SECRET: 'secret', HH_CALLBACK_URL: 'https://api.example.com/api/integrations/headhunter/callback', HH_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'), HH_USER_AGENT: 'Recruiter/1.0 (developer@example.com)' },
    };
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-secret', refresh_token: 'refresh-secret', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'manager-1', employer: { id: 'employer-1' } }), { status: 200 })));
    const service = new HeadHunterService(db as never, security as never);
    expect(await service.finishConnect('auth-code', 'state')).toBe(3);
    const saved = upsert.mock.calls[0][0].create;
    expect(saved.connectedByUserId).toBe(7);
    expect(saved.employerId).toBe('employer-1');
    expect(saved.accessTokenEncrypted).not.toContain('access-secret');
    expect(saved.refreshTokenEncrypted).not.toContain('refresh-secret');
  });

  it('does not save applicant-only authorization', async () => {
    const db = { headHunterConnection: { upsert: vi.fn() } };
    const security = { redis: { getdel: vi.fn().mockResolvedValue(JSON.stringify({ companyId: 3, userId: 7 })) }, config: { HH_CLIENT_ID: 'client', HH_CLIENT_SECRET: 'secret', HH_CALLBACK_URL: 'https://api.example.com/callback', HH_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'), HH_USER_AGENT: 'Recruiter/1.0 (developer@example.com)' } };
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'applicant' }), { status: 200 })));
    const service = new HeadHunterService(db as never, security as never);
    await expect(service.finishConnect('auth-code', 'state')).rejects.toThrow('employer account');
    expect(db.headHunterConnection.upsert).not.toHaveBeenCalled();
  });
});
