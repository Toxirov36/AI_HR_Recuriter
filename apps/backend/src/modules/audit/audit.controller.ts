import {
  Controller,
  Get,
  Inject,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RbacGuard, Roles, Permission, RequirePermissions } from '../../common/guards/rbac.guard';
import { AuthRequest } from '../../common/utils/security';
import { AuditService } from './audit.service';

@Controller('v1/audit-logs')
@UseGuards(AuthGuard, RbacGuard)
export class AuditController {
  constructor(@Inject(AuditService) private audit: AuditService) {}

  @Get()
  @Roles('ADMIN')
  @RequirePermissions(Permission.VIEW_AUDIT_LOGS)
  async list(
    @Req() req: AuthRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('action') action?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.audit.list(req.user.companyId, {
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      action,
      fromDate,
      toDate,
    });
  }

  @Get('export')
  @Roles('ADMIN')
  @RequirePermissions(Permission.EXPORT_AUDIT_LOGS)
  async exportLogs(
    @Req() req: AuthRequest,
    @Res() res: Response,
    @Query('format') format = 'csv',
    @Query('action') action?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}`;

    if (format === 'json') {
      const data = await this.audit.exportJson(req.user.companyId, {
        action,
        fromDate,
        toDate,
      });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      return res.send(JSON.stringify(data, null, 2));
    }

    // Default CSV
    const csv = await this.audit.exportCsv(req.user.companyId, {
      action,
      fromDate,
      toDate,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send(csv);
  }
}
