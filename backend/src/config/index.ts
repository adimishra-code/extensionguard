import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/extension_guard?schema=public'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(1).default('dev-secret-not-for-production'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  UPLOAD_MAX_SIZE: z.coerce.number().default(50 * 1024 * 1024),
  UPLOAD_DIR: z.string().default('/tmp/extension-guard/uploads'),
  ANALYZER_TIMEOUT_MS: z.coerce.number().default(300000),
  SANDBOX_TIMEOUT_MS: z.coerce.number().default(600000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  FRONTEND_URL: z.string().optional().default('http://localhost:5173'),
  ANALYZER_VERSION: z.string().default('1.0.0'),
  RULESET_VERSION: z.string().default('1.0.0'),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default('meta-llama/llama-3.3-70b-instruct'),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_PROVIDER: z.enum(['gemini', 'openai', 'openrouter', 'anthropic', 'heuristic']).default('heuristic'),
  LLM_MODEL: z.string().default('gemini-1.5-flash'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional().default('ExtensionGuard <no-reply@extensionguard.io>'),
  SMTP_SECURE: z.coerce.boolean().optional().default(false),
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