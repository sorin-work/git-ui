import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from '../../test/app.js';
import { TestRepo, tempDir } from '../../test/repo.js';

describe('compare route', () => {
  let root: Awaited<ReturnType<typeof tempDir>>;
  let app: FastifyInstance;

  beforeAll(async () => {
    root = await tempDir();
    const repo = await TestRepo.create(root.dir, 'demo');
    await repo.commit('Initial commit', { 'app.txt': 'one\n', 'shared.txt': 'base\n' });
    await repo.checkout('feature/login', true);
    await repo.commit('Add login form', { 'login.html': '<form></form>\n' });
    await repo.commit('Validate passwords', { 'app.txt': 'one\ntwo\n' });
    await repo.checkout('main');
    await repo.commit('Unrelated change on main', { 'shared.txt': 'changed on main\n' });
    app = await testApp(root.dir);
  });

  afterAll(async () => {
    await app.close();
    await root.cleanup();
  });

  it('lists the commits and changes a branch adds', async () => {
    const res = await app.inject('/api/repos/demo/compare?base=main&head=feature/login');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.base.ref).toBe('main');
    expect(body.head.ref).toBe('feature/login');
    expect(body).toMatchObject({ aheadBy: 2, behindBy: 1, truncated: false });
    expect(body.commits.map((c: { subject: string }) => c.subject)).toEqual([
      'Add login form',
      'Validate passwords',
    ]);
    // shared.txt changed on main after the branch split, so it is not part of the diff.
    expect(body.files.map((f: { path: string }) => f.path).sort()).toEqual([
      'app.txt',
      'login.html',
    ]);
    expect(body.stats).toEqual({ files: 2, additions: 2, deletions: 0 });
  });

  it('is empty when comparing a ref with itself', async () => {
    const body = (await app.inject('/api/repos/demo/compare?base=main&head=main')).json();
    expect(body).toMatchObject({ aheadBy: 0, behindBy: 0, commits: [], files: [] });
  });

  it('requires both refs and rejects unknown ones', async () => {
    expect((await app.inject('/api/repos/demo/compare?base=main')).statusCode).toBe(400);
    expect((await app.inject('/api/repos/demo/compare?base=main&head=nope')).statusCode).toBe(404);
  });
});
