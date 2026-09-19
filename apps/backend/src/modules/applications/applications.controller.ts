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
import { ApplicationsService } from './applications.service';
import {
  CreateApplicationDto,
  applicationSchema,
  UpdatePipelineStatusDto,
  pipelineSchema,
  InterviewReviewDto,
  interviewReviewSchema,
  QueryApplicationDto,
  paginationSchema,
} from './dto';

@Controller('applications')
@UseGuards(AuthGuard)
export class ApplicationsController {
  constructor(@Inject(ApplicationsService) private service: ApplicationsService) {}

  @Get()
  async applications(
    @Req() req: AuthRequest,
    @Query(new ZodValidationPipe(paginationSchema)) query: QueryApplicationDto,
  ) {
    return this.service.list(req.user.companyId, query.page, query.search);
  }

  @Get(':id')
  getApplication(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.application(req.user.companyId, id);
  }

  @Post()
  createApplication(
    @Req() req: AuthRequest,
    @Body(new ZodValidationPipe(applicationSchema)) dto: CreateApplicationDto,
  ) {
    return this.service.createApplication(req.user.companyId, req.user, dto);
  }

  @Put(':id/status')
  async status(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(pipelineSchema)) dto: UpdatePipelineStatusDto,
  ) {
    return this.service.changeStage(req.user.companyId, id, req.user, dto);
  }

  @Put(':id/interview-review')
  saveReview(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(interviewReviewSchema)) dto: InterviewReviewDto,
  ) {
    return this.service.saveInterviewReview(
      req.user.companyId,
      id,
      req.user,
      dto,
    );
  }

  @Delete(':id')
  async deleteApplication(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.deleteApplication(req.user.companyId, id);
  }
}
