import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { admin } from '../../common/guards/auth.guard';
import { Identity, Security } from '../../common/utils/security';
import { smtpOptions } from '../notifications/smtp.config';
import { userSelect } from '../auth/auth.service';
import { z } from 'zod';

export const companySettingsSchema = z.object({
  name: z.string().trim().min(2).max(160),
  retentionDays: z.number().int().min(30).max(3650),
}).strict();
export const memberAccessSchema = z.object({
  role: z.enum(['ADMIN', 'HR', 'RECRUITER', 'INTERVIEWER']),
  isActive: z.boolean(),
}).strict();

@Injectable()
export class CompanyAdminService {
  constructor(@Inject(Database) private db: Database, @Inject(Security) private security: Security) {}

  async overview(actor: Identity) {
    admin(actor);
    const companyId = actor.companyId;
    const [company, members, activeMembers, vacancies, candidates, applications, stages, telegram, invitations] = await Promise.all([
      this.db.company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, name: true, retentionDays: true, createdAt: true } }),
      this.db.user.count({ where: { companyId } }),
      this.db.user.count({ where: { companyId, isActive: true } }),
      this.db.vacancy.count({ where: { companyId, status: 'ACTIVE' } }),
      this.db.candidate.count({ where: { companyId, mergedIntoId: null, isAnonymized: false } }),
      this.db.application.count({ where: { companyId } }),
      this.db.application.groupBy({ by: ['status'], where: { companyId }, _count: true }),
      this.db.telegramBusinessConnection.count({ where: { companyId, enabled: true } }),
      this.db.invitation.count({ where: { companyId, usedAt: null, expiresAt: { gt: new Date() } } }),
    ]);
    const config = this.security.config;
    return {
      company, stats: { members, activeMembers, vacancies, candidates, applications, invitations }, stages,
      integrations: { emailConfigured: smtpOptions().ok, aiConfigured: Boolean(config.GEMINI_API_KEY), telegramConnected: telegram > 0, storageConfigured: Boolean(config.R2_BUCKET_NAME) },
    };
  }

  async settings(actor: Identity, input: z.infer<typeof companySettingsSchema>) {
    admin(actor);
    return this.db.$transaction(async (tx) => {
      const company = await tx.company.update({ where: { id: actor.companyId }, data: input, select: { id: true, name: true, retentionDays: true } });
      await tx.auditLog.create({ data: { companyId: actor.companyId, userId: actor.id, actorName: actor.fullName, actorRole: actor.role, action: 'COMPANY_SETTINGS_UPDATED', resourceType: 'COMPANY', resourceId: String(actor.companyId), details: input } });
      return company;
    });
  }

  async member(actor: Identity, memberId: number, input: z.infer<typeof memberAccessSchema>) {
    admin(actor);
    if (actor.id === memberId) throw new ConflictException('O‘z rolingiz yoki kirish holatingizni o‘zgartira olmaysiz.');
    return this.db.$transaction(async (tx) => {
      // Serialize access changes per company, including simultaneous administrator edits.
      await tx.$queryRaw`SELECT id FROM "Company" WHERE id = ${actor.companyId} FOR UPDATE`;
      const currentActor = await tx.user.findFirst({ where: { id: actor.id, companyId: actor.companyId, role: 'ADMIN', isActive: true } });
      if (!currentActor) throw new ConflictException('Admin ruxsati o‘zgargan. Sahifani yangilang.');
      const member = await tx.user.findFirst({ where: { id: memberId, companyId: actor.companyId } });
      if (!member) throw new NotFoundException('Xodim topilmadi');
      if (member.platformRole === 'SUPER_ADMIN') throw new ConflictException('Platforma adminining ruxsatlarini bu panelda o‘zgartirib bo‘lmaydi.');
      if (member.role === 'ADMIN' && member.isActive && (input.role !== 'ADMIN' || !input.isActive)) {
        const admins = await tx.user.count({ where: { companyId: actor.companyId, role: 'ADMIN', isActive: true } });
        if (admins <= 1) throw new ConflictException('Kamida bitta faol admin qolishi kerak.');
      }
      const updated = await tx.user.update({ where: { id: member.id, companyId: actor.companyId }, data: input, select: userSelect });
      await tx.auditLog.create({ data: { companyId: actor.companyId, userId: actor.id, actorName: actor.fullName, actorRole: actor.role, action: 'MEMBER_ACCESS_UPDATED', resourceType: 'USER', resourceId: String(member.id), details: { before: { role: member.role, isActive: member.isActive }, after: input } } });
      return updated;
    });
  }
}
