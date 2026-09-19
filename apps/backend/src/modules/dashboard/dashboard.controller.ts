import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AuthRequest } from '../../common/utils/security';
import { Database } from '../../database/prisma.service';

@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(@Inject(Database) private db: Database) {}

  @Get()
  async dashboard(@Req() req: AuthRequest) {
    const where = { companyId: req.user.companyId };
    const [vacancies, candidates, applications, stages, recent] = await Promise.all([
      this.db.vacancy.count({ where: { ...where, status: 'ACTIVE' } }),
      this.db.candidate.count({ where }),
      this.db.application.count({ where }),
      this.db.application.groupBy({ by: ['status'], where, _count: true }),
      this.db.application.findMany({
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
}
