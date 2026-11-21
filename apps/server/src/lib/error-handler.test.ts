import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { GitError } from '../git/run.js';
import { errorHandler } from './error-handler.js';
import { notFound } from './errors.js';
import { BusyError } from './semaphore.js';

function appThatThrows(error: unknown) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.get('/boom', async () => {
    throw error;
  });
  return app;
}

describe('errorHandler', () => {
  it.each([
    [notFound('Repository'), 404, 'not_found'],
    [new GitError(['show'], 128, "fatal: bad revision 'x'"), 404, 'not_found'],
    [new GitError(['log'], null, '', { timedOut: true }), 504, 'timeout'],
    [new GitError(['show'], null, '', { outputTooLarge: true }), 413, 'too_large'],
    [new GitError(['show'], 128, 'fatal: something else'), 500, 'internal_error'],
    [new Error('secret details'), 500, 'internal_error'],
    [new BusyError(), 503, 'busy'],
  ])('maps %s to %i', async (error, status, code) => {
    const res = await appThatThrows(error).inject('/boom');
    expect(res.statusCode).toBe(status);
    expect(res.json().error.code).toBe(code);
    expect(res.body).not.toContain('secret');
  });

  it('turns validation errors into 400 with the failing fields', async () => {
    const result = z.object({ ref: z.string() }).safeParse({});
    const res = await appThatThrows(result.error).inject('/boom');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.issues[0].path).toBe('ref');
  });

  it('asks a busy client to retry later', async () => {
    const res = await appThatThrows(new BusyError()).inject('/boom');
    expect(res.headers['retry-after']).toBe('2');
  });

  it('answers JSON even when the route had set up a file download', async () => {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    app.get('/download', async (_request, reply) => {
      reply.header('Content-Type', 'application/gzip');
      reply.header('Content-Disposition', 'attachment; filename="x.tar.gz"');
      throw new GitError(['archive'], null, '', { timedOut: true });
    });
    const res = await app.inject('/download');
    expect(res.statusCode).toBe(504);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.headers['content-disposition']).toBeUndefined();
  });
});
