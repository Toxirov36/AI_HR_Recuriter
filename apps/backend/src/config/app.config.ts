import { config as dotenv } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';

const envPaths = [
  resolve(__dirname, '../../../../.env'),
  resolve(__dirname, '../../../.env'),
  resolve(process.cwd(), '.env'),
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    dotenv({ path: envPath, quiet: true });
    break;
  }
}

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must contain at least 32 characters'),
  FRONTEND_ORIGIN: z.url().default('http://localhost:5173'),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash'),
  GEMINI_EMBEDDING_MODEL: z.string().default('gemini-embedding-2'),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(60000),
  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_BUCKET_NAME: z.string().default(''),
  R2_ENDPOINT: z.string().default(''),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_WEBHOOK_SECRET: z.string().default(''),
  TELEGRAM_WEBHOOK_URL: z.string().default(''),
});

export type AppConfig = z.infer<typeof envSchema>;

export function getConfig(): AppConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(
      `Invalid environment: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  if (
    result.data.NODE_ENV === 'production' &&
    !result.data.FRONTEND_ORIGIN.startsWith('https://')
  ) {
    throw new Error('Production requires an HTTPS FRONTEND_ORIGIN');
  }
  const r2Values = [
    result.data.R2_ACCOUNT_ID,
    result.data.R2_ACCESS_KEY_ID,
    result.data.R2_SECRET_ACCESS_KEY,
    result.data.R2_BUCKET_NAME,
    result.data.R2_ENDPOINT,
  ];
  if (r2Values.some(Boolean) && !r2Values.every(Boolean)) {
    throw new Error('R2 configuration is incomplete. Set all five R2 environment variables.');
  }
  return result.data;
}
