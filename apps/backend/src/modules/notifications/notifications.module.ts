import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { TelegramModule } from '../telegram/telegram.module';
import { NotificationService } from './notification.service';
import { EmailService } from './email.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [PrismaModule, TelegramModule],
  controllers: [NotificationsController],
  providers: [NotificationService, EmailService],
  exports: [NotificationService, EmailService],
})
export class NotificationsModule {}
