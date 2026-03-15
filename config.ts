/**
 * Environment Configuration Loader
 * Workstream B: Environment Configuration and Secrets Management
 */
import { z } from 'zod';

const configSchema = z.object({
  database: z.object({
    host: z.string().default('localhost'),
    port: z.coerce.number().default(5432),
    name: z.string().default('app_database'),
    user: z.string().default('app_user'),
    password: z.string(),
    sslMode: z.enum(['disable', 'require', 'prefer']).default('disable'),
  }),
  pool: z.object({
    min: z.coerce.number().default(2),
    max: z.coerce.number().default(10),
    timeout: z.coerce.number().default(30000),
    idleTimeout: z.coerce.number().default(10000),
  }),
  app: z.object({
    env: z.enum(['development', 'test', 'production']).default('development'),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const config = {
    database: {
      host: process.env.DATABASE_HOST,
      port: process.env.DATABASE_PORT,
      name: process.env.DATABASE_NAME,
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      sslMode: process.env.DATABASE_SSL_MODE,
    },
    pool: {
      min: process.env.DATABASE_POOL_MIN,
      max: process.env.DATABASE_POOL_MAX,
      timeout: process.env.DATABASE_TIMEOUT,
      idleTimeout: process.env.DATABASE_IDLE_TIMEOUT,
    },
    app: {
      env: process.env.NODE_ENV,
      logLevel: process.env.LOG_LEVEL,
    },
  };

  const result = configSchema.safeParse(config);

  if (!result.success) {
    console.error('Configuration validation failed:');
    result.error.errors.forEach(err => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
    throw new Error('Invalid configuration');
  }

  return result.data;
}

export const config = loadConfig();
