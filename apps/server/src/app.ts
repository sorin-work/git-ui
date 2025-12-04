import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { RepoRegistry } from './git/repos.js';
import { errorHandler } from './lib/error-handler.js';
import { repoRoutes } from './routes/repos.js';
import { treeRoutes } from './routes/tree.js';

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.logLevel === 'silent' ? false : { level: config.logLevel },
    disableRequestLogging: config.env === 'test',
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: { code: 'not_found', message: `Route ${request.method} ${request.url} not found` },
    });
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  const registry = new RepoRegistry(config.reposDir);
  await app.register(repoRoutes, { prefix: '/api', registry });
  await app.register(treeRoutes, { prefix: '/api', registry });

  return app;
}
