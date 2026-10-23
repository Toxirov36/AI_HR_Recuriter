import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramModule } from '../telegram/telegram.module';
import { InterviewsController, PublicInterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';

@Module({
  imports: [AuditModule, GoogleCalendarModule, NotificationsModule, TelegramModule],
  controllers: [InterviewsController, PublicInterviewsController],
  providers: [InterviewsService],
  exports: [InterviewsService],
})
export class InterviewsModule {}
