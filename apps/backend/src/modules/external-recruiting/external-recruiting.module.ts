import { Module } from '@nestjs/common';
import { ExternalRecruitingController, HeadHunterCallbackController } from './external-recruiting.controller';
import { ExternalRecruitingService } from './external-recruiting.service';
import { HeadHunterService } from './headhunter.service';
import { TelegramApiService } from '../telegram/telegram-api.service';

@Module({
  controllers: [ExternalRecruitingController, HeadHunterCallbackController],
  providers: [ExternalRecruitingService, HeadHunterService, TelegramApiService],
  exports: [ExternalRecruitingService, HeadHunterService],
})
export class ExternalRecruitingModule {}
