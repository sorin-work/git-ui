import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from '../../test/app.js';
import { TestRepo, tempDir } from '../../test/repo.js';

describe('branches and tags', () => {
  let root: Awaited<ReturnType<typeof tempDir>>;
  let app: FastifyInstance;
  let base: string;

  beforeAll(async () => {
    root = await tempDir();
    const repo = await TestRepo.create(root.dir, 'demo');
    base = await repo.commit('Initial commit', { a: '1' }, { date: '2025-12-01T10:00:00Z' });
    await repo.tag('v0.1.0');

    await repo.checkout('feature/search', true);
    await repo.commit('Add search', { b: '1' }, { date: '2025-12-02T10:00:00Z' });
    await repo.commit('Search tweaks', { b: '2' }, { date: '2025-12-03T10:00:00Z' });

    await repo.checkout('main');
    await repo.commit('Fix typo', { a: '2' }, { date: '2025-12-04T10:00:00Z', author: 'Ivy Lee' });
    await repo.tag('v0.2.0', 'Second preview\n\nWith a typo fixed.');
    app = await testApp(root.dir);
  });

  afterAll(async () => {
    await app.close();
    await root.cleanup();
  });

  it('lists branches, most recently updated first, with ahead/behind counts', async () => {
    const res = await app.inject('/api/repos/demo/branches');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.defaultBranch).toBe('main');
    expect(body.branches).toEqual([
      expect.objectContaining({
        name: 'main',
        isDefault: true,
        ahead: 0,
        behind: 0,
        subject: 'Fix typo',
        author: 'Ivy Lee',
      }),
      expect.objectContaining({
        name: 'feature/search',
        isDefault: false,
        ahead: 2,
        behind: 1,
        subject: 'Search tweaks',
      }),
    ]);
  });

  it('lists lightweight and annotated tags with the commit they point to', async () => {
    const { tags } = (await app.inject('/api/repos/demo/tags')).json();
    expect(tags.map((t: { name: string }) => t.name)).toEqual(['v0.2.0', 'v0.1.0']);
    expect(tags[0]).toMatchObject({ annotated: true, subject: 'Second preview' });
    expect(tags[0].sha).toMatch(/^[0-9a-f]{40}$/);
    expect(tags[1]).toMatchObject({ annotated: false, sha: base, subject: 'Initial commit' });
  });
});
