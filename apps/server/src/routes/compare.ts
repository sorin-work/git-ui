import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { compare } from '../git/compare.js';
import type { RepoRegistry } from '../git/repos.js';
import { resolveCommit } from '../git/resolve.js';
import { findRepo } from './repos.js';

const compareQuery = z.object({
  base: z.string().min(1).max(255),
  head: z.string().min(1).max(255),
});

export async function compareRoutes(
  app: FastifyInstance,
  { registry }: { registry: RepoRegistry },
) {
  app.get('/repos/:repo/compare', async (request) => {
    const repo = await findRepo(registry, request.params);
    const query = compareQuery.parse(request.query);
    const [base, head] = await Promise.all([
      resolveCommit(repo, query.base),
      resolveCommit(repo, query.head),
    ]);
    return { base, head, ...(await compare(repo, base.commit, head.commit)) };
  });
}
