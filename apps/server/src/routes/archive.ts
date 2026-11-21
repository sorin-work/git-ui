import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { archiveStream } from '../git/archive.js';
import type { RepoRegistry } from '../git/repos.js';
import { resolveCommit } from '../git/resolve.js';
import { GitError } from '../git/run.js';
import { markTimedOut } from '../lib/error-handler.js';
import { requestContext } from '../lib/request-context.js';
import { Semaphore } from '../lib/semaphore.js';
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
  {
    registry,
    limits,
  }: {
    registry: RepoRegistry;
    limits: { maxConcurrent: number; timeoutMs: number; queueTimeoutMs: number };
  },
) {
  // Archives stream for as long as the download takes, so they get their own
  // small limit instead of holding git slots for minutes.
  // They wait for a slot as long as git calls do (GIT_QUEUE_TIMEOUT_MS).
  const slots = new Semaphore(limits.maxConcurrent, limits.queueTimeoutMs);

  /** The files at a ref, as a zip or tarball, inside a "<repo>-<ref>/" folder. */
  app.get('/repos/:repo/archive', async (request, reply) => {
    const repo = await findRepo(registry, request.params);
    const query = archiveQuery.parse(request.query);
    const { ref, commit } = await resolveCommit(repo, query.ref);
    const format = FORMATS[query.format];

    const label = `${repo.name}-${ref.replace(/[^A-Za-z0-9._-]+/g, '-')}`;
    const release = await slots.acquire(requestContext.getStore()?.signal);
    let stream;
    try {
      stream = await archiveStream(repo, commit, label, query.format);
    } catch (err) {
      release();
      throw err;
    }

    // Stop git when the download takes too long or the client goes away.
    const timer = setTimeout(() => {
      request.log.warn({ repo: repo.name }, 'archive timed out');
      // If nothing was sent yet, the error handler answers 504 for this
      // request whatever error the stream ends with.
      markTimedOut(request);
      stream.destroy(new GitError(['archive'], null, 'archive timed out', { timedOut: true }));
    }, limits.timeoutMs);
    stream.once('close', () => {
      clearTimeout(timer);
      release();
    });
    reply.raw.once('close', () => {
      if (!reply.raw.writableFinished) stream.destroy();
    });

    reply.header('Content-Type', format.type);
    reply.header('Content-Disposition', `attachment; filename="${label}.${format.extension}"`);
    return reply.send(stream);
  });
}
