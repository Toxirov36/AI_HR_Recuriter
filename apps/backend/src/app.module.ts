import 'reflect-metadata';
import {
  Controller,
  Get,
  Inject,
  Module,
  ServiceUnavailableException,
  INestApplication,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, Request, Response, NextFunction } from 'express';

import { Database } from './database/prisma.service';
import { PrismaModule } from './database/prisma.module';
import { Security } from './common/utils/security';
import { CommonModule } from './common/common.module';
import { ErrorFilter } from './common/filters/error.filter';
import { getConfig } from './config/app.config';

import { AuthModule } from './modules/auth/auth.module';
import { VacanciesModule } from './modules/vacancies/vacancies.module';
import { CandidatesModule } from './modules/candidates/candidates.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { ResumesModule } from './modules/resumes/resumes.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AiModule } from './modules/ai/ai.module';
import { TelegramModule } from './modules/telegram/telegram.module';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(Security) private security: Security,
  ) {}

  @Get()
  async health() {
    try {
      await Promise.all([this.db.$queryRaw`SELECT 1`, this.security.redis.ping()]);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('A required service is unavailable');
    }
  }
}

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    AuthModule,
    VacanciesModule,
    CandidatesModule,
    ApplicationsModule,
    ResumesModule,
    DashboardModule,
    AiModule,
    TelegramModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

export async function createApp() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(), { bodyParser: false });
  return configureApp(app);
}

export function configureApp(app: INestApplication) {
  const config = getConfig();
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.use(json({ limit: '128kb' }));
  app.enableCors({
    origin: config.FRONTEND_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Requested-With'],
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    const telegramWebhook = req.path === '/api/v1/integrations/telegram/webhook';
    if (
      !telegramWebhook &&
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (req.headers['x-requested-with'] !== 'recruiter-web' ||
        (req.headers.origin && req.headers.origin !== config.FRONTEND_ORIGIN))
    ) {
      res.status(403).json({ message: 'Invalid request origin or CSRF header' });
      return;
    }
    next();
  });
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  return app;
}
