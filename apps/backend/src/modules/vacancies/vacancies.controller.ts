import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AuthRequest } from '../../common/utils/security';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { VacanciesService } from './vacancies.service';
import { VacancyAssessmentService } from './vacancy-assessment.service';
import { vacancyAssessmentSchema, type VacancyAssessment } from '../ai/schemas/assessment.schema';
import {
  VacancyDto,
  vacancySchema,
  CreateVacancyDto,
  UpdateVacancyDto,
  QueryVacancyDto,
  paginationSchema,
} from './dto';

@Controller('vacancies')
@UseGuards(AuthGuard)
export class VacanciesController {
  constructor(
    @Inject(VacanciesService) private service: VacanciesService,
    @Inject(VacancyAssessmentService) private assessments: VacancyAssessmentService,
  ) {}

  @Get()
  async vacancies(
    @Req() req: AuthRequest,
    @Query(new ZodValidationPipe(paginationSchema)) query: QueryVacancyDto,
  ) {
    return this.service.list(req.user.companyId, query);
  }

  @Get(':id')
  getVacancy(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.vacancy(req.user.companyId, id);
  }

  @Get(':id/assessment')
  assessment(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.assessments.view(req.user.companyId, id);
  }

  @Post(':id/assessment/generate')
  generateAssessment(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.assessments.generate(req.user, id);
  }

  @Put(':id/assessment')
  saveAssessment(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(vacancyAssessmentSchema)) dto: VacancyAssessment,
  ) {
    return this.assessments.save(req.user, id, dto);
  }

  @Post(':id/assessment/approve')
  approveAssessment(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.assessments.approve(req.user, id);
  }

  @Post()
  createVacancy(
    @Req() req: AuthRequest,
    @Body(new ZodValidationPipe(vacancySchema)) dto: CreateVacancyDto,
  ) {
    return this.service.saveVacancy(req.user.companyId, null, dto, req.user);
  }

  @Put(':id')
  updateVacancy(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(vacancySchema)) dto: UpdateVacancyDto,
  ) {
    return this.service.saveVacancy(req.user.companyId, id, dto, req.user);
  }

  @Delete(':id')
  async deleteVacancy(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.deleteVacancy(req.user.companyId, id);
  }
}
