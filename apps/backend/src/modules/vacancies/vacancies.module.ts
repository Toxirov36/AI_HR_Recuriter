import { Module } from '@nestjs/common';
import { VacanciesController } from './vacancies.controller';
import { VacanciesService } from './vacancies.service';
import { VacancyAssessmentService } from './vacancy-assessment.service';
import { ExternalRecruitingModule } from '../external-recruiting/external-recruiting.module';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [ExternalRecruitingModule, AiModule, AuditModule],
  controllers: [VacanciesController],
  providers: [VacanciesService, VacancyAssessmentService],
  exports: [VacanciesService],
})
export class VacanciesModule {}

