import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard } from '../../common/guards/auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { AuthRequest } from '../../common/utils/security';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService, userSelect } from './auth.service';
import {
  RegisterDto,
  registerSchema,
  LoginDto,
  loginSchema,
  InvitationDto,
  invitationSchema,
  AcceptInviteDto,
  acceptInviteSchema,
  MfaEnableDto,
  mfaEnableSchema,
  MfaVerifyDto,
  mfaVerifySchema,
  MfaDisableDto,
  mfaDisableSchema,
} from './dto';

export { userSelect };

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private authService: AuthService) {}

  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.register(dto, req.ip, res);
  }

  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(dto, req.ip, res);
  }

  @Get('session')
  @UseGuards(OptionalAuthGuard)
  async session(@Req() req: AuthRequest) {
    return { user: req.user ? await this.authService.me(req.user) : null };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() req: AuthRequest) {
    return this.authService.me(req.user);
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    return this.authService.logout(req.sessionId, res);
  }

  @Get('team')
  @UseGuards(AuthGuard)
  async team(@Req() req: AuthRequest) {
    return this.authService.team(req.user);
  }

  @Post('invitations')
  @UseGuards(AuthGuard)
  async invite(
    @Req() req: AuthRequest,
    @Body(new ZodValidationPipe(invitationSchema)) dto: InvitationDto,
  ) {
    return this.authService.invite(req.user, dto);
  }

  @Post('accept-invitation')
  async accept(
    @Req() req: Request,
    @Body(new ZodValidationPipe(acceptInviteSchema)) dto: AcceptInviteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.accept(dto, req.ip, res);
  }

  @Get('mfa/setup')
  @UseGuards(AuthGuard)
  async setupMfa(@Req() req: AuthRequest) {
    return this.authService.setupMfa(req.user.id);
  }

  @Post('mfa/enable')
  @UseGuards(AuthGuard)
  async enableMfa(
    @Req() req: AuthRequest,
    @Body(new ZodValidationPipe(mfaEnableSchema)) dto: MfaEnableDto,
  ) {
    return this.authService.enableMfa(req.user.id, dto.code);
  }

  @Post('mfa/verify')
  async verifyMfa(
    @Body(new ZodValidationPipe(mfaVerifySchema)) dto: MfaVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.verifyMfaLogin(dto.challengeToken, dto.code, res);
  }

  @Post('mfa/disable')
  @UseGuards(AuthGuard)
  async disableMfa(
    @Req() req: AuthRequest,
    @Body(new ZodValidationPipe(mfaDisableSchema)) dto: MfaDisableDto,
  ) {
    return this.authService.disableMfa(req.user.id, dto.password);
  }
}

