import path from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(4100),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Directory whose subdirectories are the repositories to serve. */
  REPOS_DIR: z.string().min(1).default('./repos'),
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
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`Invalid environment: ${problems}`);
  }
  const e = parsed.data;
  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    reposDir: path.resolve(e.REPOS_DIR),
    seedDemo: e.SEED_DEMO,
  };
}
