import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchCode } from '../git/grep.js';
import type { RepoRegistry } from '../git/repos.js';
import { repoPath, resolveCommit } from '../git/resolve.js';
import { findRepo } from './repos.js';

const searchQuery = z.object({
  q: z.string().min(2, 'Search for at least 2 characters').max(200),
  ref: z.string().max(255).optional(),
  path: z.string().max(4096).optional(),
  case: z.enum(['0', '1']).optional(),
});

export async function searchRoutes(app: FastifyInstance, { registry }: { registry: RepoRegistry }) {
  app.get('/repos/:repo/search', async (request) => {
    const repo = await findRepo(registry, request.params);
    const query = searchQuery.parse(request.query);
    const path = repoPath(query.path);
    const { ref, commit } = await resolveCommit(repo, query.ref);

    const result = await searchCode(repo, commit, query.q, {
      path: path || undefined,
      caseSensitive: query.case === '1',
    });
    return { ref, commit, query: query.q, ...result };
  });
}
