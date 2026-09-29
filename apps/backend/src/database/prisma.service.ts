import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getConfig } from '../config/app.config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const { DATABASE_URL: connectionString, DB_POOL_MAX } = getConfig();
    if (!connectionString) throw new Error('DATABASE_URL is required');
    const schema = new URL(connectionString).searchParams.get('schema') ?? 'public';
    const pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 5000,
      max: DB_POOL_MAX,
    });
    const adapter = new PrismaPg(pool, { schema });
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}

// Backward compatibility alias for Database
export { PrismaService as Database };
