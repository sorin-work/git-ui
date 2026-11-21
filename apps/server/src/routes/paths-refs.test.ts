import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from '../../test/app.js';
import { TestRepo, tempDir } from '../../test/repo.js';

describe('paths and refs that mean one thing', () => {
  let root: Awaited<ReturnType<typeof tempDir>>;
  let app: FastifyInstance;
  let first: string;
  let second: string;

  beforeAll(async () => {
    root = await tempDir();
    const repo = await TestRepo.create(root.dir, 'demo');
    first = await repo.commit('first', { 'README.md': 'hello\n', 'src/a.ts': 'hello\n' });
    second = await repo.commit('star', { '*.md': 'a file called star dot md\n' });
    // A branch and a tag with the same name, on different commits.
    await repo.run(['branch', 'v1', second]);
    await repo.run(['tag', 'v1', first]);
    // A branch whose name looks like the start of another commit's sha.
    await repo.run(['branch', first.slice(0, 8), second]);
    await repo.run(['update-ref', 'refs/stash', first]);
    app = await testApp(root.dir);
  });

  afterAll(async () => {
    await app.close();
    await root.cleanup();
  });

  const json = async (url: string) => {
    const res = await app.inject(url);
    expect(res.statusCode, url).toBe(200);
    return res.json();
  };

  it('treats paths literally, not as patterns or pathspec magic', async () => {
    const star = await json(`/api/repos/demo/commits?path=${encodeURIComponent('*.md')}`);
    expect(star.items.map((c: { subject: string }) => c.subject)).toEqual(['star']);

    const exclude = await json(
      `/api/repos/demo/commits?path=${encodeURIComponent(':(exclude)src')}`,
    );
    expect(exclude.items).toEqual([]);

    const search = await json(`/api/repos/demo/search?q=hello&path=${encodeURIComponent('*.ts')}`);
    expect(search.matches).toEqual([]);
    const inSrc = await json('/api/repos/demo/search?q=hello&path=src');
    expect(inSrc.matches).toHaveLength(1);
  });

  it('prefers the branch when a branch and a tag share a name', async () => {
    expect(await json('/api/repos/demo/tree?ref=v1')).toMatchObject({
      ref: 'v1',
      kind: 'branch',
      commit: second,
    });
    expect(await json('/api/repos/demo/tree?ref=refs/tags/v1')).toMatchObject({
      kind: 'tag',
      commit: first,
    });
  });

  it('prefers a branch over a commit whose sha starts with its name', async () => {
    expect(await json(`/api/repos/demo/tree?ref=${first.slice(0, 8)}`)).toMatchObject({
      kind: 'branch',
      commit: second,
    });
    expect(await json(`/api/repos/demo/tree?ref=${first.slice(0, 7)}`)).toMatchObject({
      kind: 'commit',
      commit: first,
    });
    expect(await json(`/api/repos/demo/tree?ref=${first}`)).toMatchObject({
      kind: 'commit',
      commit: first,
    });
  });

  it('refuses refs outside branches and tags', async () => {
    for (const ref of ['refs/stash', 'stash', '@', 'heads/main', 'refs/remotes/origin/main']) {
      const res = await app.inject(`/api/repos/demo/tree?ref=${encodeURIComponent(ref)}`);
      expect(res.statusCode, ref).toBe(404);
    }
  });
});
