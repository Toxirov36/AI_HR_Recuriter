import { Global, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Security } from './utils/security';
import { AuthGuard } from './guards/auth.guard';
import { OptionalAuthGuard } from './guards/optional-auth.guard';
import { RbacGuard } from './guards/rbac.guard';
import { RecruitingService } from '../modules/recruiting/recruiting.service';
import { R2Storage } from './storage/r2-storage.service';

@Global()
@Module({
  providers: [Security, AuthGuard, OptionalAuthGuard, RbacGuard, Reflector, RecruitingService, R2Storage],
  exports: [Security, AuthGuard, OptionalAuthGuard, RbacGuard, Reflector, RecruitingService, R2Storage],
})
export class CommonModule {}
