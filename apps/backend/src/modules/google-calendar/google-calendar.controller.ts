import { Controller, Delete, Get, Inject, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, type AuthRequest } from '../../common/guards/auth.guard';
import { Permission, RbacGuard, RequirePermissions } from '../../common/guards/rbac.guard';
import { getConfig } from '../../config/app.config';
import { GoogleCalendarService } from './google-calendar.service';

/** A recruiter connects their own Google Calendar; interviews they schedule land in it. */
@Controller('integrations/google-calendar')
@UseGuards(AuthGuard, RbacGuard)
@RequirePermissions(Permission.MANAGE_APPLICATIONS)
export class GoogleCalendarController {
  constructor(@Inject(GoogleCalendarService) private google: GoogleCalendarService) {}

  @Get('status')
  status(@Req() req: AuthRequest) {
    return this.google.status(req.user.id);
  }

  @Post('connect')
  connect(@Req() req: AuthRequest) {
    return this.google.connectUrl(req.user.companyId, req.user.id);
  }

  @Delete('connection')
  disconnect(@Req() req: AuthRequest) {
    return this.google.disconnect(req.user.id);
  }
}

@Controller('integrations/google-calendar')
export class GoogleCalendarCallbackController {
  constructor(@Inject(GoogleCalendarService) private google: GoogleCalendarService) {}

  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const base = `${getConfig().FRONTEND_ORIGIN}/profile`;
    if (!code || !state) return res.redirect(`${base}?google=error`);
    try {
      await this.google.finishConnect(code, state);
      return res.redirect(`${base}?google=connected`);
    } catch {
      return res.redirect(`${base}?google=error`);
    }
  }
}
