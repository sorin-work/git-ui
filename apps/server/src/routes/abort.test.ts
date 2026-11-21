import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { testApp } from '../../test/app.js';
import { git } from '../git/run.js';
import { cached } from '../lib/cache.js';
import { requestContext } from '../lib/request-context.js';

describe('git calls of a failed request', () => {
  it('are stopped when a sibling call fails', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'git-ui-abort-'));
    const app = await testApp(dir);
    let slow: Promise<unknown> | undefined;
    // A page that runs two git calls at once, one of which fails.
    app.get('/api/test/siblings', async () => {
      await git(dir, ['init', '--quiet']);
      slow = git(dir, ['hash-object', '--stdin'], { timeoutMs: 10_000 });
      await Promise.all([slow, Promise.reject(new Error('boom'))]);
    });
    try {
      const started = Date.now();
      expect((await app.inject('/api/test/siblings')).statusCode).toBe(500);
      await expect(slow).rejects.toThrow();
      // Killed with the request, long before its own 10 second timeout.
      expect(Date.now() - started).toBeLessThan(5_000);
    } finally {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('do not stop a cached load that another request is waiting for', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'git-ui-shared-'));
    await git(dir, ['init', '--quiet']);
    const load = () => git(dir, ['hash-object', '--stdin'], { timeoutMs: 400 });
    const first = new AbortController();
    const second = new AbortController();
    try {
      const a = requestContext.run({ signal: first.signal }, () => cached(['shared', dir], load));
      const b = requestContext.run({ signal: second.signal }, () => cached(['shared', dir], load));
      a.catch(() => {});
      setTimeout(() => first.abort(), 50);
      // The load ran outside the first request, so it ends with its own
      // timeout, not with the first client's abort.
      const error = await b.catch((e) => e);
      expect(error.timedOut).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
