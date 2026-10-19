import { Module } from '@nestjs/common';
import { ExternalRecruitingController, HeadHunterCallbackController } from './external-recruiting.controller';
import { ExternalRecruitingService } from './external-recruiting.service';
import { HeadHunterService } from './headhunter.service';
import { TelegramApiService } from '../telegram/telegram-api.service';
import { GeminiProvider } from '../ai/providers/gemini.provider';
import { TelegramDiscoveryClient } from './telegram-discovery.client';
import { TelegramDiscoveryService } from './telegram-discovery.service';

@Module({
  controllers: [ExternalRecruitingController, HeadHunterCallbackController],
  providers: [ExternalRecruitingService, HeadHunterService, TelegramApiService, GeminiProvider, TelegramDiscoveryClient, TelegramDiscoveryService],
  exports: [ExternalRecruitingService, HeadHunterService],
})
export class ExternalRecruitingModule {}
