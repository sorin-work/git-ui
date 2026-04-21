import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { commitDiff, diffStats, readCommit } from '../git/commit.js';
import { listCommits } from '../git/log.js';
import type { RepoRegistry } from '../git/repos.js';
import { repoPath, resolveCommit } from '../git/resolve.js';
import { cached } from '../lib/cache.js';
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

    // Ask for one extra commit to know whether another page exists.
    const items = await listCommits(repo, commit, {
      path: path || undefined,
      author: query.author || undefined,
      query: query.q || undefined,
      skip: (query.page - 1) * query.pageSize,
      limit: query.pageSize + 1,
    });

    return {
      ref,
      commit,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: items.length > query.pageSize,
      items: items.slice(0, query.pageSize),
    };
  });

  app.get('/repos/:repo/commits/:sha', async (request) => {
    const repo = await findRepo(registry, request.params);
    const { sha } = z.object({ sha: z.string().max(255) }).parse(request.params);
    const { commit } = await resolveCommit(repo, sha);

    return cached(['commit', repo.path, commit], async () => {
      const [detail, files] = await Promise.all([
        readCommit(repo, commit),
        commitDiff(repo, commit),
      ]);
      return { commit: detail, files, stats: diffStats(files) };
    });
  });
}
