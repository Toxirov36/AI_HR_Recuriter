import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { GeminiProvider } from './providers/gemini.provider';
import { ResumesModule } from '../resumes/resumes.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ResumesModule, NotificationsModule],
  controllers: [AiController],
  providers: [AiService, GeminiProvider],
  exports: [AiService],
})
export class AiModule {}
