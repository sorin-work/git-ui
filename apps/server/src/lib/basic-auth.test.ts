import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from '../../test/app.js';
import { tempDir } from '../../test/repo.js';
import { loadConfig, parseTrustProxy } from '../config.js';
import { LoginThrottle, parseBasicAuth } from './basic-auth.js';

const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

describe('basic auth', () => {
  let root: Awaited<ReturnType<typeof tempDir>>;
  let app: FastifyInstance;

  beforeAll(async () => {
    root = await tempDir();
    app = await testApp(root.dir, { AUTH_USERNAME: 'admin', AUTH_PASSWORD: 'correct horse' });
  });

  afterAll(async () => {
    await app.close();
    await root.cleanup();
  });

  it('asks for credentials', async () => {
    const res = await app.inject('/api/repos');
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toContain('Basic realm="git-ui"');
  });

  it('rejects wrong credentials and accepts the right ones', async () => {
    const wrong = await app.inject({
      url: '/api/repos',
      headers: { authorization: basic('admin', 'nope') },
    });
    expect(wrong.statusCode).toBe(401);
    const right = await app.inject({
      url: '/api/repos',
      headers: { authorization: basic('admin', 'correct horse') },
    });
    expect(right.statusCode).toBe(200);
  });

  it('keeps the health check open for container probes', async () => {
    expect((await app.inject('/api/health')).statusCode).toBe(200);
  });

  it('requires both settings together', () => {
    expect(() => loadConfig({ AUTH_USERNAME: 'admin' })).toThrow(/both AUTH_USERNAME/);
  });

  it('treats empty settings as no authentication', () => {
    expect(loadConfig({ AUTH_USERNAME: '', AUTH_PASSWORD: '' }).auth).toBeNull();
  });

  it('parses passwords that contain colons', () => {
    expect(parseBasicAuth(basic('a', 'b:c'))).toEqual({ user: 'a', password: 'b:c' });
    expect(parseBasicAuth('Bearer x')).toBeNull();
  });
});

describe('login throttling', () => {
  let root: Awaited<ReturnType<typeof tempDir>>;

  beforeAll(async () => {
    root = await tempDir();
  });

  afterAll(() => root.cleanup());

  const attempt = (app: FastifyInstance, password: string | null, extra: object = {}) =>
    app.inject({
      url: '/api/repos',
      headers: password === null ? {} : { authorization: basic('admin', password) },
      ...extra,
    });

  it('counts failures per address and resets after the window', () => {
    let now = 0;
    const throttle = new LoginThrottle(3, 1000, 100, () => now);
    for (let i = 0; i < 3; i++) throttle.fail('a');
    expect(throttle.retryAfter('a')).toBe(1);
    expect(throttle.retryAfter('b')).toBe(0);
    now = 1000;
    expect(throttle.retryAfter('a')).toBe(0);
    throttle.fail('a');
    throttle.succeed('a');
    expect(throttle.retryAfter('a')).toBe(0);
  });

  it('keeps a bounded number of addresses', () => {
    const throttle = new LoginThrottle(1, 60_000, 2);
    throttle.fail('a');
    throttle.fail('b');
    throttle.fail('c');
    expect(throttle.retryAfter('a')).toBe(0);
    expect(throttle.retryAfter('c')).toBeGreaterThan(0);
  });

  it('answers 429 after ten wrong passwords from one address, and only there', async () => {
    const app = await testApp(root.dir, { AUTH_USERNAME: 'admin', AUTH_PASSWORD: 'correct horse' });
    try {
      for (let i = 0; i < 10; i++) {
        expect((await attempt(app, 'wrong', { remoteAddress: '10.0.0.1' })).statusCode).toBe(401);
      }
      const locked = await attempt(app, 'correct horse', { remoteAddress: '10.0.0.1' });
      expect(locked.statusCode).toBe(429);
      expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
      expect((await attempt(app, 'correct horse', { remoteAddress: '10.0.0.2' })).statusCode).toBe(
        200,
      );
      expect((await app.inject({ url: '/api/health', remoteAddress: '10.0.0.1' })).statusCode).toBe(
        200,
      );
    } finally {
      await app.close();
    }
  });

  it('does not count requests that sent no credentials', async () => {
    const app = await testApp(root.dir, { AUTH_USERNAME: 'admin', AUTH_PASSWORD: 'correct horse' });
    try {
      for (let i = 0; i < 15; i++) expect((await attempt(app, null)).statusCode).toBe(401);
      expect((await attempt(app, 'correct horse')).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('tells clients behind a trusted proxy apart by X-Forwarded-For', async () => {
    const env = { AUTH_USERNAME: 'admin', AUTH_PASSWORD: 'correct horse' };
    const proxied = await testApp(root.dir, { ...env, TRUST_PROXY: '1' });
    const direct = await testApp(root.dir, env);
    try {
      for (const app of [proxied, direct]) {
        for (let i = 0; i < 10; i++) {
          await attempt(app, 'wrong', {
            headers: { authorization: basic('admin', 'wrong'), 'x-forwarded-for': '203.0.113.1' },
          });
        }
      }
      const other = {
        'x-forwarded-for': '203.0.113.2',
        authorization: basic('admin', 'correct horse'),
      };
      // Through the proxy the second client is someone else...
      expect((await proxied.inject({ url: '/api/repos', headers: other })).statusCode).toBe(200);
      // ...without it the header means nothing and everyone shares one address.
      expect((await direct.inject({ url: '/api/repos', headers: other })).statusCode).toBe(429);
    } finally {
      await proxied.close();
      await direct.close();
    }
  });

  it('reads TRUST_PROXY values', () => {
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('10.0.0.1, 10.0.0.2')).toBe('10.0.0.1, 10.0.0.2');
    const hops = parseTrustProxy('1') as (address: string, hop: number) => boolean;
    expect(hops('x', 0)).toBe(true);
    expect(hops('x', 1)).toBe(false);
  });

  it('sends nosniff on JSON and keeps logged-in answers out of shared caches', async () => {
    const app = await testApp(root.dir, { AUTH_USERNAME: 'admin', AUTH_PASSWORD: 'correct horse' });
    const open = await testApp(root.dir);
    try {
      const res = await attempt(app, 'correct horse');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toBe('private');
      const anonymous = await open.inject('/api/repos');
      expect(anonymous.headers['x-content-type-options']).toBe('nosniff');
      expect(anonymous.headers['cache-control']).toBeUndefined();
    } finally {
      await app.close();
      await open.close();
    }
  });
});
