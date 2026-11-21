import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { archiveStream } from '../git/archive.js';
import type { RepoRegistry } from '../git/repos.js';
import { resolveCommit } from '../git/resolve.js';
import { findRepo } from './repos.js';

const FORMATS = {
  zip: { type: 'application/zip', extension: 'zip' },
  'tar.gz': { type: 'application/gzip', extension: 'tar.gz' },
} as const;

const archiveQuery = z.object({
  ref: z.string().max(255).optional(),
  format: z.enum(['zip', 'tar.gz']).default('zip'),
});

export async function archiveRoutes(
  app: FastifyInstance,
  { registry }: { registry: RepoRegistry },
) {
  /** The files at a ref, as a zip or tarball, inside a "<repo>-<ref>/" folder. */
  app.get('/repos/:repo/archive', async (request, reply) => {
    const repo = await findRepo(registry, request.params);
    const query = archiveQuery.parse(request.query);
    const { ref, commit } = await resolveCommit(repo, query.ref);
    const format = FORMATS[query.format];

    const label = `${repo.name}-${ref.replace(/[^A-Za-z0-9._-]+/g, '-')}`;
    const stream = await archiveStream(repo, commit, label, query.format);
    reply.header('Content-Type', format.type);
    reply.header('Content-Disposition', `attachment; filename="${label}.${format.extension}"`);
    return reply.send(stream);
  });
}
