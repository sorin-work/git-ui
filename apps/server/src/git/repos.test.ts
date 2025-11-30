import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestRepo, tempDir } from '../../test/repo.js';
import { RepoRegistry } from './repos.js';
import { git } from './run.js';

describe('RepoRegistry', () => {
  let root: Awaited<ReturnType<typeof tempDir>>;
  let registry: RepoRegistry;

  beforeAll(async () => {
    root = await tempDir();
    await TestRepo.create(root.dir, 'website');
    await mkdir(path.join(root.dir, 'tools.git'));
    await git(path.join(root.dir, 'tools.git'), ['init', '--bare', '--quiet']);
    await mkdir(path.join(root.dir, 'not-a-repo'));
    await mkdir(path.join(root.dir, '.hidden'));
    await git(path.join(root.dir, '.hidden'), ['init', '--quiet']);
    await writeFile(path.join(root.dir, 'notes.txt'), 'not a directory');
    registry = new RepoRegistry(root.dir);
  });

  afterAll(() => root.cleanup());

  it('finds working-tree and bare repositories, sorted by name', async () => {
    expect(await registry.list()).toEqual([
      { name: 'tools', path: path.join(root.dir, 'tools.git'), bare: true },
      { name: 'website', path: path.join(root.dir, 'website'), bare: false },
    ]);
  });

  it('looks repositories up by name', async () => {
    expect((await registry.get('tools'))?.bare).toBe(true);
    expect(await registry.get('not-a-repo')).toBeNull();
    expect(await registry.get('.hidden')).toBeNull();
    expect(await registry.get('../website')).toBeNull();
  });

  it('returns an empty list when the directory is missing', async () => {
    expect(await new RepoRegistry(path.join(root.dir, 'missing')).list()).toEqual([]);
  });
});
