import { Module } from '@nestjs/common';
import { VacanciesController } from './vacancies.controller';
import { VacanciesService } from './vacancies.service';
import { ExternalRecruitingModule } from '../external-recruiting/external-recruiting.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [ExternalRecruitingModule, AiModule],
  controllers: [VacanciesController],
  providers: [VacanciesService],
  exports: [VacanciesService],
})
export class VacanciesModule {}

