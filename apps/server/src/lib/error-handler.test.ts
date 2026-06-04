import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { GitError } from '../git/run.js';
import { errorHandler } from './error-handler.js';
import { notFound } from './errors.js';

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
});
