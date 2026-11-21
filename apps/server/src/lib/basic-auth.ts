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

/**
 * Counts failed logins per client address, in memory. After `maxFailures`
 * within `windowMs` the address is refused without checking the password
 * until the window has passed. Only attempts that sent credentials count,
 * so a browser's first request (which has none) never does. The map is
 * bounded: past `maxClients` addresses the oldest is dropped.
 */
export class LoginThrottle {
  private readonly failures = new Map<string, { count: number; since: number }>();

  constructor(
    private readonly maxFailures = 10,
    private readonly windowMs = 5 * 60_000,
    private readonly maxClients = 5_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Seconds until `client` may try again, or 0 when it may now. */
  retryAfter(client: string): number {
    const entry = this.failures.get(client);
    if (!entry) return 0;
    const left = entry.since + this.windowMs - this.now();
    if (left <= 0) {
      this.failures.delete(client);
      return 0;
    }
    return entry.count >= this.maxFailures ? Math.ceil(left / 1000) : 0;
  }

  fail(client: string) {
    const entry = this.failures.get(client);
    if (entry && entry.since + this.windowMs > this.now()) {
      entry.count += 1;
      return;
    }
    this.failures.delete(client);
    this.failures.set(client, { count: 1, since: this.now() });
    if (this.failures.size > this.maxClients) {
      this.failures.delete(this.failures.keys().next().value as string);
    }
  }

  succeed(client: string) {
    this.failures.delete(client);
  }
}

/**
 * The key failed logins are counted under: the address itself for IPv4 and
 * its /64 for IPv6, since one machine usually has a whole /64 to pick
 * addresses from. IPv4 written as IPv6 (`::ffff:1.2.3.4`) counts as IPv4.
 */
export function clientKey(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return mapped[1]!;
  if (!address.includes(':')) return address;
  const plain = address.split('%')[0]!.toLowerCase();
  const [head = '', tail = ''] = plain.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = plain.includes('::')
    ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    : left;
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

/**
 * An onRequest hook that requires the configured user name and password.
 * `request.ip` is the client address; behind a proxy it is only right with
 * TRUST_PROXY set, or every client shares the proxy's address.
 */
export function basicAuth(user: string, password: string, throttle = new LoginThrottle()) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url === '/api/health') return;

    const client = clientKey(request.ip);
    const wait = throttle.retryAfter(client);
    if (wait > 0) {
      return reply
        .status(429)
        .header('Retry-After', String(wait))
        .send({ error: { code: 'too_many_attempts', message: 'Too many failed logins' } });
    }

    const sent = parseBasicAuth(request.headers.authorization);
    const credentials = sent ?? { user: '', password: '' };
    // Always run both comparisons so timing does not reveal which one failed.
    const userOk = safeEqual(credentials.user, user);
    const passwordOk = safeEqual(credentials.password, password);
    if (userOk && passwordOk) {
      throttle.succeed(client);
      return;
    }
    if (sent) throttle.fail(client);

    return reply
      .status(401)
      .header('WWW-Authenticate', 'Basic realm="git-ui", charset="UTF-8"')
      .send({ error: { code: 'unauthorized', message: 'Authentication required' } });
  };
}
