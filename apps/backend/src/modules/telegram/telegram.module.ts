import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TelegramApiService } from './telegram-api.service';
import { TelegramQueueService } from './telegram-queue.service';
import { TelegramResumeProcessor } from './telegram-resume.processor';
import { BusinessConnectionHandler } from './handlers/business-connection.handler';
import { BusinessMessageHandler } from './handlers/business-message.handler';
import { TelegramApplyService } from './telegram-apply.service';
import { TelegramJoinService } from './telegram-join.service';
import { TelegramLanguageService } from './telegram-language.service';
import { TelegramMyApplicationsService } from './telegram-my-applications.service';
import { TelegramScreeningAlertService } from './telegram-screening-alert.service';
import { AuditModule } from '../audit/audit.module';
import { ExternalRecruitingModule } from '../external-recruiting/external-recruiting.module';
import { GeminiProvider } from '../ai/providers/gemini.provider';
import { TelegramAdminService } from './telegram-admin.service';

@Module({
  imports: [AuditModule, ExternalRecruitingModule],
  controllers: [TelegramController],
  providers: [
    TelegramService,
    TelegramApiService,
    TelegramQueueService,
    TelegramResumeProcessor,
    BusinessConnectionHandler,
    BusinessMessageHandler,
    TelegramApplyService,
    TelegramJoinService,
    TelegramScreeningAlertService,
    TelegramLanguageService,
    TelegramMyApplicationsService,
    TelegramAdminService,
    GeminiProvider,
  ],
  exports: [TelegramService, TelegramApiService],
})
export class TelegramModule {}
