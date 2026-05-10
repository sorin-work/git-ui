import { inflateSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tempDir } from '../../test/repo.js';
import { listTags } from '../git/refs.js';
import { RepoRegistry } from '../git/repos.js';
import { git, gitBuffer } from '../git/run.js';
import { createDemoRepos } from './demo-repos.js';

describe('createDemoRepos', () => {
  let root: Awaited<ReturnType<typeof tempDir>>;
  let registry: RepoRegistry;

  beforeAll(async () => {
    root = await tempDir();
    await createDemoRepos(root.dir);
    registry = new RepoRegistry(root.dir);
  }, 60_000);

  afterAll(() => root.cleanup());

  it('creates three repositories, one of them bare', async () => {
    const repos = await registry.list();
    expect(repos.map((r) => [r.name, r.bare])).toEqual([
      ['aurora-notes', false],
      ['dotfiles', false],
      ['pixel-weather', true],
    ]);
  });

  it('gives aurora-notes branches, merges, tags and a rename', async () => {
    const repo = (await registry.get('aurora-notes'))!;
    const branches = await git(repo.path, ['branch', '--format=%(refname:short)']);
    expect(branches.split('\n').filter(Boolean).sort()).toEqual([
      'experiment/sqlite',
      'feature/tags',
      'fix/accent-search',
      'main',
    ]);

    const merges = await git(repo.path, ['log', '--merges', '--format=%s', 'main']);
    expect(merges.trim()).toBe("Merge branch 'feature/tags'");

    const tags = await listTags(repo);
    expect(tags.map((t) => t.name)).toEqual(['v1.1.0', 'v1.0.0', 'v0.2.0', 'v0.1.0']);

    const renames = await git(repo.path, ['log', '--format=', '--name-status', '-M', 'main']);
    expect(renames).toMatch(/R\d+\tsrc\/store\.ts\tsrc\/storage\/file-store\.ts/);
  });

  it('uses fixed dates and authors so the history is the same every time', async () => {
    const repo = (await registry.get('aurora-notes'))!;
    const first = await git(repo.path, ['log', '--reverse', '--format=%an %aI', 'main']);
    expect(first.split('\n')[0]).toBe('Maya Chen 2025-01-06T09:12:00+01:00');
  });
});

describe('demo screenshot', () => {
  it('is a valid PNG', async () => {
    const root = await tempDir();
    try {
      await createDemoRepos(root.dir);
      const repo = (await new RepoRegistry(root.dir).get('aurora-notes'))!;
      const bytes = await gitBuffer(repo.path, ['cat-file', 'blob', 'main:docs/screenshot.png']);
      // Signature, then an IHDR chunk with the image size.
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(bytes.readUInt32BE(16)).toBe(320);
      expect(bytes.readUInt32BE(20)).toBe(160);
      // The image data must inflate; the broken one did not.
      const idat = bytes.indexOf('IDAT');
      const length = bytes.readUInt32BE(idat - 4);
      expect(() => inflateSync(bytes.subarray(idat + 4, idat + 4 + length))).not.toThrow();
    } finally {
      await root.cleanup();
    }
  }, 60_000);
});
