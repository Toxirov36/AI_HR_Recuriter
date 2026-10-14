import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Database } from '../../database/prisma.service';
import { Security } from '../../common/utils/security';

type HhTokens = { access_token: string; refresh_token: string; expires_in: number };
type HhManager = { id: string; employer?: { id: string } };

export class HeadHunterUncertainResponse extends Error {}

@Injectable()
export class HeadHunterService {
  private refreshing = new Map<number, Promise<{ token: string; employerId: string }>>();
  constructor(@Inject(Database) private db: Database, @Inject(Security) private security: Security) {}

  get configured() {
    const c = this.security.config;
    return Boolean(c.HH_CLIENT_ID && c.HH_CLIENT_SECRET && c.HH_CALLBACK_URL && c.HH_TOKEN_ENCRYPTION_KEY && c.HH_USER_AGENT);
  }

  private get key() {
    if (!this.configured) throw new ServiceUnavailableException('HeadHunter API is not configured');
    return Buffer.from(this.security.config.HH_TOKEN_ENCRYPTION_KEY, 'base64');
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
    if (!this.configured) throw new ServiceUnavailableException('HeadHunter API is not configured');
    const state = randomBytes(24).toString('hex');
    await this.security.redis.set(`hh-oauth:${state}`, JSON.stringify({ companyId, userId }), 'EX', 600, 'NX');
    const url = new URL('https://hh.ru/oauth/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.security.config.HH_CLIENT_ID);
    url.searchParams.set('redirect_uri', this.security.config.HH_CALLBACK_URL);
    url.searchParams.set('state', state);
    return { url: url.toString() };
  }

  async finishConnect(code: string, state: string) {
    const raw = await this.security.redis.getdel(`hh-oauth:${state}`);
    if (!raw) throw new BadRequestException('HeadHunter authorization expired');
    const { companyId, userId } = JSON.parse(raw) as { companyId: number; userId: number };
    const body = new URLSearchParams({
      grant_type: 'authorization_code', code,
      client_id: this.security.config.HH_CLIENT_ID,
      client_secret: this.security.config.HH_CLIENT_SECRET,
      redirect_uri: this.security.config.HH_CALLBACK_URL,
    });
    const response = await fetch('https://api.hh.ru/token', { method: 'POST', body, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new BadGatewayException('HeadHunter authorization failed');
    const tokens = await response.json() as HhTokens;
    const managerResponse = await fetch('https://api.hh.ru/me?host=hh.uz', {
      headers: { Authorization: `Bearer ${tokens.access_token}`, 'HH-User-Agent': this.security.config.HH_USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
    if (!managerResponse.ok) throw new BadGatewayException('HeadHunter employer account could not be verified');
    const manager = await managerResponse.json() as HhManager;
    if (!manager.employer?.id) throw new BadRequestException('Connect a HeadHunter employer account');
    await this.db.headHunterConnection.upsert({
      where: { companyId },
      create: { companyId, connectedByUserId: userId, employerId: String(manager.employer.id), managerId: String(manager.id), accessTokenEncrypted: this.encrypt(tokens.access_token), refreshTokenEncrypted: this.encrypt(tokens.refresh_token), expiresAt: new Date(Date.now() + tokens.expires_in * 1000) },
      update: { connectedByUserId: userId, employerId: String(manager.employer.id), managerId: String(manager.id), accessTokenEncrypted: this.encrypt(tokens.access_token), refreshTokenEncrypted: this.encrypt(tokens.refresh_token), expiresAt: new Date(Date.now() + tokens.expires_in * 1000) },
    });
    return companyId;
  }

  async status(companyId: number) {
    const connection = await this.db.headHunterConnection.findUnique({ where: { companyId }, select: { employerId: true, connectedByUserId: true, updatedAt: true } });
    return { configured: this.configured, connected: Boolean(connection), employerId: connection?.employerId ?? null, connectedByUserId: connection?.connectedByUserId ?? null, updatedAt: connection?.updatedAt ?? null };
  }

  async disconnect(companyId: number) {
    const live = await this.db.vacancyPublication.count({ where: { companyId, platform: 'HEADHUNTER', status: { not: 'CLOSED' }, OR: [{ externalId: { not: null } }, { status: { in: ['QUEUED', 'SENDING', 'UNKNOWN'] } }] } });
    if (live) throw new ConflictException('Close or resolve HeadHunter vacancy posts before disconnecting the account');
    await this.db.headHunterConnection.deleteMany({ where: { companyId } });
    return { ok: true };
  }

  private async accessToken(companyId: number) {
    const connection = await this.db.headHunterConnection.findUnique({ where: { companyId } });
    if (!connection) throw new ServiceUnavailableException('Connect a HeadHunter employer account first');
    if (connection.expiresAt.getTime() > Date.now() + 60_000) return { token: this.decrypt(connection.accessTokenEncrypted), employerId: connection.employerId };
    const inFlight = this.refreshing.get(companyId);
    if (inFlight) return inFlight;
    const refresh = (async () => {
      const body = new URLSearchParams({
        grant_type: 'refresh_token', refresh_token: this.decrypt(connection.refreshTokenEncrypted),
        client_id: this.security.config.HH_CLIENT_ID, client_secret: this.security.config.HH_CLIENT_SECRET,
      });
      const response = await fetch('https://api.hh.ru/token', { method: 'POST', body, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new ServiceUnavailableException('Reconnect the HeadHunter employer account');
      const tokens = await response.json() as HhTokens;
      await this.db.headHunterConnection.update({ where: { companyId }, data: { accessTokenEncrypted: this.encrypt(tokens.access_token), refreshTokenEncrypted: this.encrypt(tokens.refresh_token), expiresAt: new Date(Date.now() + tokens.expires_in * 1000) } });
      return { token: tokens.access_token, employerId: connection.employerId };
    })();
    this.refreshing.set(companyId, refresh);
    try { return await refresh; }
    finally { this.refreshing.delete(companyId); }
  }

  async request(companyId: number, path: string, method = 'GET', payload?: unknown) {
    const { token } = await this.accessToken(companyId);
    const response = await fetch(`https://api.hh.ru${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'HH-User-Agent': this.security.config.HH_USER_AGENT, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      if (response.status === 403) throw new ServiceUnavailableException('HeadHunter account lacks the required service or permission');
      if (method === 'POST' && response.status >= 500) throw new HeadHunterUncertainResponse('HeadHunter did not confirm whether the vacancy was published');
      throw new BadGatewayException(`HeadHunter request failed (${response.status})`);
    }
    if (response.status === 204) return {};
    try { return await response.json(); }
    catch (error) {
      if (method === 'POST') throw new HeadHunterUncertainResponse('HeadHunter publication response could not be read');
      throw error;
    }
  }

  async packages(companyId: number, areaId?: string, roleId?: string) {
    const { employerId } = await this.accessToken(companyId);
    const params = new URLSearchParams({ host: 'hh.uz' });
    if (areaId) params.set('area_id', areaId);
    if (roleId) params.set('professional_role_id', roleId);
    return this.request(companyId, `/employers/${encodeURIComponent(employerId)}/services/available_publications?${params}`);
  }

  async fields(companyId: number) {
    const areasRaw = await this.request(companyId, '/areas?host=hh.uz') as Array<{ id: string; name: string; areas?: Array<{ id: string; name: string; areas?: Array<{ id: string; name: string }> }> }>;
    const rolesRaw = await this.request(companyId, '/professional_roles?host=hh.uz') as { categories?: Array<{ roles?: Array<{ id: string; name: string }> }> };
    const dictionaries = await this.request(companyId, '/dictionaries?host=hh.uz') as Record<string, Array<{ id: string; name: string }>>;
    const areas = areasRaw.flatMap(country => [
      { id: country.id, name: country.name },
      ...(country.areas ?? []).flatMap(region => [{ id: region.id, name: region.name }, ...(region.areas ?? []).map(city => ({ id: city.id, name: city.name }))]),
    ]);
    return {
      areas,
      roles: (rolesRaw.categories ?? []).flatMap(category => category.roles ?? []),
      experiences: dictionaries.experience ?? [],
      employments: dictionaries.employment ?? [],
      schedules: dictionaries.schedule ?? [],
    };
  }

  async search(companyId: number, vacancy: { title: string; hhAreaId: string | null; hhProfessionalRoleId: string | null }, page = 0) {
    const params = new URLSearchParams({ host: 'hh.uz', text: vacancy.title, page: String(page), per_page: '20' });
    if (vacancy.hhAreaId) params.set('area', vacancy.hhAreaId);
    if (vacancy.hhProfessionalRoleId) params.set('professional_role', vacancy.hhProfessionalRoleId);
    const result = await this.request(companyId, `/resumes?${params}`) as { found?: number; items?: Array<{ id: string; title?: string; alternate_url?: string; area?: { name?: string }; updated_at?: string }> };
    return { total: result.found ?? 0, items: (result.items ?? []).map(item => ({ id: item.id, title: item.title ?? '', url: item.alternate_url ?? null, area: item.area?.name ?? '', updatedAt: item.updated_at ?? null })) };
  }
}
