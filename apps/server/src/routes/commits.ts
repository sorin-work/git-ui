import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listCommits } from '../git/log.js';
import type { RepoRegistry } from '../git/repos.js';
import { repoPath, resolveCommit } from '../git/resolve.js';
import { findRepo } from './repos.js';

const commitsQuery = z.object({
  ref: z.string().max(255).optional(),
  path: z.string().max(4096).optional(),
  author: z.string().trim().max(100).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export async function commitRoutes(app: FastifyInstance, { registry }: { registry: RepoRegistry }) {
  app.get('/repos/:repo/commits', async (request) => {
    const repo = await findRepo(registry, request.params);
    const query = commitsQuery.parse(request.query);
    const path = repoPath(query.path);
    const { ref, commit } = await resolveCommit(repo, query.ref);

    const items = await listCommits(repo, commit, {
      path: path || undefined,
      author: query.author || undefined,
      query: query.q || undefined,
      skip: (query.page - 1) * query.pageSize,
      limit: query.pageSize,
    });

    return {
      ref,
      commit,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: items.length === query.pageSize,
      items,
    };
  });
}
