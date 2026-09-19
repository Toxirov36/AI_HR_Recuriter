import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/backend/package.json', import.meta.url));
require('dotenv').config({ path: new URL('../.env', import.meta.url), quiet: true });
const { Client } = require('pg');
const Redis = require('ioredis');
const checks = [
  [
    'PostgreSQL',
    async () => {
      if (!process.env.DATABASE_URL) throw new Error('Missing DATABASE_URL');
      const db = new Client({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 4000,
      });
      try {
        await db.connect();
        await db.query('SELECT 1');
      } finally {
        await db.end();
      }
    },
  ],
  [
    'Redis',
    async () => {
      if (!process.env.REDIS_URL) throw new Error('Missing REDIS_URL');
      const redis = new Redis(process.env.REDIS_URL, {
        lazyConnect: true,
        retryStrategy: () => null,
        connectTimeout: 4000,
        commandTimeout: 4000,
      });
      redis.on('error', () => {});
      try {
        await redis.connect();
        await redis.ping();
      } finally {
        redis.disconnect();
      }
    },
  ],
];
for (const [name, check] of checks) {
  try {
    await check();
    console.log(`${name}: ready`);
  } catch (error) {
    const reason =
      name === 'PostgreSQL' && (error.code === '28P01' || error.code === '28000')
        ? 'authentication failed — correct the username/password in DATABASE_URL (do not share secrets in chat)'
        : `unavailable — check ${name === 'Redis' ? 'REDIS_URL and start Redis (docker compose up -d redis)' : 'DATABASE_URL and the PostgreSQL server'}`;
    console.error(`${name}: ${reason}`);
    process.exitCode = 1;
  }
}
