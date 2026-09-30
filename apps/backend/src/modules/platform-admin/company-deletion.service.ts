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
import { R2Storage } from '../../common/storage/r2-storage.service';
import { platformAdmin } from './platform-admin.service';

export const deleteCompanySchema = z
  .object({
    confirmationName: z.string().min(1).max(160).optional(),
    reason: z.string().trim().max(300).default(''),
  })
  .strict()
  .default({ reason: '' });

@Injectable()
export class CompanyDeletionService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(R2Storage) private storage: R2Storage,
  ) {}

  async remove(actor: Identity, companyId: number, input: z.infer<typeof deleteCompanySchema>) {
    platformAdmin(actor);
    if (actor.companyId === companyId)
      throw new ConflictException('O‘z kompaniyangizni o‘chira olmaysiz.');
    await this.db.$transaction(
      async (tx) => {
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
        if (input.confirmationName && input.confirmationName !== company.name)
          throw new ConflictException(
            'Kompaniya nomi mos kelmadi. Ro‘yxatni yangilang va nomini aynan kiriting.',
          );
        const protectedUser = await tx.user.findFirst({
          where: { companyId, platformRole: 'SUPER_ADMIN' },
          select: { id: true },
        });
        if (protectedUser)
          throw new ConflictException('Platforma admini mavjud kompaniyani o‘chirib bo‘lmaydi.');

        // Stabilize file pointers while uploads and queued processors finish their DB writes.
        await tx.$queryRaw`SELECT id FROM "Candidate" WHERE "companyId" = ${companyId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Resume" WHERE "companyId" = ${companyId} FOR UPDATE`;
        const candidates = await tx.candidate.findMany({
          where: { companyId },
          select: { resumeObjectKey: true },
        });
        const resumes = await tx.resume.findMany({
          where: { companyId },
          select: { objectKey: true },
        });
        const keys = [
          ...new Set(
            [
              ...candidates.map((c) => c.resumeObjectKey),
              ...resumes.map((r) => r.objectKey),
            ].filter((key): key is string => Boolean(key)),
          ),
        ];
        if (keys.some((key) => !key.startsWith(`companies/${companyId}/`)))
          throw new ConflictException(
            'CV fayllari kompaniya papkasiga mos emas. Saqlash sozlamalarini tekshiring.',
          );
        if (keys.length)
          await tx.companyFileCleanup.createMany({
            data: keys.map((objectKey) => ({ companyId, companyName: company.name, objectKey })),
            skipDuplicates: true,
          });

        await tx.application.deleteMany({ where: { companyId } });
        await tx.vacancy.deleteMany({ where: { companyId } });
        await tx.candidate.deleteMany({ where: { companyId } });
        await tx.invitation.deleteMany({ where: { companyId } });
        await tx.telegramConnectRequest.deleteMany({ where: { companyId } });
        await tx.telegramBusinessConnection.deleteMany({ where: { companyId } });
        await tx.auditLog.deleteMany({ where: { companyId } });
        await tx.user.deleteMany({ where: { companyId } });
        await tx.company.delete({ where: { id: companyId } });
        await tx.platformAuditLog.create({
          data: {
            actorId: actor.id,
            actorName: actor.fullName,
            companyId,
            companyName: company.name,
            action: 'COMPANY_DELETED',
            reason: input.reason,
            previousActive: company.isActive,
          },
        });
      },
      { timeout: 30000 },
    );
    // The durable cleanup list survives process crashes and storage outages.
    // Never delete external files before the database transaction commits.
    const result = await this.cleanFiles(companyId).catch(() => ({ pendingFiles: null }));
    return { deleted: true, ...result };
  }

  async pending(actor: Identity) {
    platformAdmin(actor);
    const rows = await this.db.companyFileCleanup.groupBy({
      by: ['companyId', 'companyName'],
      _count: true,
      orderBy: { companyId: 'desc' },
      take: 50,
    });
    return rows.map((row) => ({
      companyId: row.companyId,
      companyName: row.companyName,
      pendingFiles: row._count,
    }));
  }

  async retry(actor: Identity, companyId: number) {
    platformAdmin(actor);
    return this.cleanFiles(companyId);
  }

  private async cleanFiles(companyId: number) {
    const tasks = await this.db.companyFileCleanup.findMany({
      where: { companyId },
      orderBy: { id: 'asc' },
      take: 10,
    });
    if (this.storage.enabled)
      await Promise.all(
        tasks.map(async (task) => {
          // Fail closed if a cleanup record is corrupt or belongs to another prefix.
          if (!task.objectKey.startsWith(`companies/${companyId}/`)) return;
          try {
            await this.storage.delete(task.objectKey);
            await this.db.companyFileCleanup.deleteMany({ where: { id: task.id, companyId } });
          } catch {
            /* Keep the durable task for an explicit retry. */
          }
        }),
      );
    return { pendingFiles: await this.db.companyFileCleanup.count({ where: { companyId } }) };
  }
}
