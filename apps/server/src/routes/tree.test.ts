import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from '../../test/app.js';
import { TestRepo, tempDir } from '../../test/repo.js';

describe('tree route', () => {
  let root: Awaited<ReturnType<typeof tempDir>>;
  let app: FastifyInstance;
  let first: string;

  beforeAll(async () => {
    root = await tempDir();
    const repo = await TestRepo.create(root.dir, 'demo');
    first = await repo.commit('Initial commit', { 'README.md': '# Demo\n' });
    await repo.commit('Add sources', {
      'src/index.ts': 'export {};\n',
      'src/util/strings.ts': 'export const a = 1;\n',
      'package.json': '{}\n',
      'docs/guide.md': 'Guide\n',
      'file10.txt': '10',
      'file2.txt': '2',
    });
    app = await testApp(root.dir);
  });

  afterAll(async () => {
    await app.close();
    await root.cleanup();
  });

  it('lists the root of the default branch, folders first', async () => {
    const res = await app.inject('/api/repos/demo/tree');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ref).toBe('main');
    expect(body.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(body.entries.map((e: { name: string }) => e.name)).toEqual([
      'docs',
      'src',
      'file2.txt',
      'file10.txt',
      'package.json',
      'README.md',
    ]);
    expect(body.entries.find((e: { name: string }) => e.name === 'README.md')).toMatchObject({
      type: 'blob',
      path: 'README.md',
      mode: '100644',
      size: 7,
    });
    expect(body.entries[0]).toMatchObject({ type: 'tree', size: null });
  });

  it('lists a subdirectory with full paths', async () => {
    const res = await app.inject('/api/repos/demo/tree?path=src/');
    expect(res.json().entries.map((e: { path: string }) => e.path)).toEqual([
      'src/util',
      'src/index.ts',
    ]);
  });

  it('lists the tree at an older commit', async () => {
    const res = await app.inject(`/api/repos/demo/tree?ref=${first}`);
    expect(res.json().entries.map((e: { name: string }) => e.name)).toEqual(['README.md']);
  });

  it('keeps unusual file names intact', async () => {
    const repo = await TestRepo.create(root.dir, 'names');
    await repo.commit('Odd names', {
      'café.md': 'é',
      'My Notes.txt': 'spaces',
      '"quoted".txt': 'quotes',
      'tab\there.txt': 'tab',
      '日本語/ファイル.txt': 'cjk',
    });
    const res = await app.inject('/api/repos/names/tree');
    expect(res.json().entries.map((e: { name: string }) => e.name)).toEqual([
      '日本語',
      '"quoted".txt',
      'café.md',
      'My Notes.txt',
      'tab\there.txt',
    ]);

    const nested = await app.inject(`/api/repos/names/tree?path=${encodeURIComponent('日本語')}`);
    expect(nested.json().entries[0].path).toBe('日本語/ファイル.txt');
  });

  it('lists every file for the finder', async () => {
    const res = await app.inject('/api/repos/demo/files');
    expect(res.json()).toMatchObject({
      truncated: false,
      files: [
        'README.md',
        'docs/guide.md',
        'file10.txt',
        'file2.txt',
        'package.json',
        'src/index.ts',
        'src/util/strings.ts',
      ],
    });
  });

  it('rejects files, missing paths and unknown refs', async () => {
    expect((await app.inject('/api/repos/demo/tree?path=README.md')).statusCode).toBe(400);
    expect((await app.inject('/api/repos/demo/tree?path=nope')).statusCode).toBe(404);
    expect((await app.inject('/api/repos/demo/tree?ref=does-not-exist')).statusCode).toBe(404);
  });

  it('rejects refs and paths that could be abused', async () => {
    for (const query of ['ref=--output=x', 'ref=a..b', 'path=../..', 'path=src/../../etc']) {
      const res = await app.inject(`/api/repos/demo/tree?${query}`);
      expect(res.statusCode).toBe(400);
    }
  });
});
