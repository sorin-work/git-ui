import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestRepo, tempDir } from '../../test/repo.js';
import { listBranches, supportsAheadBehind } from './refs.js';
import type { RepoLocation } from './repos.js';

describe('listBranches', () => {
  let root: Awaited<ReturnType<typeof tempDir>>;
  let repo: RepoLocation;

  beforeAll(async () => {
    root = await tempDir();
    const test = await TestRepo.create(root.dir, 'demo');
    await test.commit('one', { 'a.txt': '1\n' });
    await test.checkout('feature', true);
    await test.commit('two', { 'a.txt': '2\n' });
    await test.commit('three', { 'a.txt': '3\n' });
    await test.checkout('main');
    await test.commit('four', { 'b.txt': '4\n' });
    repo = { name: 'demo', path: test.path, gitDir: `${test.path}/.git`, bare: false };
  });

  afterAll(() => root.cleanup());

  const counts = (branches: { name: string; ahead: number; behind: number }[]) =>
    Object.fromEntries(branches.map((b) => [b.name, [b.ahead, b.behind]]));

  it('counts ahead and behind with one process per branch', async () => {
    expect(counts(await listBranches(repo, 'main', { oneWalk: false }))).toEqual({
      main: [0, 0],
      feature: [2, 1],
    });
  });

  it('gets the same numbers from one for-each-ref walk on git 2.41 and later', async () => {
    if (!(await supportsAheadBehind())) return;
    expect(counts(await listBranches(repo, 'main', { oneWalk: true }))).toEqual({
      main: [0, 0],
      feature: [2, 1],
    });
  });
});
