import { Body, Controller, Get, Inject, Param, ParseIntPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard, type AuthRequest } from '../../common/guards/auth.guard';
import { Permission, RbacGuard, RequirePermissions } from '../../common/guards/rbac.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  confirmSchema,
  createInterviewSchema,
  declineSchema,
  rescheduleInterviewSchema,
  type CreateInterviewInput,
  type RescheduleInterviewInput,
} from './interviews.schemas';
import { InterviewsService } from './interviews.service';

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

@Controller()
@UseGuards(AuthGuard, RbacGuard)
@RequirePermissions(Permission.MANAGE_APPLICATIONS)
export class InterviewsController {
  constructor(@Inject(InterviewsService) private interviews: InterviewsService) {}

  @Get('applications/:id/interviews')
  list(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.interviews.list(req.user.companyId, id);
  }

  @Post('applications/:id/interviews')
  create(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Body(new ZodValidationPipe(createInterviewSchema)) body: CreateInterviewInput) {
    return this.interviews.create(req.user, id, body, meta(req));
  }

  @Put('interviews/:id/schedule')
  reschedule(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number, @Body(new ZodValidationPipe(rescheduleInterviewSchema)) body: RescheduleInterviewInput) {
    return this.interviews.reschedule(req.user, id, body, meta(req));
  }

  @Put('interviews/:id/cancel')
  cancel(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.interviews.cancel(req.user, id, meta(req));
  }
}

/** The candidate's page: no sign-in, the unguessable token in the link is the credential. */
@Controller('public/interviews')
export class PublicInterviewsController {
  constructor(@Inject(InterviewsService) private interviews: InterviewsService) {}

  @Get(':token')
  view(@Param('token') token: string, @Req() req: Request) {
    return this.interviews.publicView(token, req.ip);
  }

  @Post(':token/confirm')
  confirm(@Param('token') token: string, @Body(new ZodValidationPipe(confirmSchema)) body: z.infer<typeof confirmSchema>, @Req() req: Request) {
    return this.interviews.confirm(token, body.slotId, req.ip);
  }

  @Post(':token/decline')
  decline(@Param('token') token: string, @Body(new ZodValidationPipe(declineSchema)) body: z.infer<typeof declineSchema>, @Req() req: Request) {
    return this.interviews.decline(token, body.note, req.ip);
  }
}
