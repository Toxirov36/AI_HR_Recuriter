import { Body, Controller, Get, Inject, Module, Param, ParseIntPipe, Put, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../../common/guards/auth.guard';
import { Roles, RbacGuard } from '../../common/guards/rbac.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthRequest } from '../../common/utils/security';
import { CompanyAdminService, companySettingsSchema, memberAccessSchema } from './company-admin.service';

// Every endpoint is limited to the authenticated company's administrator.
@Controller('company-admin')
@UseGuards(AuthGuard, RbacGuard)
@Roles('ADMIN')
export class CompanyAdminController {
  constructor(@Inject(CompanyAdminService) private service: CompanyAdminService) {}
  @Get()
  overview(@Req() req: AuthRequest) { return this.service.overview(req.user); }
  @Put('settings')
  settings(@Req() req: AuthRequest, @Body(new ZodValidationPipe(companySettingsSchema)) body: z.infer<typeof companySettingsSchema>) { return this.service.settings(req.user, body); }
  @Put('members/:id')
  member(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Body(new ZodValidationPipe(memberAccessSchema)) body: z.infer<typeof memberAccessSchema>) { return this.service.member(req.user, id, body); }
}

@Module({ controllers: [CompanyAdminController], providers: [CompanyAdminService] })
export class CompanyAdminModule {}
