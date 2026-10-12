import { Body, Controller, Get, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard } from '../../common/guards/auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { AuthRequest } from '../../common/utils/security';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService, userSelect } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import {
  googleCredentialSchema,
  googleRegisterSchema,
  type GoogleCredentialDto,
  type GoogleRegisterDto,
} from './dto/google.dto';
import {
  RegisterDto,
  registerSchema,
  LoginDto,
  loginSchema,
  InvitationDto,
  invitationSchema,
  AcceptInviteDto,
  acceptInviteSchema,
} from './dto';

export { userSelect };

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private authService: AuthService,
    @Inject(GoogleAuthService) private googleAuth: GoogleAuthService,
  ) {}

  @Get('google/config')
  googleConfig() {
    return this.googleAuth.config();
  }

  @Post('google/challenge')
  googleChallenge(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.googleAuth.challenge(req.ip, res);
  }

  @Post('google/verify')
  googleVerify(
    @Body(new ZodValidationPipe(googleCredentialSchema)) data: GoogleCredentialDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.googleAuth.verify(data.credential, req, res);
  }

  @Post('google/register')
  googleRegister(
    @Body(new ZodValidationPipe(googleRegisterSchema)) data: GoogleRegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.googleAuth.register(data, req, res);
  }

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
}
