import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramModule } from '../telegram/telegram.module';
import { TelegramRejectHandler } from './telegram-reject.handler';

@Module({
  imports: [NotificationsModule, TelegramModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, TelegramRejectHandler],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
