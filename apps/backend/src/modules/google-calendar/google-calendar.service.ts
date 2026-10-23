import { BadGatewayException, BadRequestException, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { Database } from '../../database/prisma.service';
import { Security } from '../../common/utils/security';

const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];
const CALENDAR = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export type CalendarEventInput = {
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  timezone: string;
  attendeeEmail?: string | null;
  withMeet: boolean;
  /** Idempotency key for the Meet conference request. */
  requestId: string;
};

export class GoogleCalendarNotConnectedError extends Error {}

/** Creates calendar events (with Google Meet links) in the connected recruiter's own calendar. */
@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(@Inject(Database) private db: Database, @Inject(Security) private security: Security) {}

  get configured() {
    const c = this.security.config;
    return Boolean(c.GOOGLE_CLIENT_ID && c.GOOGLE_CLIENT_SECRET && c.GOOGLE_OAUTH_REDIRECT_URL && c.GOOGLE_TOKEN_ENCRYPTION_KEY);
  }

  private get key() {
    if (!this.configured) throw new ServiceUnavailableException('Google Calendar is not configured');
    return Buffer.from(this.security.config.GOOGLE_TOKEN_ENCRYPTION_KEY, 'base64');
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  }

  private decrypt(value: string) {
    const bytes = Buffer.from(value, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
  }

  async connectUrl(companyId: number, userId: number) {
    if (!this.configured) throw new ServiceUnavailableException('Google Calendar is not configured');
    const state = randomBytes(24).toString('hex');
    await this.security.redis.set(`gcal-oauth:${state}`, JSON.stringify({ companyId, userId }), 'EX', 600, 'NX');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.security.config.GOOGLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', this.security.config.GOOGLE_OAUTH_REDIRECT_URL);
    url.searchParams.set('scope', SCOPES.join(' '));
    // offline + consent make Google return a refresh token every time the account is (re)connected.
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);
    // The recruiter's own sign-in address skips the account chooser, so only the consent screen is left.
    try {
      const user = await this.db.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (user?.email) url.searchParams.set('login_hint', user.email);
    } catch {
      // The hint is only a convenience.
    }
    return { url: url.toString() };
  }

  async finishConnect(code: string, state: string) {
    const raw = await this.security.redis.getdel(`gcal-oauth:${state}`);
    if (!raw) throw new BadRequestException('Google authorization expired');
    const { companyId, userId } = JSON.parse(raw) as { companyId: number; userId: number };
    const c = this.security.config;
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: c.GOOGLE_CLIENT_ID,
        client_secret: c.GOOGLE_CLIENT_SECRET,
        redirect_uri: c.GOOGLE_OAUTH_REDIRECT_URL,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new BadGatewayException('Google authorization failed');
    const tokens = (await response.json()) as { refresh_token?: string; id_token?: string; scope?: string };
    if (!tokens.refresh_token) throw new BadRequestException('Google did not return offline access. Remove the app from your Google account permissions and connect again');
    if (!tokens.scope?.includes('calendar.events')) throw new BadRequestException('Calendar access was not granted');
    const ticket = await new OAuth2Client().verifyIdToken({ idToken: tokens.id_token ?? '', audience: c.GOOGLE_CLIENT_ID });
    const email = ticket.getPayload()?.email;
    if (!email) throw new BadGatewayException('Google account email could not be verified');
    await this.db.googleCalendarConnection.upsert({
      where: { userId },
      create: { userId, companyId, googleEmail: email, refreshTokenEncrypted: this.encrypt(tokens.refresh_token) },
      update: { companyId, googleEmail: email, refreshTokenEncrypted: this.encrypt(tokens.refresh_token) },
    });
    return userId;
  }

  async status(userId: number) {
    const connection = await this.db.googleCalendarConnection.findUnique({ where: { userId }, select: { googleEmail: true, updatedAt: true } });
    return { configured: this.configured, connected: Boolean(connection), googleEmail: connection?.googleEmail ?? null, updatedAt: connection?.updatedAt ?? null };
  }

  async isConnected(userId: number) {
    return this.configured && Boolean(await this.db.googleCalendarConnection.findUnique({ where: { userId }, select: { userId: true } }));
  }

  async disconnect(userId: number) {
    const connection = await this.db.googleCalendarConnection.findUnique({ where: { userId } });
    if (!connection) return { ok: true };
    await this.db.googleCalendarConnection.deleteMany({ where: { userId } });
    try {
      const token = this.decrypt(connection.refreshTokenEncrypted);
      await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', body: new URLSearchParams({ token }), signal: AbortSignal.timeout(10_000) });
    } catch {
      // The connection is already removed here; revoking is best effort.
    }
    return { ok: true };
  }

  private async accessToken(userId: number) {
    if (!this.configured) throw new GoogleCalendarNotConnectedError('Google Calendar is not configured');
    const connection = await this.db.googleCalendarConnection.findUnique({ where: { userId } });
    if (!connection) throw new GoogleCalendarNotConnectedError('Connect a Google account first');
    const c = this.security.config;
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.decrypt(connection.refreshTokenEncrypted),
        client_id: c.GOOGLE_CLIENT_ID,
        client_secret: c.GOOGLE_CLIENT_SECRET,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        // invalid_grant: the user revoked access, so the stored token is useless.
        await this.db.googleCalendarConnection.deleteMany({ where: { userId } });
        throw new GoogleCalendarNotConnectedError('Google access was revoked. Connect the account again');
      }
      throw new BadGatewayException('Google token refresh failed');
    }
    return ((await response.json()) as { access_token: string }).access_token;
  }

  /** Creates the event and returns its id and, for online interviews, the Meet link. */
  async createEvent(userId: number, input: CalendarEventInput): Promise<{ eventId: string; meetUrl: string | null }> {
    const token = await this.accessToken(userId);
    const body: Record<string, unknown> = {
      summary: input.summary,
      description: input.description,
      location: input.location,
      start: { dateTime: input.start.toISOString(), timeZone: input.timezone },
      end: { dateTime: input.end.toISOString(), timeZone: input.timezone },
      ...(input.attendeeEmail ? { attendees: [{ email: input.attendeeEmail }] } : {}),
      ...(input.withMeet ? { conferenceData: { createRequest: { requestId: input.requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } } } : {}),
    };
    const response = await fetch(`${CALENDAR}?conferenceDataVersion=${input.withMeet ? 1 : 0}&sendUpdates=all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      this.logger.warn(`Google Calendar event creation failed (${response.status})`);
      throw new BadGatewayException('Google Calendar event could not be created');
    }
    const event = (await response.json()) as EventResponse;
    let meetUrl = meetLink(event);
    // The Meet link is normally in the insert response; if Google is still creating it, ask again briefly.
    for (let attempt = 0; input.withMeet && !meetUrl && attempt < 3; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const again = await fetch(`${CALENDAR}/${encodeURIComponent(event.id)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
      if (again.ok) meetUrl = meetLink((await again.json()) as EventResponse);
    }
    if (input.withMeet && !meetUrl) {
      await this.deleteEvent(userId, event.id).catch(() => undefined);
      throw new BadGatewayException('Google Meet link could not be created');
    }
    return { eventId: event.id, meetUrl };
  }

  /** Removes an event and notifies its attendee. Missing events and revoked access are not errors. */
  async deleteEvent(userId: number, eventId: string) {
    try {
      const token = await this.accessToken(userId);
      await fetch(`${CALENDAR}/${encodeURIComponent(eventId)}?sendUpdates=all`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      this.logger.warn(`Google Calendar event removal skipped: ${(error as Error).message}`);
    }
  }
}

type EventResponse = { id: string; hangoutLink?: string; conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> } };

function meetLink(event: EventResponse): string | null {
  return event.hangoutLink ?? event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri ?? null;
}
