import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { Database } from '../../database/prisma.service';
import { Identity } from '../../common/utils/security';

export function platformAdmin(actor: Identity) {
  if (actor.platformRole !== 'SUPER_ADMIN')
    throw new ForbiddenException('Platform administrator access required');
}
export const platformQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    search: z.string().trim().max(160).default(''),
    status: z.enum(['all', 'active', 'blocked']).default('all'),
  })
  .strict();
export const auditQuery = z
  .object({ page: z.coerce.number().int().min(1).max(100000).default(1) })
  .strict();
export const companyStatusSchema = z
  .object({
    isActive: z.boolean(),
    expectedIsActive: z.boolean(),
    reason: z.string().trim().min(5).max(300),
  })
  .strict();
const pageSize = 20;

@Injectable()
export class PlatformAdminService {
  constructor(@Inject(Database) private db: Database) {}

  async overview(actor: Identity) {
    platformAdmin(actor);
    const [companies, activeCompanies, users, vacancies, applications, candidates] =
      await Promise.all([
        this.db.company.count(),
        this.db.company.count({ where: { isActive: true } }),
        this.db.user.count(),
        this.db.vacancy.count({ where: { status: 'ACTIVE', company: { isActive: true } } }),
        this.db.application.count(),
        this.db.candidate.count({ where: { mergedIntoId: null, isAnonymized: false } }),
      ]);
    return {
      companies,
      activeCompanies,
      blockedCompanies: companies - activeCompanies,
      users,
      vacancies,
      applications,
      candidates,
    };
  }

  async companies(actor: Identity, query: z.infer<typeof platformQuery>) {
    platformAdmin(actor);
    const where = {
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {}),
      ...(query.status === 'all' ? {} : { isActive: query.status === 'active' }),
    };
    const [rows, total] = await Promise.all([
      this.db.company.findMany({
        where,
        skip: (query.page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          name: true,
          isActive: true,
          createdAt: true,
          _count: { select: { users: true, vacancies: true, applications: true } },
          users: { where: { platformRole: 'SUPER_ADMIN' }, select: { id: true }, take: 1 },
        },
      }),
      this.db.company.count({ where }),
    ]);
    return {
      items: rows.map(({ users, ...company }) => ({
        ...company,
        protected: users.length > 0 || company.id === actor.companyId,
      })),
      total,
      page: query.page,
      pageSize,
    };
  }

  async setStatus(actor: Identity, companyId: number, input: z.infer<typeof companyStatusSchema>) {
    platformAdmin(actor);
    if (companyId === actor.companyId)
      throw new ConflictException('O‘z kompaniyangizni bu paneldan bloklay olmaysiz.');
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Company" WHERE id = ${companyId} FOR UPDATE`;
      const operator = await tx.user.findFirst({
        where: {
          id: actor.id,
          platformRole: 'SUPER_ADMIN',
          isActive: true,
          company: { isActive: true },
        },
        select: { id: true },
      });
      if (!operator) throw new ForbiddenException('Platform administrator access required');
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true, isActive: true },
      });
      if (!company) throw new NotFoundException('Kompaniya topilmadi');
      if (company.isActive !== input.expectedIsActive || company.isActive === input.isActive)
        throw new ConflictException('Kompaniya holati o‘zgargan. Ro‘yxatni yangilang.');
      const protectedUser = await tx.user.findFirst({
        where: { companyId, platformRole: 'SUPER_ADMIN' },
        select: { id: true },
      });
      if (protectedUser)
        throw new ConflictException('Platforma admini mavjud kompaniyani bloklab bo‘lmaydi.');
      const updated = await tx.company.update({
        where: { id: companyId },
        data: { isActive: input.isActive },
        select: { id: true, name: true, isActive: true },
      });
      await tx.platformAuditLog.create({
        data: {
          actorId: actor.id,
          actorName: actor.fullName,
          companyId,
          companyName: company.name,
          action: input.isActive ? 'COMPANY_REACTIVATED' : 'COMPANY_BLOCKED',
          reason: input.reason,
          previousActive: company.isActive,
          newActive: input.isActive,
        },
      });
      return updated;
    });
  }

  async audit(actor: Identity, page: number) {
    platformAdmin(actor);
    const [items, total] = await Promise.all([
      this.db.platformAuditLog.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.platformAuditLog.count(),
    ]);
    return { items, total, page, pageSize };
  }
}
