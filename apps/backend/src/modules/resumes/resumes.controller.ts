import {
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AuthRequest, Security } from '../../common/utils/security';
import { CandidatesService } from '../candidates/candidates.service';
import { ResumesService } from './resumes.service';

@Controller('candidates')
@UseGuards(AuthGuard)
export class ResumesController {
  constructor(
    @Inject(ResumesService) private resumesService: ResumesService,
    @Inject(CandidatesService) private candidatesService: CandidatesService,
    @Inject(Security) private security: Security,
  ) {}

  @Post(':id/resume')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } }),
  )
  async upload(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.security.limit(`upload:${req.user.id}`, 10);
    await this.candidatesService.candidate(req.user.companyId, id);
    await this.resumesService.upload(req.user.companyId, id, file);
    return this.candidatesService.candidate(req.user.companyId, id);
  }

  @Get(':id/resume')
  async download(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    await this.candidatesService.candidate(req.user.companyId, id);
    const record = await this.resumesService.download(req.user.companyId, id);
    res.setHeader('Content-Type', record.resumeMime!);
    res.setHeader('Content-Disposition', `attachment; filename="${record.resumeName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(record.resumeData!));
  }
}

// Backward compatibility alias
export { ResumesController as ResumeController };
