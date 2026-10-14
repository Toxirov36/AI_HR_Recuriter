import { describe, expect, it, vi } from 'vitest';
import { ExternalRecruitingService } from './external-recruiting.service';

const actor = { id: 2, companyId: 3, role: 'HR', fullName: 'Recruiter', email: 'hr@example.com' };
const vacancy = { id: 5, companyId: 3, title: 'Developer', description: 'Build apps', status: 'ACTIVE', revision: 2, publicToken: '12345678-1234-1234-1234-123456789012', company: { name: 'Acme' }, requirements: [] };

describe('external vacancy publication', () => {
  it('does not create another Telegram post when the same revision is already published', async () => {
    const db = {
      vacancy: { findFirst: vi.fn().mockResolvedValue(vacancy) },
      telegramChannel: { findFirst: vi.fn().mockResolvedValue({ id: 8, chatId: '-10044', companyId: 3, enabled: true }) },
      vacancyPublication: { findUnique: vi.fn().mockResolvedValue({ id: 12, status: 'PUBLISHED', approvedRevision: 2 }), upsert: vi.fn() },
    };
    const telegram = { getMe: vi.fn().mockResolvedValue({ id: 1, username: 'hrbot' }), getChatMember: vi.fn().mockResolvedValue({ status: 'administrator', can_post_messages: true }), sendMessage: vi.fn() };
    const service = new ExternalRecruitingService(db as never, { config: { FRONTEND_ORIGIN: 'https://hr.example.com' } } as never, telegram as never, {} as never);
    const result = await service.approve(actor, 5, { platform: 'TELEGRAM', channelId: 8 });
    expect(result.id).toBe(12);
    expect(db.vacancyPublication.upsert).not.toHaveBeenCalled();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects a Telegram channel belonging to another tenant', async () => {
    const db = { vacancy: { findFirst: vi.fn().mockResolvedValue(vacancy) }, telegramChannel: { findFirst: vi.fn().mockResolvedValue(null) } };
    const service = new ExternalRecruitingService(db as never, {} as never, {} as never, {} as never);
    await expect(service.approve(actor, 5, { platform: 'TELEGRAM', channelId: 99 })).rejects.toThrow('Channel not connected');
  });

  it('blocks deletion while an external post is still open', async () => {
    const db = { vacancyPublication: { count: vi.fn().mockResolvedValue(1) } };
    const service = new ExternalRecruitingService(db as never, {} as never, {} as never, {} as never);
    await expect(service.assertCanDelete(3, 5)).rejects.toThrow('Close external publications');
  });

  it('queues closing when a vacancy closes while its first Telegram post is being sent', async () => {
    const publication = {
      id: 12, companyId: 3, vacancyId: 5, platform: 'TELEGRAM', destinationKey: '-10044',
      status: 'QUEUED', externalId: null, approvedRevision: 2,
      approvedPayload: { text: 'Developer vacancy' },
      channel: { username: 'jobs' }, vacancy,
    };
    const db = {
      $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) => callback({ $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]) })),
      vacancyPublication: {
        findUnique: vi.fn().mockResolvedValue(publication),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ updatedAt: new Date() }),
        update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      vacancy: { findUnique: vi.fn().mockResolvedValue({ status: 'CLOSED', revision: 2 }) },
    };
    const queue = { getJob: vi.fn().mockResolvedValue(null), add: vi.fn().mockResolvedValue({}) };
    const telegram = { sendMessage: vi.fn().mockResolvedValue({ ok: true, result: { message_id: 77 } }) };
    const service = new ExternalRecruitingService(db as never, {} as never, telegram as never, {} as never);
    Object.assign(service, { queue });
    await (service as unknown as { process(job: unknown): Promise<void> }).process({ data: { publicationId: 12, action: 'publish' }, opts: { attempts: 1 }, attemptsMade: 0 });
    expect(queue.add).toHaveBeenCalledWith('close', { publicationId: 12, action: 'close' }, expect.any(Object));
    expect(db.vacancyPublication.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { status: 'QUEUED' } });
  });

  it('refuses to attach an uncertain HeadHunter post from another employer', async () => {
    const db = { vacancyPublication: {
      findFirst: vi.fn().mockResolvedValue({ id: 12, platform: 'HEADHUNTER', destinationKey: 'our-employer', vacancy: { status: 'ACTIVE', revision: 2 }, approvedRevision: 2 }),
      update: vi.fn(),
    } };
    const hh = { request: vi.fn().mockResolvedValue({ employer: { id: 'other-employer' } }) };
    const service = new ExternalRecruitingService(db as never, {} as never, {} as never, hh as never);
    await expect(service.confirmFound({ ...actor, role: 'ADMIN' }, 12, '12345')).rejects.toThrow('another employer');
    expect(db.vacancyPublication.update).not.toHaveBeenCalled();
  });

  it('snapshots the selected HeadHunter package properties for an approved post', async () => {
    const db = {
      vacancy: { findFirst: vi.fn().mockResolvedValue({ ...vacancy, hhAreaId: '97', hhProfessionalRoleId: '1', hhExperienceId: 'between1And3', hhEmploymentId: 'full', hhScheduleId: 'fullDay' }) },
      vacancyPublication: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => ({ id: 14, ...data })),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ updatedAt: new Date() }),
      },
    };
    const hh = {
      status: vi.fn().mockResolvedValue({ connected: true, connectedByUserId: 2, employerId: '99' }),
      packages: vi.fn().mockResolvedValue({ publication_variants: [{ vacancy_properties: { required: [{ property_type: 'HH_STANDARD' }] }, suitable_packages: [{ employer_service_id: 'package-1', count: 2, invalid: false }] }] }),
    };
    const service = new ExternalRecruitingService(db as never, {} as never, {} as never, hh as never);
    Object.assign(service, { queue: { getJob: vi.fn().mockResolvedValue(null), add: vi.fn().mockResolvedValue({}) } });
    await service.approve(actor, 5, { platform: 'HEADHUNTER', employerServiceId: 'package-1' });
    expect(db.vacancyPublication.create).toHaveBeenCalledWith({ data: expect.objectContaining({ approvedPayload: expect.objectContaining({ vacancyProperties: [{ property_type: 'HH_STANDARD' }], employerServiceId: 'package-1' }) }) });
  });

  it('allows an approved HeadHunter edit without purchasing another package', async () => {
    const existing = { id: 14, status: 'STALE', externalId: '12345', approvedRevision: 1 };
    const db = {
      vacancy: { findFirst: vi.fn().mockResolvedValue({ ...vacancy, hhAreaId: '97', hhProfessionalRoleId: '1', hhExperienceId: 'between1And3', hhEmploymentId: 'full', hhScheduleId: 'fullDay' }) },
      vacancyPublication: {
        findUnique: vi.fn().mockResolvedValue(existing), updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ ...existing, updatedAt: new Date() }),
      },
    };
    const hh = { status: vi.fn().mockResolvedValue({ connected: true, connectedByUserId: 2, employerId: '99' }), packages: vi.fn() };
    const service = new ExternalRecruitingService(db as never, {} as never, {} as never, hh as never);
    Object.assign(service, { queue: { getJob: vi.fn().mockResolvedValue(null), add: vi.fn().mockResolvedValue({}) } });
    await service.approve(actor, 5, { platform: 'HEADHUNTER' });
    expect(hh.packages).not.toHaveBeenCalled();
  });
});
