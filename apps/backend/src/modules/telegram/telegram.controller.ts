import {
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  Body,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import type { AuthRequest } from '../../common/utils/security';
import { TelegramService } from './telegram.service';
import type { TelegramUpdate } from './types/telegram.types';

@Controller('v1/integrations/telegram')
export class TelegramController {
  constructor(@Inject(TelegramService) private telegramService: TelegramService) {}

  @Post('webhook')
  async webhook(
    @Body() update: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token') secret?: string,
  ) {
    if (!this.telegramService.verifySecret(secret)) throw new UnauthorizedException();
    await this.telegramService.handleUpdate(update);
    return { ok: true };
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
