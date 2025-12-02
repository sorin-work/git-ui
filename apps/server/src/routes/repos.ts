import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RepoLocation, RepoRegistry } from '../git/repos.js';
import { refCounts, summarize } from '../git/summary.js';
import { notFound } from '../lib/errors.js';

export const repoParams = z.object({ repo: z.string() });

/** Resolves the `:repo` URL parameter or throws a 404. */
export async function findRepo(registry: RepoRegistry, params: unknown): Promise<RepoLocation> {
  const { repo } = repoParams.parse(params);
  const location = await registry.get(repo);
  if (!location) throw notFound('Repository');
  return location;
}

export async function repoRoutes(app: FastifyInstance, { registry }: { registry: RepoRegistry }) {
  app.get('/repos', async () => {
    const repos = await registry.list();
    return { repos: await Promise.all(repos.map(summarize)) };
  });

  app.get('/repos/:repo', async (request) => {
    const repo = await findRepo(registry, request.params);
    const [summary, counts] = await Promise.all([summarize(repo), refCounts(repo)]);
    return { repo: { ...summary, ...counts } };
  });
}
