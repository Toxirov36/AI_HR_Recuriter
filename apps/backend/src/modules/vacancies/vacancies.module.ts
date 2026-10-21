import { Module } from '@nestjs/common';
import { VacanciesController } from './vacancies.controller';
import { VacanciesService } from './vacancies.service';
import { ExternalRecruitingModule } from '../external-recruiting/external-recruiting.module';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../audit/audit.module';
import { VacancyFieldsController } from './vacancy-fields.controller';
import { VacancyFieldsService } from './vacancy-fields.service';

@Module({
  imports: [ExternalRecruitingModule, AiModule, AuditModule],
  controllers: [VacanciesController, VacancyFieldsController],
  providers: [VacanciesService, VacancyFieldsService],
  exports: [VacanciesService, VacancyFieldsService],
})
export class VacanciesModule {}

