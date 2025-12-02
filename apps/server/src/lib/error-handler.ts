import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { GitError } from '../git/run.js';
import { HttpError } from './errors.js';

function send(reply: FastifyReply, status: number, code: string, message: string, extra = {}) {
  return reply.status(status).send({ error: { code, message, ...extra } });
}

/** Turns every error into `{ error: { code, message } }` with a sensible status. */
export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof ZodError) {
    return send(reply, 400, 'validation_error', 'Invalid request', {
      issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  if (error instanceof HttpError) {
    return send(reply, error.statusCode, error.code, error.message);
  }
  if (error instanceof GitError && error.isNotFound) {
    return send(reply, 404, 'not_found', 'No such revision or path in this repository');
  }
  const status = (error as FastifyError).statusCode;
  if (status && status >= 400 && status < 500) {
    return send(reply, status, 'bad_request', error.message);
  }

  request.log.error({ err: error }, 'unhandled error');
  return send(reply, 500, 'internal_error', 'Something went wrong');
}
