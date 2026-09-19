import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { Prisma } from '../../generated/prisma/client';
import { Database } from '../../database/prisma.service';
import { R2Storage } from '../../common/storage/r2-storage.service';
import { getConfig } from '../../config/app.config';
import { extractResume } from '../resumes/resumes.service';
import { TelegramApiService } from './telegram-api.service';
import { TELEGRAM_RESUME_QUEUE } from './telegram-queue.service';
import type { TelegramResumeJob } from './types/telegram.types';

@Injectable()
export class TelegramResumeProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramResumeProcessor.name);
  private readonly config = getConfig();
  private worker?: Worker<TelegramResumeJob>;
  private connection?: Redis;

  constructor(
    @Inject(Database) private db: Database,
    @Inject(TelegramApiService) private telegramApi: TelegramApiService,
    @Inject(R2Storage) private storage: R2Storage,
  ) {}

  onModuleInit() {
    if (!this.config.TELEGRAM_BOT_TOKEN || !this.storage.enabled) return;
    this.connection = new Redis(this.config.REDIS_URL, { maxRetriesPerRequest: null });
    this.worker = new Worker<TelegramResumeJob>(TELEGRAM_RESUME_QUEUE, (job) => this.process(job), {
      connection: this.connection,
      concurrency: 2,
    });
    this.worker.on('failed', (job) => {
      if (job) this.logger.warn(`Telegram resume job failed resumeId=${job.data.resumeId}`);
    });
  }

  private async process(job: Job<TelegramResumeJob>) {
    const { resumeId, candidateId, companyId, fileId } = job.data;
    const resume = await this.db.resume.findFirstOrThrow({
      where: { id: resumeId, candidateId, companyId },
    });
    const candidate = await this.db.candidate.findUniqueOrThrow({
      where: { id_companyId: { id: candidateId, companyId } },
      select: { email: true, phone: true },
    });
    await this.db.$transaction([
      this.db.resume.update({
        where: { id: resumeId },
        data: { status: 'PROCESSING', error: null },
      }),
      this.db.candidateEvent.create({
        data: { companyId, candidateId, type: 'RESUME_PROCESSING', label: 'CV parsing started' },
      }),
    ]);

    let objectKey: string | null = null;
    try {
      const file = await this.telegramApi.getFile(fileId);
      if ((file.file_size ?? resume.fileSize ?? 0) > 10 * 1024 * 1024)
        throw new Error('Telegram CV exceeds the 10 MB limit');
      const buffer = await this.telegramApi.downloadFile(file.file_path!);
      const extracted = await extractResume(
        {
          originalname: resume.fileName,
          mimetype: resume.mimeType || 'application/octet-stream',
          size: buffer.length,
          buffer,
        } as Express.Multer.File,
        10 * 1024 * 1024,
      );
      objectKey = await this.storage.putResume(
        companyId,
        candidateId,
        resume.fileName,
        extracted.mime,
        buffer,
      );
      await this.db.$transaction(async (tx) => {
        await tx.resume.update({
          where: { id: resumeId },
          data: {
            objectKey,
            mimeType: extracted.mime,
            fileSize: buffer.length,
            rawText: extracted.text,
            status: 'COMPLETED',
            error: null,
          },
        });
        await tx.candidate.update({
          where: { id_companyId: { id: candidateId, companyId } },
          data: {
            resumeData: null,
            resumeObjectKey: objectKey,
            resumeSize: buffer.length,
            resumeText: extracted.text,
            resumeMime: extracted.mime,
            resumeName: resume.fileName,
            email: candidate.email ? undefined : (extracted.contacts.email ?? undefined),
            phone: candidate.phone ? undefined : (extracted.contacts.phone ?? undefined),
            resumeRevision: { increment: 1 },
            parsedResume: Prisma.DbNull,
            skills: Prisma.DbNull,
            experience: Prisma.DbNull,
            education: Prisma.DbNull,
            languages: Prisma.DbNull,
          },
        });
        await tx.application.updateMany({
          where: { companyId, candidateId },
          data: {
            analysis: Prisma.DbNull,
            interviewQuestions: Prisma.DbNull,
            analyzedResumeRevision: null,
            analyzedVacancyRevision: null,
          },
        });
        await tx.candidateEvent.create({
          data: {
            companyId,
            candidateId,
            type: 'RESUME_COMPLETED',
            label: 'CV parsed successfully',
          },
        });
      });
    } catch (error) {
      if (objectKey) await this.storage.delete(objectKey).catch(() => undefined);
      const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await this.db.resume.update({
        where: { id: resumeId },
        data: { status: finalAttempt ? 'FAILED' : 'PENDING', error: 'CV processing failed' },
      });
      if (finalAttempt)
        await this.db.candidateEvent.create({
          data: {
            companyId,
            candidateId,
            type: 'RESUME_FAILED',
            label: 'CV processing failed',
          },
        });
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    this.connection?.disconnect();
  }
}
