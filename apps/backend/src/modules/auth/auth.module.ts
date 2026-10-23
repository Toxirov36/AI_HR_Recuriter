import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { EmailService } from '../notifications/email.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, GoogleAuthService, EmailService],
  exports: [AuthService],
})
export class AuthModule {}
