import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { GitError } from '../git/run.js';
import { HttpError } from './errors.js';
import { BusyError } from './semaphore.js';

const timedOutRequests = new WeakSet<object>();

/** An error from an AbortSignal (client gone, or a sibling call failed). */
export function isAbort(error: unknown): boolean {
  const e = error as { name?: string; code?: string } | null;
  return e?.name === 'AbortError' || e?.code === 'ABORT_ERR';
}

/**
 * Marks a request as stopped by its own time limit. A stream destroyed by a
 * timer does not always reach the error handler with the error it was
 * destroyed with, so the request itself carries the reason.
 */
export function markTimedOut(request: FastifyRequest) {
  timedOutRequests.add(request);
}

function send(reply: FastifyReply, status: number, code: string, message: string, extra = {}) {
  // A route that failed after setting up a download (an archive whose
  // stream broke before the first byte) has set Content-Type and
  // Content-Disposition for the file. The error is JSON, and with the file's
  // type Fastify would refuse to serialize it and answer a bare 500.
  reply.removeHeader('Content-Disposition');
  reply.header('Content-Type', 'application/json; charset=utf-8');
  return reply.status(status).send({ error: { code, message, ...extra } });
}

/** Turns every error into `{ error: { code, message } }` with a sensible status. */
export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  // The client went away, or the request was stopped after a sibling call
  // failed: nothing went wrong on our side, and nobody reads the answer.
  if (isAbort(error)) {
    request.log.info({ reason: error.message }, 'request aborted');
    return send(reply, 503, 'aborted', 'The request was stopped');
  }
  if (error instanceof ZodError) {
    return send(reply, 400, 'validation_error', 'Invalid request', {
      issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  if (error instanceof HttpError) {
    return send(reply, error.statusCode, error.code, error.message);
  }
  if (error instanceof BusyError) {
    reply.header('Retry-After', '2');
    return send(reply, 503, 'busy', 'The server is busy. Try again in a moment.');
  }
  if (error instanceof GitError && error.isNotFound) {
    return send(reply, 404, 'not_found', 'No such revision or path in this repository');
  }
  if ((error instanceof GitError && error.timedOut) || timedOutRequests.has(request)) {
    request.log.warn({ args: error instanceof GitError ? error.args : undefined }, 'git timed out');
    return send(
      reply,
      504,
      'timeout',
      'git took too long to answer. Try a smaller folder or range.',
    );
  }
  if (error instanceof GitError && error.outputTooLarge) {
    return send(reply, 413, 'too_large', 'The result is too large to display.');
  }
  const status = (error as FastifyError).statusCode;
  if (status && status >= 400 && status < 500) {
    return send(reply, status, 'bad_request', error.message);
  }

  request.log.error({ err: error }, 'unhandled error');
  return send(reply, 500, 'internal_error', 'Something went wrong');
}
