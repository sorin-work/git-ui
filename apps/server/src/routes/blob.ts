import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { looksBinary, readBlob, readBlobBytes } from '../git/blob.js';
import type { RepoRegistry } from '../git/repos.js';
import { objectType, repoPath, resolveCommit } from '../git/resolve.js';
import { badRequest, notFound } from '../lib/errors.js';
import { isImage, languageFor } from '../lib/languages.js';
import { contentTypeFor, RAW_FILE_HEADERS } from '../lib/mime.js';
import { findRepo } from './repos.js';
import { refPathQuery } from './tree.js';

const rawQuery = refPathQuery.extend({
  download: z.enum(['0', '1']).optional(),
});

/** RFC 6266 filename parameter that survives non-ASCII names. */
function attachment(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function blobRoutes(app: FastifyInstance, { registry }: { registry: RepoRegistry }) {
  /** The file's bytes, for downloads and image previews. */
  app.get('/repos/:repo/raw', async (request, reply) => {
    const repo = await findRepo(registry, request.params);
    const query = rawQuery.parse(request.query);
    const path = repoPath(query.path);
    if (path === '') throw badRequest('A file path is required');
    const { commit } = await resolveCommit(repo, query.ref);

    const type = await objectType(repo, commit, path);
    if (type === null) throw notFound(`File "${path}"`);
    if (type !== 'blob') throw badRequest(`"${path}" is not a file`);

    const name = path.slice(path.lastIndexOf('/') + 1);
    const bytes = await readBlobBytes(repo, commit, path);
    reply.header('Content-Type', contentTypeFor(name, looksBinary(bytes)));
    reply.headers(RAW_FILE_HEADERS);
    reply.header('Cache-Control', 'private, max-age=60');
    if (query.download === '1') reply.header('Content-Disposition', attachment(name));
    return reply.send(bytes);
  });

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
