import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { getConfig } from '../../config/app.config';
import type { TelegramResumeJob } from './types/telegram.types';

export const TELEGRAM_RESUME_QUEUE = 'telegram-resume-processing';

@Injectable()
export class TelegramQueueService implements OnModuleDestroy {
  private readonly connection?: Redis;
  private readonly queue?: Queue<TelegramResumeJob>;

  constructor() {
    const config = getConfig();
    if (config.NODE_ENV === 'test' || !config.TELEGRAM_BOT_TOKEN) return;
    this.connection = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.queue = new Queue<TelegramResumeJob>(TELEGRAM_RESUME_QUEUE, {
      connection: this.connection,
    });
  }

  add(data: TelegramResumeJob) {
    if (!this.queue) throw new Error('Telegram resume queue is not configured');
    return this.queue.add('process-resume', data, {
      jobId: `telegram-resume-${data.resumeId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }

  async onModuleDestroy() {
    await this.queue?.close();
    this.connection?.disconnect();
  }
}
