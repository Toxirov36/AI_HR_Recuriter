import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { Database } from '../../database/prisma.service';
import { Security } from '../../common/utils/security';
import { AiService } from './ai.service';

export const AUTO_MATCH_QUEUE = 'telegram-consented-auto-match';
export type AutoMatchJob = { companyId: number; candidateId: number; applicationId: number; resumeRevision: number };

@Injectable()
export class AutoMatchService implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker<AutoMatchJob>;
  private connection?: Redis;
  private readonly logger = new Logger(AutoMatchService.name);
  constructor(@Inject(Database) private db: Database, @Inject(Security) private security: Security, @Inject(AiService) private ai: AiService) {}

  onModuleInit() {
    if (this.security.config.NODE_ENV === 'test' || !this.security.config.GEMINI_API_KEY) return;
    this.connection = this.security.createBullMqConnection();
    this.worker = new Worker<AutoMatchJob>(AUTO_MATCH_QUEUE, async job => {
      const { companyId, candidateId, applicationId, resumeRevision } = job.data;
      const app = await this.db.application.findFirst({
        where: { id: applicationId, companyId, candidateId, vacancy: { status: 'ACTIVE' } },
        select: { analysis: true, aiConsentGranted: true, candidate: { select: { publicSubmittedAt: true, aiConsentAt: true, resumeRevision: true, resumeText: true } } },
      });
      if (!app || app.aiConsentGranted !== true || !app.candidate.publicSubmittedAt || !app.candidate.aiConsentAt || !app.candidate.resumeText || app.candidate.resumeRevision !== resumeRevision || app.analysis) return;
      await this.ai.analyze(companyId, applicationId, -companyId);
    }, { connection: this.connection, concurrency: 2 });
    this.worker.on('failed', job => { if (job) this.logger.warn(`Automatic match failed applicationId=${job.data.applicationId}`); });
    this.worker.on('error', error => this.logger.warn(`Automatic match worker error: ${error.message}`));
  }

  async onModuleDestroy() {
    await this.worker?.close();
    this.connection?.disconnect();
  }
}
