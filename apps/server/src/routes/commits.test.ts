import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from '../../test/app.js';
import { TestRepo, tempDir } from '../../test/repo.js';

describe('commits route', () => {
  let root: Awaited<ReturnType<typeof tempDir>>;
  let app: FastifyInstance;
  const shas: string[] = [];

  beforeAll(async () => {
    root = await tempDir();
    const repo = await TestRepo.create(root.dir, 'demo');
    shas.push(await repo.commit('Initial commit', { 'README.md': 'v1' }, { author: 'Ana Pop' }));
    shas.push(await repo.commit('Add parser', { 'src/parser.ts': 'a' }, { author: 'Ben Ode' }));
    shas.push(
      await repo.commit('Fix parser crash', { 'src/parser.ts': 'b' }, { author: 'Ana Pop' }),
    );
    shas.push(await repo.commit('Update readme', { 'README.md': 'v2' }, { author: 'Ben Ode' }));
    shas.push(
      await repo.commit(
        'Tidy up',
        { 'src/parser.ts': 'c' },
        {
          author: 'Cleo Ray',
          email: 'cleo@example.org',
          date: '2025-12-01T08:30:00Z',
        },
      ),
    );
    app = await testApp(root.dir);
  });

  afterAll(async () => {
    await app.close();
    await root.cleanup();
  });

  it('lists commits newest first with authors and parents', async () => {
    const res = await app.inject('/api/repos/demo/commits');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.map((c: { subject: string }) => c.subject)).toEqual([
      'Tidy up',
      'Update readme',
      'Fix parser crash',
      'Add parser',
      'Initial commit',
    ]);
    expect(body.items[0]).toMatchObject({
      sha: shas[4],
      shortSha: shas[4]!.slice(0, 7),
      parents: [shas[3]],
      author: { name: 'Cleo Ray', email: 'cleo@example.org', date: '2025-12-01T08:30:00+00:00' },
    });
    expect(body.items[4].parents).toEqual([]);
    expect(body.hasMore).toBe(false);
  });

  it('keeps subjects with separators and unicode intact', async () => {
    const repo = await TestRepo.create(root.dir, 'odd');
    await repo.commit('feat: a | b | c — “quoted” 🚀', { a: '1' }, { author: 'Zoë | Admin' });
    const res = await app.inject('/api/repos/odd/commits');
    expect(res.json().items[0]).toMatchObject({
      subject: 'feat: a | b | c — “quoted” 🚀',
      author: { name: 'Zoë | Admin' },
    });
  });

  it('paginates', async () => {
    const page1 = (await app.inject('/api/repos/demo/commits?pageSize=2')).json();
    const page3 = (await app.inject('/api/repos/demo/commits?pageSize=2&page=3')).json();
    expect(page1.items).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    expect(page3.items.map((c: { sha: string }) => c.sha)).toEqual([shas[0]]);
    expect(page3.hasMore).toBe(false);
  });

  it('filters by path, author and message', async () => {
    const byPath = (await app.inject('/api/repos/demo/commits?path=src/parser.ts')).json();
    expect(byPath.items).toHaveLength(3);

    const byAuthor = (await app.inject('/api/repos/demo/commits?author=ana')).json();
    expect(byAuthor.items.map((c: { subject: string }) => c.subject)).toEqual([
      'Fix parser crash',
      'Initial commit',
    ]);

    const byMessage = (await app.inject('/api/repos/demo/commits?q=PARSER')).json();
    expect(byMessage.items).toHaveLength(2);
  });

  it('treats search text literally', async () => {
    const res = await app.inject(`/api/repos/demo/commits?q=${encodeURIComponent('.*')}`);
    expect(res.json().items).toEqual([]);
  });

  it('starts from the given ref', async () => {
    const res = await app.inject(`/api/repos/demo/commits?ref=${shas[1]}`);
    expect(res.json().items).toHaveLength(2);
  });

  it('validates paging', async () => {
    expect((await app.inject('/api/repos/demo/commits?pageSize=500')).statusCode).toBe(400);
    expect((await app.inject('/api/repos/demo/commits?page=0')).statusCode).toBe(400);
  });
});
