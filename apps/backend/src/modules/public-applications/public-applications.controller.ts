import { Body, Controller, Get, Inject, Param, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { publicApplicationSchema, PublicApplicationsService } from './public-applications.service';
import { z } from 'zod';

@Controller('public/vacancies')
export class PublicApplicationsController {
  constructor(@Inject(PublicApplicationsService) private readonly service: PublicApplicationsService) {}

  @Get(':token')
  getVacancy(@Param('token') token: string) {
    return this.service.publicVacancy(token);
  }

  @Post(':token/apply')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 },
  }))
  apply(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(publicApplicationSchema)) body: z.infer<typeof publicApplicationSchema>,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    return this.service.apply(token, body, file, req.ip);
  }
}
