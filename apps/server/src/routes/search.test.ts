import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from '../../test/app.js';
import { TestRepo, tempDir } from '../../test/repo.js';

describe('search route', () => {
  let root: Awaited<ReturnType<typeof tempDir>>;
  let app: FastifyInstance;
  let first: string;

  beforeAll(async () => {
    root = await tempDir();
    const repo = await TestRepo.create(root.dir, 'demo');
    first = await repo.commit('Initial commit', { 'src/a.ts': 'const total = 1;\n' });
    await repo.commit('More code', {
      'src/b.ts': 'export function Total() {}\nlet subtotal = 0;\n',
      'docs/notes.md': 'The total is shown at the bottom.\n',
      'img.bin': Buffer.from([0, 1, 2, ...Buffer.from('total')]),
      'regex.txt': 'a.*b\n',
    });
    app = await testApp(root.dir);
  });

  afterAll(async () => {
    await app.close();
    await root.cleanup();
  });

  it('finds matching lines, case-insensitively, skipping binary files', async () => {
    const res = await app.inject('/api/repos/demo/search?q=total');
    expect(res.statusCode).toBe(200);
    expect(res.json().matches).toEqual([
      { path: 'docs/notes.md', line: 1, text: 'The total is shown at the bottom.' },
      { path: 'src/a.ts', line: 1, text: 'const total = 1;' },
      { path: 'src/b.ts', line: 1, text: 'export function Total() {}' },
      { path: 'src/b.ts', line: 2, text: 'let subtotal = 0;' },
    ]);
  });

  it('supports case-sensitive search and a path filter', async () => {
    const exact = (await app.inject('/api/repos/demo/search?q=Total&case=1')).json();
    expect(exact.matches.map((m: { path: string }) => m.path)).toEqual(['src/b.ts']);
    const inDocs = (await app.inject('/api/repos/demo/search?q=total&path=docs')).json();
    expect(inDocs.matches).toHaveLength(1);
  });

  it('treats the query as plain text', async () => {
    const res = (await app.inject(`/api/repos/demo/search?q=${encodeURIComponent('a.*b')}`)).json();
    expect(res.matches).toEqual([{ path: 'regex.txt', line: 1, text: 'a.*b' }]);
  });

  it('searches an older commit and handles no matches', async () => {
    const old = (await app.inject(`/api/repos/demo/search?q=subtotal&ref=${first}`)).json();
    expect(old).toMatchObject({ matches: [], truncated: false });
  });

  it('requires a query of at least two characters', async () => {
    expect((await app.inject('/api/repos/demo/search?q=a')).statusCode).toBe(400);
  });

  it('cannot be tricked into running options', async () => {
    const res = await app.inject(
      `/api/repos/demo/search?q=${encodeURIComponent('--open-files-in-pager=id')}`,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().matches).toEqual([]);
  });
});
