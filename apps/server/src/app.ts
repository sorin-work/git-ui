import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.js';

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.logLevel === 'silent' ? false : { level: config.logLevel },
    disableRequestLogging: config.env === 'test',
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  return app;
}
