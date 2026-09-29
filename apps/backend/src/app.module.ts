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
import { isAllowedOrigin } from './common/utils/origin';

import { AuthModule } from './modules/auth/auth.module';
import { VacanciesModule } from './modules/vacancies/vacancies.module';
import { CandidatesModule } from './modules/candidates/candidates.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { ResumesModule } from './modules/resumes/resumes.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AiModule } from './modules/ai/ai.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { RetentionModule } from './modules/retention/retention.module';
import { PublicApplicationsModule } from './modules/public-applications/public-applications.module';
import { CompanyAdminModule } from './modules/company-admin/company-admin.module';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module';

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
    NotificationsModule,
    AuditModule,
    RetentionModule,
    PublicApplicationsModule,
    CompanyAdminModule,
    PlatformAdminModule,
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
    origin: (origin: string | undefined, callback: (error: Error | null, allow: boolean) => void) =>
      callback(null, !origin || isAllowedOrigin(origin, config.FRONTEND_ORIGIN, config.NODE_ENV)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Requested-With'],
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    // Telegram webhook path — global prefix + controller + endpoint dan tuzilgan.
    // Regex ishlatiladi: hardcode satr o'zgarsa ham moslik saqlansin.
    const isTelegramWebhook = /^\/api\/v1\/integrations\/telegram\/webhook\/?$/.test(req.path);
    if (
      !isTelegramWebhook &&
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (req.headers['x-requested-with'] !== 'recruiter-web' ||
        (req.headers.origin && !isAllowedOrigin(req.headers.origin, config.FRONTEND_ORIGIN, config.NODE_ENV)))
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
