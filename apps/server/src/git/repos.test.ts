import { mkdir, realpath, symlink, writeFile } from 'node:fs/promises';
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
    const base = await realpath(root.dir);
    expect(await registry.list()).toEqual([
      { name: 'tools', path: path.join(base, 'tools.git'), bare: true },
      { name: 'website', path: path.join(base, 'website'), bare: false },
    ]);
  });

  it('looks repositories up by name', async () => {
    expect((await registry.get('tools'))?.bare).toBe(true);
    expect(await registry.get('not-a-repo')).toBeNull();
    expect(await registry.get('.hidden')).toBeNull();
    expect(await registry.get('../website')).toBeNull();
  });

  it('follows symlinks inside the repositories directory, but not out of it', async () => {
    const outside = await tempDir();
    try {
      await TestRepo.create(outside.dir, 'private');
      const linked = await tempDir();
      try {
        await TestRepo.create(linked.dir, 'website');
        await symlink(path.join(linked.dir, 'website'), path.join(linked.dir, 'site'));
        await symlink(path.join(outside.dir, 'private'), path.join(linked.dir, 'private'));
        await symlink(path.join(linked.dir, 'gone'), path.join(linked.dir, 'dangling'));

        const base = await realpath(linked.dir);
        expect(await new RepoRegistry(linked.dir).list()).toEqual([
          { name: 'site', path: path.join(base, 'site'), bare: false },
          { name: 'website', path: path.join(base, 'website'), bare: false },
        ]);
        expect(await new RepoRegistry(linked.dir).get('private')).toBeNull();
      } finally {
        await linked.cleanup();
      }
    } finally {
      await outside.cleanup();
    }
  });

  it('returns an empty list when the directory is missing', async () => {
    expect(await new RepoRegistry(path.join(root.dir, 'missing')).list()).toEqual([]);
  });
});
