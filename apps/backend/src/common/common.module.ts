import { Global, Module } from '@nestjs/common';
import { Security } from './utils/security';
import { AuthGuard } from './guards/auth.guard';
import { OptionalAuthGuard } from './guards/optional-auth.guard';
import { RecruitingService } from '../recruiting.service';
import { R2Storage } from './storage/r2-storage.service';

@Global()
@Module({
  providers: [Security, AuthGuard, OptionalAuthGuard, RecruitingService, R2Storage],
  exports: [Security, AuthGuard, OptionalAuthGuard, RecruitingService, R2Storage],
})
export class CommonModule {}
