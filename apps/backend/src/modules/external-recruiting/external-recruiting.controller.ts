import { Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthGuard, admin, type AuthRequest } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ExternalRecruitingService } from './external-recruiting.service';
import { HeadHunterService } from './headhunter.service';
import { getConfig } from '../../config/app.config';

const channelSchema = z.object({ chatId: z.string().trim().min(2).max(100) }).strict();
const foundSchema = z.object({ externalId: z.string().regex(/^\d{1,20}$/) }).strict();
const approvalSchema = z.discriminatedUnion('platform', [
  z.object({ platform: z.literal('TELEGRAM'), channelId: z.number().int().positive() }).strict(),
  z.object({ platform: z.literal('HEADHUNTER'), employerServiceId: z.string().min(1).max(100).optional() }).strict(),
]);

@Controller('integrations/recruiting')
@UseGuards(AuthGuard)
export class ExternalRecruitingController {
  constructor(@Inject(ExternalRecruitingService) private service: ExternalRecruitingService, @Inject(HeadHunterService) private hh: HeadHunterService) {}

  @Get('telegram/channels')
  channels(@Req() req: AuthRequest) { return this.service.channels(req.user.companyId); }

  @Post('telegram/channels')
  addChannel(@Req() req: AuthRequest, @Body(new ZodValidationPipe(channelSchema)) input: z.infer<typeof channelSchema>) { return this.service.addChannel(req.user, input.chatId); }

  @Delete('telegram/channels/:id')
  removeChannel(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) { return this.service.removeChannel(req.user, id); }

  @Get('headhunter/status')
  status(@Req() req: AuthRequest) { return this.hh.status(req.user.companyId); }

  @Post('headhunter/connect')
  connect(@Req() req: AuthRequest) { admin(req.user); return this.hh.connectUrl(req.user.companyId, req.user.id); }

  @Delete('headhunter/connection')
  disconnect(@Req() req: AuthRequest) { admin(req.user); return this.hh.disconnect(req.user.companyId); }

  @Get('headhunter/packages')
  async packages(@Req() req: AuthRequest, @Query('areaId') areaId?: string, @Query('roleId') roleId?: string) {
    const status = await this.hh.status(req.user.companyId);
    if (status.connectedByUserId !== req.user.id) return { publication_variants: [] };
    return this.hh.packages(req.user.companyId, areaId, roleId);
  }

  @Get('headhunter/fields')
  async fields(@Req() req: AuthRequest) {
    const status = await this.hh.status(req.user.companyId);
    if (status.connectedByUserId !== req.user.id) return { areas: [], roles: [], experiences: [], employments: [], schedules: [] };
    return this.hh.fields(req.user.companyId);
  }

  @Get('vacancies/:id/preview')
  preview(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) { return this.service.preview(req.user.companyId, id); }

  @Post('vacancies/:id/approve')
  approve(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Body(new ZodValidationPipe(approvalSchema)) input: z.infer<typeof approvalSchema>) { return this.service.approve(req.user, id, input); }

  @Post('publications/:id/confirm-missing')
  confirmMissing(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) { return this.service.confirmMissing(req.user, id); }

  @Post('publications/:id/confirm-found')
  confirmFound(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Body(new ZodValidationPipe(foundSchema)) input: z.infer<typeof foundSchema>) { return this.service.confirmFound(req.user, id, input.externalId); }

  @Get('vacancies/:id/headhunter/resumes')
  search(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Query('page') page?: string) {
    const parsed = z.coerce.number().int().min(0).max(100).parse(page ?? '0');
    return this.service.search(req.user, id, parsed);
  }
}

@Controller('integrations/headhunter')
export class HeadHunterCallbackController {
  constructor(@Inject(HeadHunterService) private hh: HeadHunterService) {}

  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    if (!code || !state) return res.redirect(`${getConfig().FRONTEND_ORIGIN}/admin?hh=error`);
    try {
      await this.hh.finishConnect(code, state);
      return res.redirect(`${getConfig().FRONTEND_ORIGIN}/admin?hh=connected`);
    } catch {
      return res.redirect(`${getConfig().FRONTEND_ORIGIN}/admin?hh=error`);
    }
  }
}
