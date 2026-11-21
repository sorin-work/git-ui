import { mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestRepo, tempDir } from '../../test/repo.js';
import { contributors } from './insights.js';
import { RepoRegistry, type SkippedRepo } from './repos.js';
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
      {
        name: 'tools',
        path: path.join(base, 'tools.git'),
        gitDir: path.join(base, 'tools.git'),
        bare: true,
      },
      {
        name: 'website',
        path: path.join(base, 'website'),
        gitDir: path.join(base, 'website', '.git'),
        bare: false,
      },
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
          {
            name: 'site',
            path: path.join(base, 'site'),
            gitDir: path.join(base, 'website', '.git'),
            bare: false,
          },
          {
            name: 'website',
            path: path.join(base, 'website'),
            gitDir: path.join(base, 'website', '.git'),
            bare: false,
          },
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

describe('RepoRegistry and git data outside REPOS_DIR', () => {
  let outside: Awaited<ReturnType<typeof tempDir>>;
  let root: Awaited<ReturnType<typeof tempDir>>;
  let secret: TestRepo;
  let skipped: SkippedRepo[];
  let names: string[];

  beforeAll(async () => {
    outside = await tempDir();
    secret = await TestRepo.create(outside.dir, 'secret');
    await secret.commit('secret', { 'key.txt': 'do not publish\n' });

    root = await tempDir();
    const dir = root.dir;

    // A .git file that points at a repository elsewhere.
    await mkdir(path.join(dir, 'gitfile'));
    await writeFile(path.join(dir, 'gitfile', '.git'), `gitdir: ${secret.path}/.git\n`);

    // A linked worktree whose main repository is also served: fine.
    const main = await TestRepo.create(dir, 'main');
    await main.commit('on main', { 'a.txt': 'a\n' });
    await main.run(['worktree', 'add', '--quiet', path.join(dir, 'linked'), '-b', 'side']);

    // A worktree git directory inside, whose commondir points outside.
    const common = await TestRepo.create(dir, 'common');
    await common.commit('c', { 'c.txt': 'c\n' });
    await common.run(['worktree', 'add', '--quiet', path.join(dir, 'common-wt'), '-b', 'wt']);
    const wtGitDir = (await readFile(path.join(dir, 'common-wt', '.git'), 'utf8'))
      .replace('gitdir: ', '')
      .trim();
    await writeFile(path.join(wtGitDir, 'commondir'), `${secret.path}/.git\n`);

    // Alternates outside and inside.
    const borrower = await TestRepo.create(dir, 'borrower');
    await borrower.commit('b', { 'b.txt': 'b\n' });
    await mkdir(path.join(borrower.path, '.git/objects/info'), { recursive: true });
    await writeFile(
      path.join(borrower.path, '.git/objects/info/alternates'),
      `${secret.path}/.git/objects\n`,
    );
    const sharer = await TestRepo.create(dir, 'sharer');
    await sharer.commit('s', { 's.txt': 's\n' });
    await mkdir(path.join(sharer.path, '.git/objects/info'), { recursive: true });
    await writeFile(
      path.join(sharer.path, '.git/objects/info/alternates'),
      '../../../main/.git/objects\n',
    );

    // A bare repository whose objects folder is a link to another repository's.
    await mkdir(path.join(dir, 'linked-objects.git'));
    await git(path.join(dir, 'linked-objects.git'), ['init', '--bare', '--quiet']);
    await rm(path.join(dir, 'linked-objects.git', 'objects'), { recursive: true });
    await symlink(
      path.join(secret.path, '.git', 'objects'),
      path.join(dir, 'linked-objects.git', 'objects'),
    );

    skipped = [];
    const registry = new RepoRegistry(dir, (s) => skipped.push(s));
    names = (await registry.list()).map((r) => r.name);
    await registry.list();
  });

  afterAll(async () => {
    await root.cleanup();
    await outside.cleanup();
  });

  it('serves worktrees and alternates that stay inside', () => {
    expect(names).toEqual(['common', 'linked', 'main', 'sharer']);
  });

  it('leaves out repositories that read git data from elsewhere, and says why once', () => {
    const reasons = Object.fromEntries(skipped.map((s) => [path.basename(s.dir), s.reason]));
    expect(reasons).toEqual({
      gitfile: 'its git directory is outside REPOS_DIR',
      'common-wt': 'its commondir is outside REPOS_DIR',
      borrower: 'objects/info/alternates points outside REPOS_DIR',
      'linked-objects.git': 'objects is a link out of REPOS_DIR',
    });
    expect(skipped).toHaveLength(4);
  });

  it('runs git against the checked git directory', async () => {
    const registry = new RepoRegistry(root.dir);
    const linked = (await registry.get('linked'))!;
    expect((await git(linked, ['log', '-1', '--format=%s', 'side', '--'])).trim()).toBe('on main');
  });

  it('does not fall back to a repository further up when one disappears', async () => {
    const outer = await tempDir();
    try {
      const parent = await TestRepo.create(outer.dir, 'parent');
      await parent.commit('the outer repository', {});
      const inner = await TestRepo.create(parent.path, 'inner');
      await inner.commit('inner', {});
      const location = (await new RepoRegistry(parent.path).get('inner'))!;
      await rm(path.join(inner.path, '.git'), { recursive: true });
      await expect(git(location, ['log', '-1', '--format=%s'])).rejects.toThrow();
    } finally {
      await outer.cleanup();
    }
  });

  it('ignores a core.worktree that points elsewhere', async () => {
    const elsewhere = await tempDir();
    try {
      await writeFile(path.join(elsewhere.dir, '.mailmap'), 'Someone Else <author@example.com>\n');
      const main = (await new RepoRegistry(root.dir).get('main'))!;
      await git(main, ['config', 'core.worktree', elsewhere.dir]);
      const people = await contributors(main, 'HEAD');
      expect(people[0]?.name).toBe('Test Author');
      await git(main, ['config', '--unset', 'core.worktree']);
    } finally {
      await elsewhere.cleanup();
    }
  });

  it('still reads .mailmap from HEAD in bare repositories', async () => {
    const work = await TestRepo.create(outside.dir, 'mapped');
    await work.commit('m', { '.mailmap': 'Mapped Name <author@example.com>\n' });
    await git(root.dir, ['clone', '--quiet', '--bare', work.path, 'mapped.git']);
    const bare = (await new RepoRegistry(root.dir).get('mapped'))!;
    expect(bare.bare).toBe(true);
    expect((await contributors(bare, 'HEAD'))[0]?.name).toBe('Mapped Name');
  });
});
