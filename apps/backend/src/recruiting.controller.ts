import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, AuthRequest } from './security';
import { RecruitingService, candidateListSelect } from './recruiting.service';
import {
  application,
  candidate,
  pagination,
  parse,
  pipeline,
  vacancy,
  interviewReview,
} from './validation';
@Controller()
@UseGuards(AuthGuard)
export class RecruitingController {
  constructor(@Inject(RecruitingService) private service: RecruitingService) {}
  @Get('dashboard')
  async dashboard(@Req() req: AuthRequest) {
    const where = { companyId: req.user.companyId };
    const db = this.service.db;
    const [vacancies, candidates, applications, stages, recent] = await Promise.all([
      db.vacancy.count({ where: { ...where, status: 'ACTIVE' } }),
      db.candidate.count({ where }),
      db.application.count({ where }),
      db.application.groupBy({ by: ['status'], where, _count: true }),
      db.application.findMany({
        where,
        take: 5,
        orderBy: { updatedAt: 'desc' },
        include: {
          candidate: { select: { id: true, fullName: true } },
          vacancy: { select: { id: true, title: true } },
        },
      }),
    ]);
    return { vacancies, candidates, applications, stages, recent };
  }
  @Get('vacancies')
  async vacancies(@Req() req: AuthRequest, @Query() query: unknown) {
    const { page, search } = parse(pagination, query);
    const where = {
      companyId: req.user.companyId,
      title: { contains: search, mode: 'insensitive' as const },
    };
    const [items, total] = await this.service.db.$transaction([
      this.service.db.vacancy.findMany({
        where,
        include: { requirements: true, _count: { select: { applications: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 20,
        take: 20,
      }),
      this.service.db.vacancy.count({ where }),
    ]);
    return { items, total, page, pageSize: 20 };
  }
  @Get('vacancies/:id') getVacancy(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.vacancy(req.user.companyId, id);
  }
  @Post('vacancies') createVacancy(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.saveVacancy(req.user.companyId, null, parse(vacancy, body));
  }
  @Put('vacancies/:id') updateVacancy(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.service.saveVacancy(req.user.companyId, id, parse(vacancy, body));
  }
  @Delete('vacancies/:id') async deleteVacancy(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.service.vacancy(req.user.companyId, id);
    await this.service.db.vacancy.delete({
      where: { id_companyId: { id, companyId: req.user.companyId } },
    });
    return { ok: true };
  }
  @Get('candidates')
  async candidates(@Req() req: AuthRequest, @Query() query: unknown) {
    const { page, search } = parse(pagination, query);
    const where = {
      companyId: req.user.companyId,
      OR: [
        { fullName: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ],
    };
    const [items, total] = await this.service.db.$transaction([
      this.service.db.candidate.findMany({
        where,
        select: candidateListSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 20,
        take: 20,
      }),
      this.service.db.candidate.count({ where }),
    ]);
    return { items, total, page, pageSize: 20 };
  }
  @Get('candidates/:id') getCandidate(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.candidate(req.user.companyId, id);
  }
  @Post('candidates') createCandidate(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.saveCandidate(req.user.companyId, null, parse(candidate, body));
  }
  @Put('candidates/:id') updateCandidate(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.service.saveCandidate(req.user.companyId, id, parse(candidate, body));
  }
  @Delete('candidates/:id') async deleteCandidate(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.service.candidate(req.user.companyId, id);
    await this.service.db.candidate.delete({
      where: { id_companyId: { id, companyId: req.user.companyId } },
    });
    return { ok: true };
  }
  @Get('applications')
  async applications(@Req() req: AuthRequest, @Query() query: unknown) {
    const { page, search } = parse(pagination, query);
    const where = {
      companyId: req.user.companyId,
      candidate: { fullName: { contains: search, mode: 'insensitive' as const } },
    };
    const [items, total] = await this.service.db.$transaction([
      this.service.db.application.findMany({
        where,
        include: {
          candidate: { select: { id: true, fullName: true, email: true } },
          vacancy: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 20,
        take: 20,
      }),
      this.service.db.application.count({ where }),
    ]);
    return { items, total, page, pageSize: 20 };
  }
  @Get('applications/:id') getApplication(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.application(req.user.companyId, id);
  }
  @Post('applications') async createApplication(@Req() req: AuthRequest, @Body() body: unknown) {
    const data = parse(application, body);
    const companyId = req.user.companyId;
    await Promise.all([
      this.service.vacancy(companyId, data.vacancyId),
      this.service.candidate(companyId, data.candidateId),
    ]);
    return this.service.db.application.create({
      data: {
        ...data,
        companyId,
        stageHistory: {
          create: { toStatus: 'NEW', actorId: req.user.id, actorName: req.user.fullName },
        },
      },
    });
  }
  @Put('applications/:id/status') async status(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    const data = parse(pipeline, body);
    return this.service.changeStage(req.user.companyId, id, req.user, data);
  }
  @Put('applications/:id/interview-review') saveReview(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.service.saveInterviewReview(
      req.user.companyId,
      id,
      req.user,
      parse(interviewReview, body),
    );
  }
  @Delete('applications/:id') async deleteApplication(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.service.application(req.user.companyId, id);
    await this.service.db.application.delete({ where: { id, companyId: req.user.companyId } });
    return { ok: true };
  }
}
