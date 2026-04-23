import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Compares in constant time so the response time doesn't leak how close a guess was. */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

export function parseBasicAuth(
  header: string | undefined,
): { user: string; password: string } | null {
  if (!header?.startsWith('Basic ')) return null;
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon === -1) return null;
  return { user: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
}

/** An onRequest hook that requires the configured user name and password. */
export function basicAuth(user: string, password: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url === '/api/health') return;

    const credentials = parseBasicAuth(request.headers.authorization) ?? {
      user: '',
      password: '',
    };
    // Always run both comparisons so timing does not reveal which one failed.
    const userOk = safeEqual(credentials.user, user);
    const passwordOk = safeEqual(credentials.password, password);
    if (userOk && passwordOk) return;

    return reply
      .status(401)
      .header('WWW-Authenticate', 'Basic realm="git-ui", charset="UTF-8"')
      .send({ error: { code: 'unauthorized', message: 'Authentication required' } });
  };
}
