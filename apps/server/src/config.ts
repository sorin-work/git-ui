import path from 'node:path';
import { z } from 'zod';

/** Empty variables (e.g. `AUTH_USERNAME=` from docker compose) count as not set. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(4100),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Directory whose subdirectories are the repositories to serve. */
  REPOS_DIR: z.string().min(1).default('./repos'),
  /** Protect the API with HTTP basic auth when both are set. */
  AUTH_USERNAME: optional(z.string().min(1)),
  AUTH_PASSWORD: optional(z.string().min(8, 'AUTH_PASSWORD must be at least 8 characters')),
  /** Create sample repositories on startup when REPOS_DIR has none. */
  SEED_DEMO: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export interface Config {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: string;
  reposDir: string;
  seedDemo: boolean;
  auth: { username: string; password: string } | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`Invalid environment: ${problems}`);
  }
  const e = parsed.data;
  if (Boolean(e.AUTH_USERNAME) !== Boolean(e.AUTH_PASSWORD)) {
    throw new Error('Invalid environment: set both AUTH_USERNAME and AUTH_PASSWORD, or neither');
  }
  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    reposDir: path.resolve(e.REPOS_DIR),
    seedDemo: e.SEED_DEMO,
    auth:
      e.AUTH_USERNAME && e.AUTH_PASSWORD
        ? { username: e.AUTH_USERNAME, password: e.AUTH_PASSWORD }
        : null,
  };
}
