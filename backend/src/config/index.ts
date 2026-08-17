import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/extension_guard?schema=public'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  UPLOAD_MAX_SIZE: z.coerce.number().default(50 * 1024 * 1024),
  UPLOAD_DIR: z.string().default('/tmp/extension-guard/uploads'),
  ANALYZER_TIMEOUT_MS: z.coerce.number().default(300000),
  SANDBOX_TIMEOUT_MS: z.coerce.number().default(600000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  ANALYZER_VERSION: z.string().default('0.1.0'),
  RULESET_VERSION: z.string().default('0.1.0'),
});

export const config = envSchema.parse(process.env);