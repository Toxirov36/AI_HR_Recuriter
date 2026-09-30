import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { Database } from '../../database/prisma.service';
import { Security } from '../../common/utils/security';

export const RESUME_PARSE_QUEUE = 'resume-parse-processing';

export interface ParseProgress {
  status: 'PENDING' | 'EXTRACTING' | 'PARSING' | 'STRUCTURING' | 'COMPLETED' | 'FAILED';
  step: number;
  totalSteps: number;
  message: string;
  percent: number;
  error?: string;
  updatedAt: number;
}

export interface ResumeParseJobData {
  companyId: number;
  candidateId: number;
  userId: number;
}

@Injectable()
export class ResumeQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ResumeQueueService.name);
  private readonly memoryProgress = new Map<string, ParseProgress>();
  private readonly connection?: Redis;
  private workerConnection?: Redis;
  private readonly queue?: Queue<ResumeParseJobData>;
  private worker?: Worker<ResumeParseJobData>;

  constructor(
    @Inject(Database) private db: Database,
    @Inject(Security) private security: Security,
  ) {
    // test muhitida BullMQ connection ochilmaydi — in-memory fallback ishlaydi.
    if (this.security?.config?.NODE_ENV !== 'test') {
      try {
        // Security orqali BullMQ connection yaratiladi — URL manbai yagona.
        this.connection = this.security.createBullMqConnection();
        this.queue = new Queue<ResumeParseJobData>(RESUME_PARSE_QUEUE, {
          connection: this.connection,
        });
      } catch {
        this.logger.warn('Redis queue connection failed. In-memory queue fallback enabled.');
      }
    }
  }


  async setProgress(
    companyId: number,
    candidateId: number,
    progress: Omit<ParseProgress, 'updatedAt'>,
  ) {
    const data: ParseProgress = {
      ...progress,
      updatedAt: Date.now(),
    };
    const key = `parse-progress:${companyId}:${candidateId}`;
    this.memoryProgress.set(key, data);

    try {
      await this.security.redis.set(key, JSON.stringify(data), 'EX', 600);
    } catch {
      // Memory fallback is always active
    }
  }

  async getProgress(companyId: number, candidateId: number): Promise<ParseProgress | null> {
    const key = `parse-progress:${companyId}:${candidateId}`;
    try {
      const stored = await this.security.redis.get(key);
      if (stored) {
        return JSON.parse(stored) as ParseProgress;
      }
    } catch {
      // Ignore redis failure and fallback to memory
    }
    return this.memoryProgress.get(key) ?? null;
  }

  async addJob(data: ResumeParseJobData): Promise<boolean> {
    if (this.queue) {
      try {
        await this.queue.add('resume-parse', data, {
          removeOnComplete: 100,
          removeOnFail: 100,
          attempts: 2,
        });
        return true;
      } catch (err) {
        this.logger.warn(`Failed to add job to BullMQ queue: ${(err as Error).message}`);
      }
    }
    return false;
  }

  registerWorker(processor: (data: ResumeParseJobData) => Promise<void>) {
    if (this.security?.config?.NODE_ENV === 'test') return;
    if (!this.worker) {
      try {
        // Worker ham Security factory orqali — URL manbai yagona.
        this.workerConnection = this.security.createBullMqConnection();

        this.worker = new Worker<ResumeParseJobData>(
          RESUME_PARSE_QUEUE,
          async (job: Job<ResumeParseJobData>) => {
            await processor(job.data);
          },
          { connection: this.workerConnection },
        );
        this.worker.on('error', (err) => {
          this.logger.warn(`BullMQ worker error: ${err.message}`);
        });
      } catch (err) {
        this.logger.warn(`Failed to start BullMQ worker: ${(err as Error).message}`);
      }
    }
  }

  async clearProgress(companyId: number, candidateId: number) {
    const key = `parse-progress:${companyId}:${candidateId}`;
    this.memoryProgress.delete(key);
    try {
      await this.security.redis.del(key);
    } catch {}
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.worker?.close();
    this.connection?.disconnect();
    this.workerConnection?.disconnect();
  }
}
