import { config as dotenv } from 'dotenv';
import { isAbsolute, resolve } from 'node:path';
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
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().min(2).max(100).default(20),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must contain at least 32 characters'),
  FRONTEND_ORIGIN: z.url().default('http://localhost:5173'),
  GOOGLE_CLIENT_ID: z.string().trim().default(''),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-3.6-flash'),
  GEMINI_FALLBACK_MODEL: z.string().default('gemini-3.5-flash-lite'),
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
  TELEGRAM_API_ID: z.coerce.number().int().nonnegative().default(0),
  TELEGRAM_API_HASH: z.string().default(''),
  TELEGRAM_USER_SESSION_FILE: z.string().default(''),
  HH_CLIENT_ID: z.string().default(''),
  HH_CLIENT_SECRET: z.string().default(''),
  HH_CALLBACK_URL: z.string().default(''),
  HH_TOKEN_ENCRYPTION_KEY: z.string().default(''),
  HH_USER_AGENT: z.string().default(''),
});

export type AppConfig = z.infer<typeof envSchema>;

export function telegramSessionPath(value: string): string {
  return isAbsolute(value) ? value : resolve(__dirname, '../../../../', value);
}

// Modul darajasida cache — getConfig() faqat bir marta parse qiladi.
let _config: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (_config) return _config;
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
  const hhValues = [result.data.HH_CLIENT_ID, result.data.HH_CLIENT_SECRET, result.data.HH_CALLBACK_URL, result.data.HH_TOKEN_ENCRYPTION_KEY, result.data.HH_USER_AGENT];
  if (hhValues.some(Boolean) && !hhValues.every(Boolean)) {
    throw new Error('HeadHunter configuration is incomplete. Set all five HH environment variables.');
  }
  if (hhValues.every(Boolean)) {
    if (!result.data.HH_CALLBACK_URL.startsWith('https://') && result.data.NODE_ENV === 'production')
      throw new Error('HeadHunter callback URL must use HTTPS in production');
    if (Buffer.from(result.data.HH_TOKEN_ENCRYPTION_KEY, 'base64').length !== 32)
      throw new Error('HH_TOKEN_ENCRYPTION_KEY must be a base64 encoded 32-byte key');
  }
  const discoveryValues = [result.data.TELEGRAM_API_ID, result.data.TELEGRAM_API_HASH, result.data.TELEGRAM_USER_SESSION_FILE];
  if (discoveryValues.slice(0, 2).some(Boolean) && !discoveryValues.every(Boolean)) {
    throw new Error('Telegram discovery configuration is incomplete. Set API ID, API hash and session file path.');
  }
  return (_config = result.data);
}

/** Faqat testlarda ishlatish uchun — cache ni tozalaydi. */
export function resetConfigCache(): void {
  _config = undefined;
}
