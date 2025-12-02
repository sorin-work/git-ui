import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from '../../test/app.js';
import { TestRepo, tempDir } from '../../test/repo.js';

describe('repository routes', () => {
  let root: Awaited<ReturnType<typeof tempDir>>;
  let app: FastifyInstance;
  let head: string;

  beforeAll(async () => {
    root = await tempDir();
    const website = await TestRepo.create(root.dir, 'website');
    await website.commit('Initial commit', { 'README.md': '# Website\n' });
    head = await website.commit(
      'Add about page',
      { 'about.html': '<h1>About</h1>' },
      {
        author: 'Maya Chen',
        date: '2025-11-20T10:00:00Z',
      },
    );
    await website.checkout('feature/dark-mode', true);
    await website.checkout('main');
    await website.tag('v1.0.0');
    await writeFile(path.join(website.path, '.git', 'description'), 'Marketing site\n');

    await TestRepo.create(root.dir, 'empty');
    app = await testApp(root.dir);
  });

  afterAll(async () => {
    await app.close();
    await root.cleanup();
  });

  it('lists repositories with their latest commit', async () => {
    const res = await app.inject('/api/repos');
    expect(res.statusCode).toBe(200);
    expect(res.json().repos).toEqual([
      {
        name: 'empty',
        description: null,
        bare: false,
        defaultBranch: 'main',
        lastCommit: null,
      },
      {
        name: 'website',
        description: 'Marketing site',
        bare: false,
        defaultBranch: 'main',
        lastCommit: {
          sha: head,
          subject: 'Add about page',
          author: 'Maya Chen',
          date: '2025-11-20T10:00:00+00:00',
        },
      },
    ]);
  });

  it('returns one repository with branch and tag counts', async () => {
    const res = await app.inject('/api/repos/website');
    expect(res.statusCode).toBe(200);
    expect(res.json().repo).toMatchObject({ name: 'website', branches: 2, tags: 1 });
  });

  it('returns 404 for unknown repositories and unsafe names', async () => {
    for (const name of ['nope', '..', '.git']) {
      const res = await app.inject(`/api/repos/${encodeURIComponent(name)}`);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('not_found');
    }
  });

  it('returns JSON for unknown routes', async () => {
    const res = await app.inject('/api/nope');
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });
});
