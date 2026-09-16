import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/extension_guard?schema=public'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default('7d'),
  UPLOAD_MAX_SIZE: z.coerce.number().default(50 * 1024 * 1024),
  UPLOAD_DIR: z.string().default('/tmp/extension-guard/uploads'),
  ANALYZER_TIMEOUT_MS: z.coerce.number().default(300000),
  SANDBOX_TIMEOUT_MS: z.coerce.number().default(600000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  ANALYZER_VERSION: z.string().default('1.0.0'),
  RULESET_VERSION: z.string().default('1.0.0'),
});

// Validate early — fail fast on startup if env is misconfigured
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  parsed.error.errors.forEach((err) => {
    console.error(`  ${err.path.join('.')}: ${err.message}`);
  });
  process.exit(1);
}

// Extra guard: warn if JWT_SECRET looks like the placeholder in production
if (
  parsed.data.NODE_ENV === 'production' &&
  parsed.data.JWT_SECRET.includes('change-this')
) {
  console.error('❌ JWT_SECRET must be changed from the default placeholder in production.');
  process.exit(1);
}

export const config = parsed.data;