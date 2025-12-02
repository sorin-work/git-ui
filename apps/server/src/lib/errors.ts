/** An error that maps directly to an HTTP response. */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, message: string, code = 'error') {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const badRequest = (message: string) => new HttpError(400, message, 'bad_request');

export const notFound = (what: string) => new HttpError(404, `${what} not found`, 'not_found');
