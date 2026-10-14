import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  @Post('vacancies/transcribe-brief')
  @UseInterceptors(
    FileInterceptor('audio', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }),
  )
  transcribeBrief(
    @Req() req: AuthRequest,
    @UploadedFile() file?: Express.Multer.File,
    @Body('language') language?: string,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Audio file is required');
    }
    const lang = language === 'ru' || language === 'en' || language === 'tg' ? language : 'uz';
    return this.ai.transcribeBriefAudio(
      req.user.companyId,
      req.user.id,
      file.buffer,
      file.mimetype,
      lang,
    );
  }

  @Post('vacancies/generate-description')
  generateVacancy(
    @Req() req: AuthRequest,
    @Body(new ZodValidationPipe(vacancyBriefSchema)) dto: VacancyBriefDto,
  ) {
    return this.ai.generateVacancy(req.user.companyId, req.user.id, dto);
  }

  @Get('candidates/:id/parse-status')
  getParseStatus(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.ai.getParseStatus(req.user.companyId, id);
  }

  @Post('candidates/:id/parse-async')
  parseResumeAsync(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(consentSchema)) _dto: AiConsentDto,
  ) {
    return this.ai.parseAsync(req.user.companyId, id, req.user.id);
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

  @Post('vacancies/:id/analyze-candidates')
  analyzeVacancyCandidates(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.ai.analyzeVacancyApplications(req.user.companyId, id, req.user.id);
  }

  @Get('vacancies/:id/top-candidates')
  getVacancyTopCandidates(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: string,
  ) {
    const numLimit = limit ? Math.max(1, parseInt(limit, 10) || 3) : 3;
    return this.ai.getVacancyTopCandidates(req.user.companyId, id, numLimit);
  }

  @Get('vacancies/:id/recommendations')
  getVacancyRecommendations(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: string,
  ) {
    const numLimit = limit ? Math.max(1, parseInt(limit, 10) || 20) : 20;
    return this.ai.getVacancyRecommendations(req.user.companyId, id, numLimit);
  }

  @Post('vacancies/:id/recommendations/:candidateId/apply')
  addRecommendationToApplication(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('candidateId', ParseIntPipe) candidateId: number,
  ) {
    return this.ai.addRecommendationToApplication(
      req.user.companyId,
      req.user.id,
      id,
      candidateId,
    );
  }
}
