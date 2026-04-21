import type { FastifyInstance } from 'fastify';
import { blame } from '../git/blame.js';
import { blobSize, MAX_DISPLAY_BYTES } from '../git/blob.js';
import type { RepoRegistry } from '../git/repos.js';
import { objectType, repoPath, resolveCommit } from '../git/resolve.js';
import { badRequest, notFound } from '../lib/errors.js';
import { cached } from '../lib/cache.js';
import { findRepo } from './repos.js';
import { refPathQuery } from './tree.js';

export async function blameRoutes(app: FastifyInstance, { registry }: { registry: RepoRegistry }) {
  app.get('/repos/:repo/blame', async (request) => {
    const repo = await findRepo(registry, request.params);
    const query = refPathQuery.parse(request.query);
    const path = repoPath(query.path);
    if (path === '') throw badRequest('A file path is required');
    const { ref, commit } = await resolveCommit(repo, query.ref);

    const type = await objectType(repo, commit, path);
    if (type === null) throw notFound(`File "${path}"`);
    if (type !== 'blob') throw badRequest(`"${path}" is not a file`);
    if ((await blobSize(repo, commit, path)) > MAX_DISPLAY_BYTES) {
      throw badRequest('This file is too large to blame');
    }

    const result = await cached(['blame', repo.path, commit, path], () =>
      blame(repo, commit, path),
    );
    return { ref, commit, path, ...result };
  });
}
