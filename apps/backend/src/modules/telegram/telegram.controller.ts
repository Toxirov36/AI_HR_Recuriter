import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
  Body,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import type { AuthRequest } from '../../common/utils/security';
import { TelegramService } from './telegram.service';
import { TelegramAdminService } from './telegram-admin.service';
import { TelegramJoinService } from './telegram-join.service';
import { ExternalRecruitingService } from '../external-recruiting/external-recruiting.service';
import type { TelegramUpdate } from './types/telegram.types';

@Controller('v1/integrations/telegram')
export class TelegramController {
  constructor(@Inject(TelegramService) private telegramService: TelegramService, @Inject(TelegramAdminService) private adminService: TelegramAdminService, @Inject(TelegramJoinService) private joinService: TelegramJoinService, @Inject(ExternalRecruitingService) private external: ExternalRecruitingService) {}

  @Put('auto-publish')
  @UseGuards(AuthGuard)
  setAutoPublish(@Req() req: AuthRequest, @Body() body: { enabled?: unknown }) {
    if (typeof body?.enabled !== 'boolean') throw new BadRequestException('enabled must be true or false');
    return this.external.setTelegramAutoPublish(req.user, body.enabled);
  }

  @Get('candidate-link')
  @UseGuards(AuthGuard)
  candidateLink(@Req() req: AuthRequest) { return this.joinService.candidateLink(req.user.companyId); }

  @Get('admin/status')
  @UseGuards(AuthGuard)
  adminStatus(@Req() req: AuthRequest) { return this.adminService.status(req.user); }

  @Post('admin/connect-link')
  @UseGuards(AuthGuard)
  adminConnectLink(@Req() req: AuthRequest) { return this.adminService.createPairing(req.user); }

  @Delete('admin/connection')
  @UseGuards(AuthGuard)
  adminDisconnect(@Req() req: AuthRequest) { return this.adminService.disconnect(req.user); }

  @Post('webhook')
  async webhook(
    @Body() update: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token') secret?: string,
  ) {
    if (!this.telegramService.verifySecret(secret)) throw new UnauthorizedException();
    await this.telegramService.handleUpdate(update);
    return { ok: true };
  }

  @Post('connect-link')
  @UseGuards(AuthGuard)
  connectLink(@Req() req: AuthRequest) {
    return this.telegramService.createConnectLink(req.user);
  }

  @Get('status')
  @UseGuards(AuthGuard)
  status(@Req() req: AuthRequest) {
    return this.telegramService.getStatus(req.user);
  }

  @Delete('connection')
  @UseGuards(AuthGuard)
  disconnect(@Req() req: AuthRequest) {
    return this.telegramService.disconnect(req.user);
  }

  @Get('connections')
  @UseGuards(AuthGuard)
  connections(@Req() req: AuthRequest) {
    return this.telegramService.connections(req.user);
  }

  @Post('connections/:id/claim')
  @UseGuards(AuthGuard)
  claim(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.telegramService.claim(req.user, id);
  }
}
