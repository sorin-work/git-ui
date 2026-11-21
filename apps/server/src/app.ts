import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { RepoRegistry } from './git/repos.js';
import { configureGit } from './git/run.js';
import { configureCache } from './lib/cache.js';
import { requestContext } from './lib/request-context.js';
import { basicAuth } from './lib/basic-auth.js';
import { errorHandler } from './lib/error-handler.js';
import { archiveRoutes } from './routes/archive.js';
import { blameRoutes } from './routes/blame.js';
import { blobRoutes } from './routes/blob.js';
import { commitRoutes } from './routes/commits.js';
import { compareRoutes } from './routes/compare.js';
import { insightsRoutes } from './routes/insights.js';
import { refRoutes } from './routes/refs.js';
import { repoRoutes } from './routes/repos.js';
import { searchRoutes } from './routes/search.js';
import { treeRoutes } from './routes/tree.js';

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: config.trustProxy,
    logger: config.logLevel === 'silent' ? false : { level: config.logLevel },
    logController: new LogController({
      // The docker healthcheck polls /api/health every 15 seconds; logging it
      // would bury everything else.
      disableRequestLogging: (request) => config.env === 'test' || request.url === '/api/health',
    }),
  });

  configureGit(config.git);
  configureCache(config.cacheMaxMb);

  // Each request gets an AbortSignal that git calls pick up (see
  // lib/request-context.ts). It aborts when the client goes away before the
  // answer is complete, and when the request failed, so the other git calls
  // of a page that runs several at once stop with it.
  const controllers = new WeakMap<object, AbortController>();
  app.addHook('onRequest', (request, reply, done) => {
    const controller = new AbortController();
    controllers.set(request, controller);
    reply.raw.once('close', () => {
      if (!reply.raw.writableFinished) controller.abort(new Error('The client went away'));
    });
    requestContext.run({ signal: controller.signal }, done);
  });
  app.addHook('onError', async (request) => {
    controllers.get(request)?.abort(new Error('The request failed'));
  });

  app.setErrorHandler(errorHandler);
  if (config.auth) app.addHook('onRequest', basicAuth(config.auth.username, config.auth.password));
  // JSON is never to be sniffed into something else, and with a login no
  // shared cache may keep an answer meant for the logged-in user.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    if (config.auth && !reply.hasHeader('Cache-Control')) reply.header('Cache-Control', 'private');
  });
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: { code: 'not_found', message: `Route ${request.method} ${request.url} not found` },
    });
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  const registry = new RepoRegistry(config.reposDir, ({ dir, reason }) =>
    app.log.warn({ dir, reason }, 'repository left out'),
  );
  await app.register(repoRoutes, { prefix: '/api', registry });
  await app.register(treeRoutes, { prefix: '/api', registry });
  await app.register(blobRoutes, { prefix: '/api', registry });
  await app.register(commitRoutes, { prefix: '/api', registry });
  await app.register(refRoutes, { prefix: '/api', registry });
  await app.register(blameRoutes, { prefix: '/api', registry });
  await app.register(compareRoutes, { prefix: '/api', registry });
  await app.register(searchRoutes, { prefix: '/api', registry });
  await app.register(insightsRoutes, { prefix: '/api', registry });
  await app.register(archiveRoutes, {
    prefix: '/api',
    registry,
    limits: { ...config.archives, queueTimeoutMs: config.git.queueTimeoutMs },
  });

  return app;
}
