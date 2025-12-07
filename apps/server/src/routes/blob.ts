import type { FastifyInstance } from 'fastify';
import { readBlob } from '../git/blob.js';
import type { RepoRegistry } from '../git/repos.js';
import { objectType, repoPath, resolveCommit } from '../git/resolve.js';
import { badRequest, notFound } from '../lib/errors.js';
import { isImage, languageFor } from '../lib/languages.js';
import { findRepo } from './repos.js';
import { refPathQuery } from './tree.js';

export async function blobRoutes(app: FastifyInstance, { registry }: { registry: RepoRegistry }) {
  app.get('/repos/:repo/blob', async (request) => {
    const repo = await findRepo(registry, request.params);
    const query = refPathQuery.parse(request.query);
    const path = repoPath(query.path);
    if (path === '') throw badRequest('A file path is required');
    const { ref, commit } = await resolveCommit(repo, query.ref);

    const type = await objectType(repo, commit, path);
    if (type === null) throw notFound(`File "${path}"`);
    if (type !== 'blob') throw badRequest(`"${path}" is not a file`);

    const name = path.slice(path.lastIndexOf('/') + 1);
    const blob = await readBlob(repo, commit, path);
    return {
      ref,
      commit,
      path,
      name,
      language: languageFor(name),
      image: isImage(name),
      ...blob,
    };
  });
}
