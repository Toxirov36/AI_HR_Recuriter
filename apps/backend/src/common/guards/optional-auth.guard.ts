import { ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { Security } from '../utils/security';
import { AuthGuard } from './auth.guard';

// A missing/expired session is a normal state on the public sign-in screen.
// Infrastructure failures still propagate; protected endpoints retain AuthGuard.
@Injectable()
export class OptionalAuthGuard extends AuthGuard {
  constructor(@Inject(Security) security: Security, @Inject(Database) db: Database) {
    super(security, db);
  }

  async canActivate(context: ExecutionContext) {
    try {
      return await super.canActivate(context);
    } catch (error) {
      if (error instanceof UnauthorizedException) return true;
      throw error;
    }
  }
}
