import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from '../../test/app.js';
import { TestRepo, tempDir } from '../../test/repo.js';

describe('insights route', () => {
  let root: Awaited<ReturnType<typeof tempDir>>;
  let app: FastifyInstance;

  beforeAll(async () => {
    root = await tempDir();
    const repo = await TestRepo.create(root.dir, 'demo');
    const ana = { author: 'Ana Pop', email: 'ana@example.com' };
    await repo.commit('one', { a: '1' }, { ...ana, date: '2026-02-02T10:00:00Z' });
    await repo.commit('two', { a: '2' }, { ...ana, date: '2026-02-03T10:00:00Z' });
    await repo.commit(
      'three',
      { a: '3' },
      {
        author: 'Ben Ode',
        email: 'ben@example.com',
        date: '2026-02-16T10:00:00Z',
      },
    );
    app = await testApp(root.dir);
  });

  afterAll(async () => {
    await app.close();
    await root.cleanup();
  });

  it('reports languages by size', async () => {
    const res = await app.inject('/api/repos/demo/languages');
    expect(res.statusCode).toBe(200);
    expect(res.json().languages).toEqual([]);
  });

  it('returns contributors and a year of weekly activity ending at the newest commit', async () => {
    const res = await app.inject('/api/repos/demo/insights');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.contributors).toEqual([
      { name: 'Ana Pop', email: 'ana@example.com', commits: 2 },
      { name: 'Ben Ode', email: 'ben@example.com', commits: 1 },
    ]);
    expect(body.activity).toHaveLength(52);
    expect(body.activity.slice(-3)).toEqual([
      { start: '2026-02-02', commits: 2 },
      { start: '2026-02-09', commits: 0 },
      { start: '2026-02-16', commits: 1 },
    ]);
  });
});
