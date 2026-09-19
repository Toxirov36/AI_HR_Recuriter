import {
  Body,
  Controller,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AuthRequest } from '../../common/utils/security';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AiService } from './ai.service';
import {
  VacancyBriefDto,
  vacancyBriefSchema,
  AiConsentDto,
  consentSchema,
} from './dto';

@Controller()
@UseGuards(AuthGuard)
export class AiController {
  constructor(@Inject(AiService) private ai: AiService) {}

  @Post('vacancies/generate-description')
  generateVacancy(
    @Req() req: AuthRequest,
    @Body(new ZodValidationPipe(vacancyBriefSchema)) dto: VacancyBriefDto,
  ) {
    return this.ai.generateVacancy(req.user.companyId, req.user.id, dto);
  }

  @Post('candidates/:id/parse')
  parseResume(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(consentSchema)) _dto: AiConsentDto,
  ) {
    return this.ai.parse(req.user.companyId, id, req.user.id);
  }

  @Post('applications/:id/analyze')
  analyze(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(consentSchema)) _dto: AiConsentDto,
  ) {
    return this.ai.analyze(req.user.companyId, id, req.user.id);
  }

  @Post('applications/:id/questions')
  questions(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(consentSchema)) _dto: AiConsentDto,
  ) {
    return this.ai.analyze(req.user.companyId, id, req.user.id, true);
  }
}
