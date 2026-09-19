import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TelegramApiService } from './telegram-api.service';
import { TelegramQueueService } from './telegram-queue.service';
import { TelegramResumeProcessor } from './telegram-resume.processor';
import { BusinessConnectionHandler } from './handlers/business-connection.handler';
import { BusinessMessageHandler } from './handlers/business-message.handler';

@Module({
  controllers: [TelegramController],
  providers: [
    TelegramService,
    TelegramApiService,
    TelegramQueueService,
    TelegramResumeProcessor,
    BusinessConnectionHandler,
    BusinessMessageHandler,
  ],
  exports: [TelegramService],
})
export class TelegramModule {}
