import {
  Body,
  Controller,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RbacGuard, Roles, Permission, RequirePermissions } from '../../common/guards/rbac.guard';
import { AuthRequest } from '../../common/utils/security';
import { RetentionService } from './retention.service';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

const retentionPolicySchema = z.object({
  retentionDays: z.number().int().min(30).max(3650),
}).strict();

type RetentionPolicyDto = z.infer<typeof retentionPolicySchema>;

@Controller('v1')
@UseGuards(AuthGuard, RbacGuard)
export class RetentionController {
  constructor(@Inject(RetentionService) private retention: RetentionService) {}

  @Post('candidates/:id/anonymize')
  @Roles('ADMIN', 'HR')
  @RequirePermissions(Permission.ANONYMIZE_CANDIDATES)
  async anonymizeCandidate(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) candidateId: number,
  ) {
    return this.retention.anonymizeCandidate(
      req.user.companyId,
      candidateId,
      req.user.id,
      req.user.fullName,
      req.user.role,
    );
  }

  @Post('retention/purge')
  @Roles('ADMIN')
  @RequirePermissions(Permission.PURGE_RETENTION)
  async purgeExpired(@Req() req: AuthRequest) {
    return this.retention.purgeExpiredCandidates(
      req.user.companyId,
      req.user.id,
      req.user.fullName,
    );
  }

  @Put('company/retention-policy')
  @Roles('ADMIN')
  @RequirePermissions(Permission.CONFIGURE_RETENTION)
  async updatePolicy(
    @Req() req: AuthRequest,
    @Body(new ZodValidationPipe(retentionPolicySchema)) dto: RetentionPolicyDto,
  ) {
    return this.retention.updatePolicy(req.user.companyId, dto.retentionDays);
  }
}
