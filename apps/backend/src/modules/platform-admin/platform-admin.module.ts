import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Module,
  Param,
  ParseIntPipe,
  Put,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AuthRequest } from '../../common/utils/security';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  PlatformAdminService,
  auditQuery,
  companyStatusSchema,
  platformQuery,
} from './platform-admin.service';
import { CompanyDeletionService, deleteCompanySchema } from './company-deletion.service';

@Controller('platform-admin')
@UseGuards(AuthGuard)
export class PlatformAdminController {
  constructor(
    @Inject(PlatformAdminService) private service: PlatformAdminService,
    @Inject(CompanyDeletionService) private deletion: CompanyDeletionService,
  ) {}
  @Delete('companies/:id')
  remove(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(deleteCompanySchema)) data: z.infer<typeof deleteCompanySchema>,
  ) {
    return this.deletion.remove(req.user, id, data);
  }
  @Get('file-cleanups')
  pending(@Req() req: AuthRequest) {
    return this.deletion.pending(req.user);
  }
  @Post('file-cleanups/:id/retry')
  retry(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.deletion.retry(req.user, id);
  }
  @Get('overview')
  overview(@Req() req: AuthRequest) {
    return this.service.overview(req.user);
  }
  @Get('companies')
  companies(
    @Req() req: AuthRequest,
    @Query(new ZodValidationPipe(platformQuery)) query: z.infer<typeof platformQuery>,
  ) {
    return this.service.companies(req.user, query);
  }
  @Put('companies/:id/status')
  status(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(companyStatusSchema)) data: z.infer<typeof companyStatusSchema>,
  ) {
    return this.service.setStatus(req.user, id, data);
  }
  @Get('audit')
  audit(
    @Req() req: AuthRequest,
    @Query(new ZodValidationPipe(auditQuery)) query: z.infer<typeof auditQuery>,
  ) {
    return this.service.audit(req.user, query.page);
  }
}

@Module({
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService, CompanyDeletionService],
})
export class PlatformAdminModule {}
