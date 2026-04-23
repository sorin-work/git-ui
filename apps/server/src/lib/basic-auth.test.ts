import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from '../../test/app.js';
import { tempDir } from '../../test/repo.js';
import { loadConfig } from '../config.js';
import { parseBasicAuth } from './basic-auth.js';

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
