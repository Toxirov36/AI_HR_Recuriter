import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import type { AuthRequest } from '../../common/utils/security';
import { NotificationService } from './notification.service';

@Controller('v1/notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(@Inject(NotificationService) private readonly notificationService: NotificationService) {}

  @Get()
  async getNotifications(@Req() req: AuthRequest) {
    const items = await this.notificationService.getCompanyNotifications(req.user.companyId);
    return { items };
  }
}
