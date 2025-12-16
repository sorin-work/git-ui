import type { FastifyInstance } from 'fastify';
import { listBranches, listTags } from '../git/refs.js';
import type { RepoRegistry } from '../git/repos.js';
import { defaultBranch } from '../git/summary.js';
import { findRepo } from './repos.js';

export async function refRoutes(app: FastifyInstance, { registry }: { registry: RepoRegistry }) {
  app.get('/repos/:repo/branches', async (request) => {
    const repo = await findRepo(registry, request.params);
    const main = await defaultBranch(repo);
    return { defaultBranch: main, branches: await listBranches(repo, main) };
  });

  app.get('/repos/:repo/tags', async (request) => {
    const repo = await findRepo(registry, request.params);
    return { tags: await listTags(repo) };
  });
}
