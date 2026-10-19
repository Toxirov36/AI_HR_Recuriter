import { describe, expect, it, vi } from 'vitest';
import { searchQueries, TelegramDiscoveryService } from './telegram-discovery.service';

const actor = { id: 2, companyId: 3, role: 'HR', fullName: 'Recruiter', email: 'hr@example.com' };
const vacancy = { id: 5, companyId: 3, title: 'Node.js developer', description: 'Build backend services in Uzbekistan', revision: 2, requirements: [{ name: 'TypeScript' }] };
const run = { id: 7, companyId: 3, vacancyId: 5, vacancyRevision: 2, status: 'QUEUED', results: null, error: null, createdAt: new Date(), finishedAt: null };

function service(db: unknown, gemini: unknown, telegram: unknown) {
  const security = { config: { NODE_ENV: 'test', GEMINI_API_KEY: 'configured', GEMINI_FALLBACK_MODEL: 'gemini-3.5-flash-lite' }, limit: vi.fn().mockResolvedValue(undefined) };
  return new TelegramDiscoveryService(db as never, security as never, gemini as never, telegram as never);
}

describe('Telegram channel discovery', () => {
  it('searches profession synonyms separately for a dental vacancy', () => {
    expect(searchQueries('Tish doktori', ['Stomatolog ish o‘rni', 'Врач стоматолог', 'Стоматолог вакансия']))
      .toEqual(expect.arrayContaining(['Stomatolog', 'Стоматолог']));
  });

  it('does not expose another company vacancy or its results', async () => {
    const db = { vacancy: { findFirst: vi.fn().mockResolvedValue(null) }, telegramChannelDiscovery: { findFirst: vi.fn() } };
    const discovery = service(db, {}, { configured: true });
    await expect(discovery.status(9, 5)).rejects.toThrow('Vacancy not found');
    expect(db.vacancy.findFirst).toHaveBeenCalledWith({ where: { id: 5, companyId: 9 }, include: { requirements: true } });
    expect(db.telegramChannelDiscovery.findFirst).not.toHaveBeenCalled();
  });

  it('deduplicates channels, separates subscriber count from fit, and marks sparse evidence', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const db = {
      vacancy: { findFirst: vi.fn().mockResolvedValue(vacancy) },
      telegramChannelDiscovery: { findUnique: vi.fn().mockResolvedValue(run), update },
    };
    const gemini = { generate: vi.fn().mockResolvedValueOnce({ queries: ['dasturchi', 'разработчик'] }).mockResolvedValueOnce({ ratings: [
      { username: 'devjobs', score: 87, reason: 'Dasturchilar uchun ish va texnologiya postlari ko‘p.', inUzbekistanMarket: true },
      { username: 'foreign', score: 95, reason: 'Texnik mavzu bor, lekin O‘zbekiston bozoriga tegishli emas.', inUzbekistanMarket: false },
      { username: 'personal', score: 10, reason: 'Kanal shaxsiy fikrlar uchun, vakansiyalar deyarli yo‘q.', inUzbekistanMarket: true },
      { username: 'niche', score: 45, reason: 'Kasbiy auditoriya mos, ammo vakansiyalar kam uchraydi.', inUzbekistanMarket: true },
    ] }) };
    const telegram = {
      configured: true,
      search: vi.fn().mockResolvedValue([{ id: '11', title: 'Dev Jobs', username: 'devjobs' }, { id: '22', title: 'General', username: 'general' }, { id: '33', title: 'Foreign', username: 'foreign' }, { id: '44', title: 'Personal', username: 'personal' }, { id: '55', title: 'Niche Developers', username: 'niche' }]),
      inspect: vi.fn().mockImplementation(async (username: string) => username === 'devjobs'
        ? { telegramId: '11', title: 'Dev Jobs', username, description: 'Programming and software engineering jobs in Uzbekistan', subscriberCount: 100, posts: ['TypeScript and Node.js backend roles in Tashkent'], checkedAt: '2026-10-15T00:00:00.000Z' }
        : username === 'general'
          ? { telegramId: '22', title: 'General', username, description: 'Toshkent jobs', subscriberCount: 100000, posts: [], checkedAt: '2026-10-15T00:00:00.000Z' }
          : username === 'personal'
            ? { telegramId: '44', title: 'Personal', username, description: 'Uzbekistan programming reflections and personal opinions without job vacancy announcements', subscriberCount: 2, posts: [], checkedAt: '2026-10-15T00:00:00.000Z' }
          : username === 'niche'
            ? { telegramId: '55', title: 'Niche Developers', username, description: 'Uzbekistan software engineering discussions for developers and technical professionals', subscriberCount: 80, posts: ['TypeScript and Node.js discussion for local backend engineers'], checkedAt: '2026-10-15T00:00:00.000Z' }
            : { telegramId: '33', title: 'Foreign', username, description: 'Programming and engineering opportunities across other countries', subscriberCount: 200000, posts: ['Software engineering vacancy and many technical discussion topics'], checkedAt: '2026-10-15T00:00:00.000Z' }),
    };
    const discovery = service(db, gemini, telegram);
    await (discovery as unknown as { process(job: unknown): Promise<void> }).process({ data: { runId: 7 } });
    expect(telegram.search).toHaveBeenCalledWith('Node.js developer');
    expect(telegram.inspect).toHaveBeenCalledTimes(5);
    const completed = update.mock.calls.find(([arg]) => arg.data.status === 'COMPLETED')?.[0];
    expect(completed.data.results).toEqual([
      expect.objectContaining({ telegramId: '11', score: 87, subscriberCount: 100 }),
      expect.objectContaining({ telegramId: '55', score: 45, subscriberCount: 80 }),
      expect.objectContaining({ telegramId: '22', score: null, subscriberCount: 100000, reason: 'Ma’lumot kam' }),
    ]);
    expect(gemini.generate).toHaveBeenCalledTimes(2);
    expect(gemini.generate.mock.calls.every((args: unknown[]) => args[4] === 'gemini-3.5-flash-lite')).toBe(true);
  });

  it('reports Telegram flood limits without inventing ratings', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const db = { vacancy: { findFirst: vi.fn().mockResolvedValue(vacancy) }, telegramChannelDiscovery: { findUnique: vi.fn().mockResolvedValue(run), update } };
    const gemini = { generate: vi.fn().mockResolvedValue({ queries: ['dasturchi', 'разработчик'] }) };
    const telegram = { search: vi.fn().mockRejectedValue(new Error('FLOOD_WAIT_120')) };
    await (service(db, gemini, telegram) as unknown as { process(job: unknown): Promise<void> }).process({ data: { runId: 7 } });
    expect(update).toHaveBeenCalledWith({ where: { id: 7 }, data: expect.objectContaining({ status: 'FAILED', error: expect.stringContaining('chegarasiga') }) });
    expect(update.mock.calls.some(([arg]) => arg.data.results)).toBe(false);
  });

  it('reports AI quota limits clearly without saving fabricated scores', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const db = { vacancy: { findFirst: vi.fn().mockResolvedValue(vacancy) }, telegramChannelDiscovery: { findUnique: vi.fn().mockResolvedValue(run), update } };
    const gemini = { generate: vi.fn().mockRejectedValue(new Error('Gemini request limit or quota reached. Check your Google AI Studio quota and retry shortly.')) };
    await (service(db, gemini, {}) as unknown as { process(job: unknown): Promise<void> }).process({ data: { runId: 7 } });
    expect(update).toHaveBeenCalledWith({ where: { id: 7 }, data: expect.objectContaining({ status: 'FAILED', error: expect.stringContaining('AI so‘rovlar limiti') }) });
    expect(update.mock.calls.some(([arg]) => arg.data.results)).toBe(false);
  });

  it('reports an expired account session and an AI failure without saving scores', async () => {
    for (const failure of ['Telegram discovery session is expired', 'AI processing failed']) {
      const update = vi.fn().mockResolvedValue(undefined);
      const db = { vacancy: { findFirst: vi.fn().mockResolvedValue(vacancy) }, telegramChannelDiscovery: { findUnique: vi.fn().mockResolvedValue(run), update } };
      const gemini = { generate: failure.startsWith('AI')
        ? vi.fn().mockRejectedValue(new Error(failure))
        : vi.fn().mockResolvedValue({ queries: ['dasturchi', 'разработчик'] }) };
      const telegram = { search: vi.fn().mockRejectedValue(new Error(failure)) };
      await (service(db, gemini, telegram) as unknown as { process(job: unknown): Promise<void> }).process({ data: { runId: 7 } });
      expect(update).toHaveBeenCalledWith({ where: { id: 7 }, data: expect.objectContaining({ status: 'FAILED' }) });
      expect(update.mock.calls.some(([arg]) => arg.data.results)).toBe(false);
    }
  });

  it('refuses to start when the Telegram account is not configured', async () => {
    const db = { vacancy: { findFirst: vi.fn().mockResolvedValue(vacancy) }, telegramChannelDiscovery: { create: vi.fn() } };
    const discovery = service(db, {}, { configured: false });
    await expect(discovery.start(actor, 5)).rejects.toThrow('not configured');
    expect(db.telegramChannelDiscovery.create).not.toHaveBeenCalled();
  });

  it('returns an active run without consuming another discovery attempt', async () => {
    const limit = vi.fn();
    const db = {
      vacancy: { findFirst: vi.fn().mockResolvedValue(vacancy) },
      telegramChannelDiscovery: { findFirst: vi.fn().mockResolvedValue(run), create: vi.fn() },
    };
    const discovery = new TelegramDiscoveryService(db as never, { config: { GEMINI_API_KEY: 'configured' }, limit } as never, {} as never, { configured: true } as never);
    Object.assign(discovery, { queue: {} });

    await expect(discovery.start(actor, vacancy.id)).resolves.toEqual({ id: run.id, status: run.status });
    expect(limit).not.toHaveBeenCalled();
    expect(db.telegramChannelDiscovery.create).not.toHaveBeenCalled();
  });

  it('limits new analyses per vacancy rather than per company', async () => {
    const limit = vi.fn().mockResolvedValue(undefined);
    const db = {
      vacancy: { findFirst: vi.fn().mockResolvedValue(vacancy) },
      telegramChannelDiscovery: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(run) },
    };
    const add = vi.fn().mockResolvedValue(undefined);
    const discovery = new TelegramDiscoveryService(db as never, { config: { GEMINI_API_KEY: 'configured' }, limit } as never, {} as never, { configured: true } as never);
    Object.assign(discovery, { queue: { getJob: vi.fn().mockResolvedValue(null), add } });

    await discovery.start(actor, vacancy.id);
    expect(limit).toHaveBeenCalledWith(`telegram-discovery:${actor.companyId}:${vacancy.id}`, 3, 3600);
    expect(add).toHaveBeenCalledOnce();
  });
});
