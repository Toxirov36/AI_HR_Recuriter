import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleCalendarNotConnectedError, GoogleCalendarService } from './google-calendar.service';

const key = Buffer.alloc(32, 7).toString('base64');
const config = { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_OAUTH_REDIRECT_URL: 'https://hrdai.uz/api/integrations/google-calendar/callback', GOOGLE_TOKEN_ENCRYPTION_KEY: key };
const event = { summary: 'SMM Lead — Ali', start: new Date('2026-11-02T09:00:00Z'), end: new Date('2026-11-02T09:30:00Z'), timezone: 'Asia/Tashkent', attendeeEmail: 'ali@example.com', withMeet: true, requestId: 'iv-1-1' };

function setup(cfg: Record<string, string> = config) {
  const rows = new Map<number, any>();
  const db: any = {
    googleCalendarConnection: {
      findUnique: vi.fn(async ({ where }: any) => rows.get(where.userId) ?? null),
      upsert: vi.fn(async ({ where, create }: any) => rows.set(where.userId, create)),
      deleteMany: vi.fn(async ({ where }: any) => rows.delete(where.userId)),
    },
  };
  const redis = { set: vi.fn(), getdel: vi.fn() };
  const service = new GoogleCalendarService(db, { config: cfg, redis } as never);
  return { db, rows, redis, service };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('Google Calendar connection', () => {
  it('is unavailable until every setting is present', async () => {
    const { service } = setup({ ...config, GOOGLE_CLIENT_SECRET: '' });
    expect(service.configured).toBe(false);
    expect(await service.isConnected(5)).toBe(false);
    await expect(service.connectUrl(3, 5)).rejects.toThrow('not configured');
  });

  it('builds a consent URL that asks for offline calendar access and remembers the user for ten minutes', async () => {
    const { service, redis } = setup();
    const { url } = await service.connectUrl(3, 5);
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(parsed.searchParams.get('scope')).toContain('calendar.events');
    expect(parsed.searchParams.get('access_type')).toBe('offline');
    expect(parsed.searchParams.get('prompt')).toBe('consent');
    const state = parsed.searchParams.get('state')!;
    expect(redis.set).toHaveBeenCalledWith(`gcal-oauth:${state}`, JSON.stringify({ companyId: 3, userId: 5 }), 'EX', 600, 'NX');
  });

  it('rejects an unknown or reused state', async () => {
    const { service, redis } = setup();
    redis.getdel.mockResolvedValue(null);
    await expect(service.finishConnect('code', 'bad')).rejects.toThrow('expired');
  });
});

describe('creating events', () => {
  async function connected() {
    const ctx = setup();
    // Store a token the same way a real connection does: through the service's own encryption.
    const enc = (ctx.service as any).encrypt('refresh-token');
    ctx.rows.set(5, { userId: 5, refreshTokenEncrypted: enc });
    return ctx;
  }

  it('refreshes the access token, asks for a Meet conference and returns the link', async () => {
    const { service } = await connected();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'access' }))
      .mockResolvedValueOnce(json({ id: 'ev1', hangoutLink: 'https://meet.google.com/abc-defg-hij' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await service.createEvent(5, event);
    expect(result).toEqual({ eventId: 'ev1', meetUrl: 'https://meet.google.com/abc-defg-hij' });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toContain('conferenceDataVersion=1');
    expect(url).toContain('sendUpdates=all');
    expect(init.headers.Authorization).toBe('Bearer access');
    const body = JSON.parse(init.body);
    expect(body.conferenceData.createRequest).toEqual({ requestId: 'iv-1-1', conferenceSolutionKey: { type: 'hangoutsMeet' } });
    expect(body.attendees).toEqual([{ email: 'ali@example.com' }]);
    expect(body.start).toEqual({ dateTime: '2026-11-02T09:00:00.000Z', timeZone: 'Asia/Tashkent' });
  });

  it('does not ask for Meet on an offline event', async () => {
    const { service } = await connected();
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ access_token: 'access' })).mockResolvedValueOnce(json({ id: 'ev2' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await service.createEvent(5, { ...event, withMeet: false, location: 'Amir Temur 1' });
    expect(result).toEqual({ eventId: 'ev2', meetUrl: null });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).conferenceData).toBeUndefined();
  });

  it('forgets the connection when Google says access was revoked', async () => {
    const { service, rows } = await connected();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'invalid_grant' }, 400)));
    await expect(service.createEvent(5, event)).rejects.toBeInstanceOf(GoogleCalendarNotConnectedError);
    expect(rows.has(5)).toBe(false);
  });

  it('removes the event again when no Meet link ever appears', async () => {
    const { service } = await connected();
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (url: string, init?: any) => {
      if (url.includes('oauth2.googleapis.com')) return json({ access_token: 'access' });
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return json({ id: 'ev3' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const pending = service.createEvent(5, event);
    const outcome = expect(pending).rejects.toThrow('Meet link');
    await vi.runAllTimersAsync();
    await outcome;
    vi.useRealTimers();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
  });

  it('tolerates a missing calendar connection when deleting', async () => {
    const { service } = setup();
    await expect(service.deleteEvent(5, 'gone')).resolves.toBeUndefined();
  });
});
