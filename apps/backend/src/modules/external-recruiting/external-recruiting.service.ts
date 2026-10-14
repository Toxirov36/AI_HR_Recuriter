import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { Database } from '../../database/prisma.service';
import { Security, type Identity } from '../../common/utils/security';
import { TelegramApiService } from '../telegram/telegram-api.service';
import { HeadHunterService, HeadHunterUncertainResponse } from './headhunter.service';

type PublicationJob = { publicationId: number; action: 'publish' | 'close' };
const QUEUE_NAME = 'vacancy-external-publication';
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

@Injectable()
export class ExternalRecruitingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExternalRecruitingService.name);
  private connection?: Redis;
  private queue?: Queue<PublicationJob>;
  private worker?: Worker<PublicationJob>;
  private searchTimer?: NodeJS.Timeout;
  private recoveryTimer?: NodeJS.Timeout;

  constructor(
    @Inject(Database) private db: Database,
    @Inject(Security) private security: Security,
    @Inject(TelegramApiService) private telegram: TelegramApiService,
    @Inject(HeadHunterService) private hh: HeadHunterService,
  ) {}

  onModuleInit() {
    if (this.security.config.NODE_ENV === 'test') return;
    this.connection = this.security.createBullMqConnection();
    this.queue = new Queue<PublicationJob>(QUEUE_NAME, { connection: this.connection });
    this.worker = new Worker<PublicationJob>(QUEUE_NAME, job => this.process(job), { connection: this.connection, concurrency: 2 });
    this.worker.on('error', error => this.logger.warn(`Publication worker error: ${error.message}`));
    void this.recoverQueued();
    this.recoveryTimer = setInterval(() => void this.recoverQueued(), 60_000);
    this.recoveryTimer.unref();
    this.searchTimer = setInterval(() => void this.refreshDueSearches(), 60 * 60 * 1000);
    this.searchTimer.unref();
    void this.refreshDueSearches();
  }

  async onModuleDestroy() {
    if (this.searchTimer) clearInterval(this.searchTimer);
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }

  private async enqueue(publicationId: number, action: PublicationJob['action']) {
    if (!this.queue) throw new ConflictException('Publication queue is unavailable');
    const row = await this.db.vacancyPublication.findUniqueOrThrow({ where: { id: publicationId }, select: { updatedAt: true } });
    const jobId = `publication-${publicationId}-${action}-${row.updatedAt.getTime()}`;
    const previous = await this.queue.getJob(jobId);
    if (previous) {
      const state = await previous.getState();
      if (state === 'completed' || state === 'failed') await previous.remove().catch(() => undefined);
      else return;
    }
    await this.queue.add(action, { publicationId, action }, {
      jobId,
      attempts: action === 'publish' ? 1 : 3,
      backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 200,
    });
  }

  private async recoverQueued() {
    await this.db.vacancyPublication.updateMany({
      where: { status: 'SENDING', updatedAt: { lt: new Date(Date.now() - 90_000) } },
      data: { status: 'UNKNOWN', error: 'Publication was interrupted after sending began. Verify the external listing before retrying.' },
    });
    const rows = await this.db.vacancyPublication.findMany({ where: { status: 'QUEUED' }, select: { id: true, vacancy: { select: { status: true } } } });
    for (const row of rows) await this.enqueue(row.id, row.vacancy.status === 'CLOSED' ? 'close' : 'publish').catch(() => undefined);
  }

  private async vacancy(companyId: number, vacancyId: number) {
    const vacancy = await this.db.vacancy.findFirst({ where: { id: vacancyId, companyId }, include: { company: { select: { name: true } }, requirements: true } });
    if (!vacancy) throw new BadRequestException('Vacancy not found');
    return vacancy;
  }

  private telegramText(vacancy: Awaited<ReturnType<ExternalRecruitingService['vacancy']>>, botUsername: string) {
    const applyUrl = `https://t.me/${botUsername}?start=apply_${vacancy.publicToken}`;
    const publicUrl = `${this.security.config.FRONTEND_ORIGIN}/apply/${vacancy.publicToken}`;
    return `📌 ${vacancy.title}\n🏢 ${vacancy.company.name}\n\n${vacancy.description.slice(0, 3200)}\n\n📄 Telegram orqali CV yuborish: ${applyUrl}\n🌐 Saytda ariza: ${publicUrl}`;
  }

  async channels(companyId: number) {
    return this.db.telegramChannel.findMany({ where: { companyId, enabled: true }, orderBy: { createdAt: 'asc' } });
  }

  async addChannel(user: Identity, chatId: string) {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Company administrator access required');
    const chat = await this.telegram.getChat(chatId);
    if (chat.type !== 'channel') throw new BadRequestException('Select a Telegram channel');
    const bot = await this.telegram.getMe();
    const member = await this.telegram.getChatMember(String(chat.id), bot.id);
    if (member.status !== 'administrator' || !member.can_post_messages) throw new ForbiddenException('Make the bot a channel administrator with posting permission');
    const existing = await this.db.telegramChannel.findUnique({ where: { chatId: String(chat.id) } });
    if (existing && existing.companyId !== user.companyId) throw new ConflictException('This channel is connected to another company');
    return this.db.telegramChannel.upsert({ where: { chatId: String(chat.id) }, create: { companyId: user.companyId, chatId: String(chat.id), title: chat.title ?? chat.username ?? String(chat.id), username: chat.username }, update: { title: chat.title ?? chat.username ?? String(chat.id), username: chat.username, enabled: true } });
  }

  async removeChannel(user: Identity, id: number) {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Company administrator access required');
    const channel = await this.db.telegramChannel.findFirst({ where: { id, companyId: user.companyId, enabled: true } });
    if (!channel) throw new BadRequestException('Channel not found');
    const live = await this.db.vacancyPublication.count({ where: { companyId: user.companyId, channelId: id, status: { not: 'CLOSED' }, OR: [{ externalId: { not: null } }, { status: { in: ['QUEUED', 'SENDING', 'UNKNOWN'] } }] } });
    if (live) throw new ConflictException('Close or resolve this channel’s vacancy posts before disconnecting it');
    await this.db.telegramChannel.update({ where: { id }, data: { enabled: false } });
    return { ok: true };
  }

  async preview(companyId: number, vacancyId: number) {
    const vacancy = await this.vacancy(companyId, vacancyId);
    const [channels, hhStatus, publications] = await Promise.all([
      this.channels(companyId), this.hh.status(companyId),
      this.db.vacancyPublication.findMany({ where: { companyId, vacancyId }, orderBy: { createdAt: 'asc' } }),
    ]);
    const bot = this.security.config.TELEGRAM_BOT_TOKEN ? await this.telegram.getMe().catch(() => null) : null;
    return {
      vacancy: { id: vacancy.id, title: vacancy.title, status: vacancy.status, revision: vacancy.revision, hhSearchCount: vacancy.hhSearchCount, hhSearchedAt: vacancy.hhSearchedAt, hhSearchError: vacancy.hhSearchError },
      botApplicationUrl: bot ? `https://t.me/${bot.username}?start=apply_${vacancy.publicToken}` : null,
      telegram: channels.map(channel => ({ channel, text: bot ? this.telegramText(vacancy, bot.username) : null })),
      headhunter: hhStatus,
      publications,
    };
  }

  async approve(user: Identity, vacancyId: number, input: { platform: 'TELEGRAM' | 'HEADHUNTER'; channelId?: number; employerServiceId?: string }) {
    if (!['ADMIN', 'HR', 'RECRUITER'].includes(user.role)) throw new ForbiddenException('Recruiter access required');
    const vacancy = await this.vacancy(user.companyId, vacancyId);
    if (vacancy.status !== 'ACTIVE') throw new ConflictException('Activate the vacancy before publishing');
    let destinationKey: string;
    let channelId: number | null = null;
    let text = '';
    let vacancyProperties: Array<{ property_type: string }> = [];
    if (input.platform === 'TELEGRAM') {
      if (!input.channelId) throw new BadRequestException('Choose a Telegram channel');
      const channel = await this.db.telegramChannel.findFirst({ where: { id: input.channelId, companyId: user.companyId, enabled: true } });
      if (!channel) throw new BadRequestException('Channel not connected');
      const bot = await this.telegram.getMe();
      const member = await this.telegram.getChatMember(channel.chatId, bot.id);
      if (member.status !== 'administrator' || !member.can_post_messages) throw new ForbiddenException('Bot cannot post to this channel');
      channelId = channel.id;
      destinationKey = channel.chatId;
      text = this.telegramText(vacancy, bot.username);
    } else {
      const status = await this.hh.status(user.companyId);
      if (!status.connected) throw new ConflictException('Connect a HeadHunter employer account first');
      if (status.connectedByUserId !== user.id) throw new ForbiddenException('Use the HeadHunter manager who connected this account');
      if (!vacancy.hhAreaId || !vacancy.hhProfessionalRoleId || !vacancy.hhExperienceId || !vacancy.hhEmploymentId || !vacancy.hhScheduleId) throw new BadRequestException('Complete HeadHunter vacancy fields first');
      destinationKey = status.employerId!;
    }
    const key = { vacancyId_platform_destinationKey: { vacancyId, platform: input.platform, destinationKey } } as const;
    const existing = await this.db.vacancyPublication.findUnique({ where: key });
    if (existing?.status === 'UNKNOWN') throw new ConflictException('Check the channel and resolve the uncertain post before retrying');
    if (existing?.status === 'QUEUED' || existing?.status === 'SENDING') return existing;
    if (existing?.status === 'PUBLISHED' && existing.approvedRevision === vacancy.revision) return existing;
    if (input.platform === 'HEADHUNTER' && (!existing?.externalId || existing.status === 'CLOSED')) {
      if (!input.employerServiceId) throw new BadRequestException('Choose and approve a HeadHunter publication package');
      const packages = await this.hh.packages(user.companyId, vacancy.hhAreaId!, vacancy.hhProfessionalRoleId!) as { publication_variants?: Array<{ vacancy_properties?: { required?: Array<{ property_type: string }> }; suitable_packages?: Array<{ employer_service_id: string; invalid?: boolean; count?: number }> }> };
      const selected = packages.publication_variants?.find(v => v.suitable_packages?.some(p => p.employer_service_id === input.employerServiceId && !p.invalid && (p.count ?? 0) > 0));
      if (!selected?.vacancy_properties?.required?.length) throw new BadRequestException('Selected HeadHunter package is not available');
      vacancyProperties = selected.vacancy_properties.required;
    }
    const previousId = input.platform === 'HEADHUNTER' && existing?.status === 'CLOSED' ? existing.externalId : null;
    const snapshot = { title: vacancy.title, description: vacancy.description, text, areaId: vacancy.hhAreaId, roleId: vacancy.hhProfessionalRoleId, experienceId: vacancy.hhExperienceId, employmentId: vacancy.hhEmploymentId, scheduleId: vacancy.hhScheduleId, employerServiceId: input.employerServiceId ?? null, vacancyProperties, previousId };
    const data = { channelId, status: 'QUEUED' as const, approvedRevision: vacancy.revision, approvedPayload: snapshot, error: null, approvedById: user.id, approvedAt: new Date(), ...(previousId ? { externalId: null, externalUrl: null } : {}) };
    let publication;
    if (existing) {
      const claimed = await this.db.vacancyPublication.updateMany({
        where: { id: existing.id, status: { in: ['FAILED', 'STALE', 'CLOSED', 'PUBLISHED', 'PENDING_APPROVAL'] } },
        data,
      });
      if (!claimed.count) return this.db.vacancyPublication.findUniqueOrThrow({ where: { id: existing.id } });
      publication = await this.db.vacancyPublication.findUniqueOrThrow({ where: { id: existing.id } });
    } else {
      try {
        publication = await this.db.vacancyPublication.create({
          data: { companyId: user.companyId, vacancyId, platform: input.platform, destinationKey, ...data },
        });
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error;
        return this.db.vacancyPublication.findUniqueOrThrow({ where: key });
      }
    }
    await this.enqueue(publication.id, 'publish').catch(error => this.logger.warn(`Publication queued for recovery: ${(error as Error).message}`));
    return publication;
  }

  async vacancyChanged(companyId: number, vacancyId: number, status: string) {
    if (status === 'CLOSED') {
      const rows = await this.db.vacancyPublication.findMany({ where: { companyId, vacancyId, externalId: { not: null }, status: { not: 'CLOSED' } }, select: { id: true } });
      for (const row of rows) {
        await this.db.vacancyPublication.update({ where: { id: row.id }, data: { status: 'QUEUED' } });
        await this.enqueue(row.id, 'close').catch(error => this.logger.warn(`Close queued for recovery: ${(error as Error).message}`));
      }
    } else if (status === 'ACTIVE') {
      await this.db.vacancyPublication.updateMany({ where: { companyId, vacancyId, status: 'PUBLISHED' }, data: { status: 'STALE' } });
    }
  }

  async assertCanDelete(companyId: number, vacancyId: number) {
    const count = await this.db.vacancyPublication.count({ where: { companyId, vacancyId, status: { not: 'CLOSED' }, OR: [{ externalId: { not: null } }, { status: { in: ['QUEUED', 'SENDING', 'UNKNOWN'] } }] } });
    if (count) throw new ConflictException('Close external publications before deleting this vacancy');
  }

  async confirmMissing(user: Identity, publicationId: number) {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Company administrator access required');
    const publication = await this.db.vacancyPublication.findFirst({ where: { id: publicationId, companyId: user.companyId, status: 'UNKNOWN', externalId: null } });
    if (!publication) throw new BadRequestException('Uncertain publication not found');
    return this.db.vacancyPublication.update({ where: { id: publicationId }, data: { status: 'FAILED', error: 'Admin confirmed no external post exists; retry is available' } });
  }

  async confirmFound(user: Identity, publicationId: number, externalId: string) {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Company administrator access required');
    if (!/^\d{1,20}$/.test(externalId)) throw new BadRequestException('Enter a numeric platform post ID');
    const publication = await this.db.vacancyPublication.findFirst({
      where: { id: publicationId, companyId: user.companyId, status: 'UNKNOWN', externalId: null },
      include: { channel: true, vacancy: true },
    });
    if (!publication) throw new BadRequestException('Uncertain publication not found');
    if (publication.platform === 'TELEGRAM') {
      const messageId = Number(externalId);
      if (!Number.isSafeInteger(messageId)) throw new BadRequestException('Invalid Telegram message ID');
      const text = (publication.approvedPayload as { text?: string } | null)?.text ?? publication.vacancy.title;
      const verified = await this.telegram.editMessageText(publication.destinationKey, messageId, `${text}\n\n#HRV${publication.id}\u200b`);
      if (!verified.ok && !verified.description?.toLowerCase().includes('message is not modified')) throw new BadRequestException('Bot could not verify or edit that channel post');
    } else {
      const found = await this.hh.request(user.companyId, `/vacancies/${externalId}?host=hh.uz`) as { employer?: { id?: string } };
      if (String(found.employer?.id) !== publication.destinationKey) throw new BadRequestException('HeadHunter vacancy belongs to another employer');
    }
    const status = publication.vacancy.status === 'CLOSED' ? 'QUEUED' : publication.vacancy.revision !== publication.approvedRevision ? 'STALE' : 'PUBLISHED';
    const externalUrl = publication.platform === 'TELEGRAM'
      ? publication.channel?.username ? `https://t.me/${publication.channel.username}/${externalId}` : null
      : `https://hh.uz/vacancy/${externalId}`;
    const updated = await this.db.vacancyPublication.update({ where: { id: publicationId }, data: { externalId, externalUrl, status, error: null, publishedAt: new Date() } });
    if (status === 'QUEUED') await this.enqueue(publicationId, 'close').catch(error => this.logger.warn(`Close queued for recovery: ${(error as Error).message}`));
    return updated;
  }

  private async process(job: Job<PublicationJob>) {
    await this.db.$transaction(async tx => {
      const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(1095846980, ${job.data.publicationId}) AS locked`;
      if (!lock?.locked) return;
      await this.processLocked(job);
    }, { maxWait: 10_000, timeout: 60_000 });
  }

  private async processLocked(job: Job<PublicationJob>) {
    const publication = await this.db.vacancyPublication.findUnique({ where: { id: job.data.publicationId }, include: { vacancy: true, channel: true } });
    if (!publication || publication.status !== 'QUEUED') return;
    let unknownOutcome = false;
    try {
      if (job.data.action === 'close' || publication.vacancy.status === 'CLOSED') {
        if (publication.externalId && publication.platform === 'TELEGRAM') {
          const text = (publication.approvedPayload as { text?: string } | null)?.text ?? publication.vacancy.title;
          const result = await this.telegram.editMessageText(publication.destinationKey, Number(publication.externalId), `⛔ VAKANSIYA YOPILDI\n\n${text.slice(0, 3850)}\n\n#HRV${publication.id}`);
          if (!result.ok) throw new Error(result.description ?? 'Telegram edit failed');
        } else if (publication.externalId) {
          await this.hh.request(publication.companyId, `/employers/${encodeURIComponent(publication.destinationKey)}/vacancies/archived/${encodeURIComponent(publication.externalId)}?host=hh.uz`, 'PUT', {});
        }
        await this.db.vacancyPublication.update({ where: { id: publication.id }, data: { status: 'CLOSED', error: null } });
        return;
      }
      if (publication.vacancy.revision !== publication.approvedRevision) {
        await this.db.vacancyPublication.update({ where: { id: publication.id }, data: { status: 'STALE', error: 'Vacancy changed after approval' } });
        return;
      }
      const snapshot = publication.approvedPayload as { title: string; description: string; text: string; areaId: string; roleId: string; experienceId: string; employmentId: string; scheduleId: string; employerServiceId: string; vacancyProperties: Array<{ property_type: string }>; previousId?: string | null };
      let externalId = publication.externalId;
      let externalUrl = publication.externalUrl;
      if (!externalId) {
        const claimed = await this.db.vacancyPublication.updateMany({ where: { id: publication.id, status: 'QUEUED' }, data: { status: 'SENDING' } });
        if (!claimed.count) return;
      }
      if (publication.platform === 'TELEGRAM') {
        const result = externalId
          ? await this.telegram.editMessageText(publication.destinationKey, Number(externalId), `${snapshot.text}\n\n#HRV${publication.id}`)
          : await this.telegram.sendMessage(publication.destinationKey, `${snapshot.text}\n\n#HRV${publication.id}`);
        if (!result.ok) {
          unknownOutcome = !externalId && 'uncertain' in result && Boolean(result.uncertain);
          throw new Error(result.description ?? 'Telegram publishing failed');
        }
        externalId = String(('result' in result ? result.result?.message_id : undefined) ?? externalId);
        externalUrl = publication.channel?.username ? `https://t.me/${publication.channel.username}/${externalId}` : null;
      } else {
        const payload = externalId
          ? { name: snapshot.title, description: escapeHtml(snapshot.description).replace(/\n/g, '<br>') }
          : { name: snapshot.title, description: escapeHtml(snapshot.description).replace(/\n/g, '<br>'), area: { id: snapshot.areaId }, professional_roles: [{ id: snapshot.roleId }], experience: { id: snapshot.experienceId }, employment: { id: snapshot.employmentId }, schedule: { id: snapshot.scheduleId }, vacancy_properties: { properties: snapshot.vacancyProperties }, employer_service_id: snapshot.employerServiceId, ...(snapshot.previousId ? { previous_id: snapshot.previousId } : {}) };
        const result = await this.hh.request(publication.companyId, externalId ? `/vacancies/${encodeURIComponent(externalId)}?host=hh.uz` : '/vacancies?host=hh.uz', externalId ? 'PUT' : 'POST', payload) as { id?: string };
        externalId = String(result.id ?? externalId);
        externalUrl = `https://hh.uz/vacancy/${externalId}`;
      }
      if (!externalId || externalId === 'undefined') {
        unknownOutcome = true;
        throw new Error('External publication ID missing');
      }
      await this.db.vacancyPublication.update({ where: { id: publication.id }, data: { status: 'PUBLISHED', externalId, externalUrl, error: null, publishedAt: new Date() } });
      const current = await this.db.vacancy.findUnique({ where: { id: publication.vacancyId }, select: { status: true, revision: true } });
      if (current?.status === 'CLOSED') {
        await this.db.vacancyPublication.update({ where: { id: publication.id }, data: { status: 'QUEUED' } });
        await this.enqueue(publication.id, 'close').catch(error => this.logger.warn(`Close queued for recovery: ${(error as Error).message}`));
      } else if (current && current.revision !== publication.approvedRevision) {
        await this.db.vacancyPublication.updateMany({ where: { id: publication.id, status: 'PUBLISHED' }, data: { status: 'STALE' } });
      }
    } catch (error) {
      if (publication.platform === 'HEADHUNTER' && !publication.externalId && (error instanceof TypeError || error instanceof HeadHunterUncertainResponse || (error as Error).name === 'TimeoutError')) unknownOutcome = true;
      const retry = job.data.action === 'close' && job.attemptsMade + 1 < (job.opts.attempts ?? 1);
      this.logger.warn(`Publication ${publication.id} failed: ${(error as Error).message}`);
      if (retry) throw error;
      await this.db.vacancyPublication.updateMany({ where: { id: publication.id, status: { in: ['QUEUED', 'SENDING'] } }, data: { status: unknownOutcome ? 'UNKNOWN' : 'FAILED', error: unknownOutcome ? 'Platform response was lost. Check the external listing before retrying.' : (error as Error).message.slice(0, 500) } });
    }
  }

  async search(user: Identity, vacancyId: number, page = 0) {
    const status = await this.hh.status(user.companyId);
    if (status.connectedByUserId !== user.id) throw new ForbiddenException('Connect your HeadHunter manager account to view resumes');
    const vacancy = await this.vacancy(user.companyId, vacancyId);
    if (vacancy.status !== 'ACTIVE') throw new ConflictException('Vacancy is not active');
    await this.security.limit(`hh-resume-search:${user.companyId}:${user.id}`, 10, 3600);
    return this.hh.search(user.companyId, vacancy, page);
  }

  private async refreshDueSearches() {
    if (!this.hh.configured) return;
    const due = await this.db.vacancy.findMany({ where: { status: 'ACTIVE', company: { isActive: true, hhConnection: { isNot: null } }, OR: [{ hhSearchedAt: null }, { hhSearchedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }] }, select: { id: true, companyId: true, title: true, hhAreaId: true, hhProfessionalRoleId: true }, take: 100 });
    for (const vacancy of due) {
      const claimed = await this.db.vacancy.updateMany({ where: { id: vacancy.id, OR: [{ hhSearchedAt: null }, { hhSearchedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }] }, data: { hhSearchedAt: new Date() } });
      if (!claimed.count) continue;
      try {
        const result = await this.hh.search(vacancy.companyId, vacancy);
        await this.db.vacancy.update({ where: { id: vacancy.id }, data: { hhSearchCount: result.total, hhSearchError: null } });
      } catch (error) {
        await this.db.vacancy.update({ where: { id: vacancy.id }, data: { hhSearchError: (error as Error).message.slice(0, 300) } });
      }
    }
  }
}
