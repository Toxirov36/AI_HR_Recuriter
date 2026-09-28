import { Module } from '@nestjs/common';
import { ResumesController } from './resumes.controller';
import { ResumesService } from './resumes.service';
import { ResumeQueueService } from './resume-queue.service';
import { CandidatesModule } from '../candidates/candidates.module';
import { AntivirusService } from './antivirus.service';
import { OcrService } from './ocr.service';

@Module({
  imports: [CandidatesModule],
  controllers: [ResumesController],
  providers: [ResumesService, ResumeQueueService, AntivirusService, OcrService],
  exports: [ResumesService, ResumeQueueService, AntivirusService, OcrService],
})
export class ResumesModule {}

