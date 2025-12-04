import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RepoRegistry } from '../git/repos.js';
import { objectType, repoPath, resolveCommit } from '../git/resolve.js';
import { listTree } from '../git/tree.js';
import { badRequest, notFound } from '../lib/errors.js';
import { findRepo } from './repos.js';

export const refPathQuery = z.object({
  ref: z.string().max(255).optional(),
  path: z.string().max(4096).optional(),
});

export async function treeRoutes(app: FastifyInstance, { registry }: { registry: RepoRegistry }) {
  app.get('/repos/:repo/tree', async (request) => {
    const repo = await findRepo(registry, request.params);
    const query = refPathQuery.parse(request.query);
    const path = repoPath(query.path);
    const { ref, commit } = await resolveCommit(repo, query.ref);

    const type = await objectType(repo, commit, path);
    if (type === null) throw notFound(`Path "${path}"`);
    if (type !== 'tree') throw badRequest(`"${path}" is not a directory`);

    return { ref, commit, path, entries: await listTree(repo, commit, path) };
  });
}
