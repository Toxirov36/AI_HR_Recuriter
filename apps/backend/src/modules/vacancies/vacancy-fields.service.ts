import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import type { VacancyFieldDto } from './dto/vacancy-field.dto';

type Actor = { id: number; companyId: number; fullName: string; role: string };

/** Hiring fields (SMM, IT, videographer...) that candidates choose in the Telegram bot. */
@Injectable()
export class VacancyFieldsService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(AuditService) private audit: AuditService,
  ) {}

  list(companyId: number) {
    return this.db.vacancyField.findMany({
      where: { companyId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        sortOrder: true,
        isActive: true,
        _count: { select: { vacancies: true } },
      },
    });
  }

  async create(actor: Actor, data: VacancyFieldDto) {
    try {
      const field = await this.db.vacancyField.create({ data: { ...data, companyId: actor.companyId } });
      await this.record(actor, 'VACANCY_FIELD_CREATED', field.id, { name: field.name });
      return field;
    } catch (error) {
      throw this.translate(error);
    }
  }

  async update(actor: Actor, id: number, data: VacancyFieldDto) {
    await this.get(actor.companyId, id);
    try {
      const field = await this.db.vacancyField.update({
        where: { id_companyId: { id, companyId: actor.companyId } },
        data,
      });
      await this.record(actor, 'VACANCY_FIELD_UPDATED', id, { name: field.name, isActive: field.isActive });
      return field;
    } catch (error) {
      throw this.translate(error);
    }
  }

  /** Vacancies of a deleted field fall back to "Other" (no field); they are never deleted. */
  async remove(actor: Actor, id: number) {
    const field = await this.get(actor.companyId, id);
    await this.db.$transaction([
      this.db.vacancy.updateMany({ where: { companyId: actor.companyId, fieldId: id }, data: { fieldId: null } }),
      this.db.vacancyField.delete({ where: { id_companyId: { id, companyId: actor.companyId } } }),
    ]);
    await this.record(actor, 'VACANCY_FIELD_DELETED', id, { name: field.name });
    return { ok: true };
  }

  private async get(companyId: number, id: number) {
    const field = await this.db.vacancyField.findUnique({ where: { id_companyId: { id, companyId } } });
    if (!field) throw new NotFoundException('Field not found');
    return field;
  }

  private translate(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('A field with this name already exists');
    }
    return error;
  }

  private record(actor: Actor, action: string, id: number, details: Record<string, unknown>) {
    return this.audit.log({
      companyId: actor.companyId,
      userId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      action,
      resourceType: 'VACANCY_FIELD',
      resourceId: String(id),
      details,
    });
  }
}
