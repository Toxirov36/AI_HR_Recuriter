import { Inject, Injectable } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';

export interface AuditLogEntry {
  companyId: number;
  userId?: number | null;
  actorName: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details?: Record<string, any> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditListQuery {
  page?: number;
  pageSize?: number;
  action?: string;
  fromDate?: string;
  toDate?: string;
}

@Injectable()
export class AuditService {
  constructor(@Inject(Database) private db: Database) {}

  /**
   * Records an audit event into the database.
   */
  async log(entry: AuditLogEntry) {
    try {
      return await this.db.auditLog.create({
        data: {
          companyId: entry.companyId,
          userId: entry.userId ?? null,
          actorName: entry.actorName,
          actorRole: entry.actorRole,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: String(entry.resourceId),
          details: entry.details ? (entry.details as Prisma.InputJsonValue) : Prisma.DbNull,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent ?? null,
        },
      });
    } catch {
      // Never let audit failure interrupt critical business workflows
      return null;
    }
  }

  /**
   * Retrieves paginated audit log entries for a company.
   */
  async list(companyId: number, query: AuditListQuery) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.AuditLogWhereInput = { companyId };

    if (query.action) {
      where.action = query.action;
    }

    if (query.fromDate || query.toDate) {
      where.createdAt = {};
      if (query.fromDate) where.createdAt.gte = new Date(query.fromDate);
      if (query.toDate) where.createdAt.lte = new Date(query.toDate);
    }

    const [items, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.db.auditLog.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Exports audit logs in RFC 4180 CSV format with UTF-8 BOM.
   */
  async exportCsv(companyId: number, query: Omit<AuditListQuery, 'page' | 'pageSize'> = {}): Promise<string> {
    const where: Prisma.AuditLogWhereInput = { companyId };
    if (query.action) where.action = query.action;
    if (query.fromDate || query.toDate) {
      where.createdAt = {};
      if (query.fromDate) where.createdAt.gte = new Date(query.fromDate);
      if (query.toDate) where.createdAt.lte = new Date(query.toDate);
    }

    const items = await this.db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const headers = [
      'ID',
      'Vaqt (UTC)',
      'Foydalanuvchi',
      'Rol',
      'Amal (Action)',
      'Resurs turi',
      'Resurs ID',
      'Tafsilotlar',
      'IP manzil',
    ];

    const escapeCsv = (str: string | number | null | undefined): string => {
      if (str === null || str === undefined) return '""';
      const clean = String(str).replace(/"/g, '""');
      return `"${clean}"`;
    };

    const rows = items.map((item) => [
      escapeCsv(item.id),
      escapeCsv(item.createdAt.toISOString()),
      escapeCsv(item.actorName),
      escapeCsv(item.actorRole),
      escapeCsv(item.action),
      escapeCsv(item.resourceType),
      escapeCsv(item.resourceId),
      escapeCsv(item.details ? JSON.stringify(item.details) : ''),
      escapeCsv(item.ipAddress),
    ]);

    // Prepend UTF-8 BOM so Microsoft Excel renders non-ASCII characters correctly
    return '\uFEFF' + [headers.map((h) => `"${h}"`).join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  }

  /**
   * Exports audit logs in JSON format.
   */
  async exportJson(companyId: number, query: Omit<AuditListQuery, 'page' | 'pageSize'> = {}) {
    const where: Prisma.AuditLogWhereInput = { companyId };
    if (query.action) where.action = query.action;
    if (query.fromDate || query.toDate) {
      where.createdAt = {};
      if (query.fromDate) where.createdAt.gte = new Date(query.fromDate);
      if (query.toDate) where.createdAt.lte = new Date(query.toDate);
    }

    return this.db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
  }
}
