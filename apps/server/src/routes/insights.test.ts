import { symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
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

  it('leaves commits from long before the newest year out of the walk', async () => {
    const old = await TestRepo.create(root.dir, 'old');
    await old.commit('ancient', { a: '0' }, { date: '2019-01-07T10:00:00Z' });
    await old.commit('recent', { a: '1' }, { date: '2026-02-16T10:00:00Z' });
    const body = (await app.inject('/api/repos/old/insights')).json();
    expect(body.activity.reduce((n: number, w: { commits: number }) => n + w.commits, 0)).toBe(1);
    expect(body.contributors[0].commits).toBe(2);
  });

  it('applies .mailmap to history and contributors alike', async () => {
    const mapped = await TestRepo.create(root.dir, 'mapped');
    await mapped.commit('one', { a: '1' }, { author: 'apop', email: 'ana@example.com' });
    await mapped.commit('two', { '.mailmap': 'Ana Pop <ana@example.com>\n' });
    const people = (await app.inject('/api/repos/mapped/insights')).json().contributors;
    expect(people.map((p: { name: string }) => p.name)).toContain('Ana Pop');
    expect(people.map((p: { name: string }) => p.name)).not.toContain('apop');
    const history = (await app.inject('/api/repos/mapped/commits')).json().items;
    expect(history.at(-1).author.name).toBe('Ana Pop');
  });

  it('filters history by the mapped author name', async () => {
    const items = (await app.inject('/api/repos/mapped/commits?author=Ana%20Pop')).json().items;
    expect(items.map((c: { subject: string }) => c.subject)).toEqual(['one']);
  });

  it('never reads a .mailmap from the checkout, only from HEAD', async () => {
    const outside = await tempDir();
    try {
      await writeFile(path.join(outside.dir, 'map'), 'Someone Else <author@example.com>\n');
      const linked = await TestRepo.create(root.dir, 'linkmap');
      await linked.commit('one', { a: '1' });
      await symlink(path.join(outside.dir, 'map'), path.join(linked.path, '.mailmap'));
      const people = (await app.inject('/api/repos/linkmap/insights')).json().contributors;
      expect(people.map((p: { name: string }) => p.name)).toEqual(['Test Author']);
    } finally {
      await outside.cleanup();
    }
  });
});
