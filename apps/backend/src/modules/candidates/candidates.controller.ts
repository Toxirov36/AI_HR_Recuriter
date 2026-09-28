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
import { Permission, RbacGuard, RequirePermissions } from '../../common/guards/rbac.guard';
import { z } from 'zod';
import { CandidatesService, candidateListSelect, candidateSelect } from './candidates.service';
import {
  CandidateDto,
  candidateSchema,
  CreateCandidateDto,
  UpdateCandidateDto,
  QueryCandidateDto,
  paginationSchema,
} from './dto';

export { candidateSelect, candidateListSelect, CandidateDto, CreateCandidateDto, UpdateCandidateDto };

@Controller('candidates')
@UseGuards(AuthGuard)
export class CandidatesController {
  constructor(@Inject(CandidatesService) private service: CandidatesService) {}

  @Get()
  async candidates(
    @Req() req: AuthRequest,
    @Query(new ZodValidationPipe(paginationSchema)) query: QueryCandidateDto,
  ) {
    return this.service.list(req.user.companyId, query.page, query.search);
  }

  @Get(':id')
  getCandidate(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.candidate(req.user.companyId, id);
  }

  @Get(':id/duplicates')
  duplicates(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.duplicates(req.user.companyId, id);
  }

  @Post(':id/merge')
  @UseGuards(RbacGuard)
  @RequirePermissions(Permission.MANAGE_CANDIDATES)
  merge(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(z.object({ duplicateId: z.number().int().positive() }).strict())) body: { duplicateId: number },
  ) {
    return this.service.merge(req.user.companyId, id, body.duplicateId, req.user.fullName);
  }

  @Post()
  createCandidate(
    @Req() req: AuthRequest,
    @Body(new ZodValidationPipe(candidateSchema)) dto: CreateCandidateDto,
  ) {
    return this.service.saveCandidate(req.user.companyId, null, dto);
  }

  @Put(':id')
  updateCandidate(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(candidateSchema)) dto: UpdateCandidateDto,
  ) {
    return this.service.saveCandidate(req.user.companyId, id, dto);
  }

  @Delete(':id')
  async deleteCandidate(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.deleteCandidate(req.user.companyId, id);
  }
}
