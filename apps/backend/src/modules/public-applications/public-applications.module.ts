import { Module } from '@nestjs/common';
import { CandidatesModule } from '../candidates/candidates.module';
import { ResumesModule } from '../resumes/resumes.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PublicApplicationsController } from './public-applications.controller';
import { PublicApplicationsService } from './public-applications.service';

@Module({
  imports: [CandidatesModule, ResumesModule, NotificationsModule],
  controllers: [PublicApplicationsController],
  providers: [PublicApplicationsService],
})
export class PublicApplicationsModule {}
