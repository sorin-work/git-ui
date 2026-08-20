import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from '../../test/app.js';
import { TestRepo, tempDir } from '../../test/repo.js';

describe('single commit route', () => {
  let root: Awaited<ReturnType<typeof tempDir>>;
  let app: FastifyInstance;
  let first: string;
  let second: string;

  beforeAll(async () => {
    root = await tempDir();
    const repo = await TestRepo.create(root.dir, 'demo');
    first = await repo.commit('Initial commit', {
      'README.md': '# Demo\n',
      'src/app.js': 'const a = 1;\nconst b = 2;\nconsole.log(a + b);\n',
      'old-name.txt': 'same content in a file that is going to be renamed\n',
    });
    second = await repo.commit(
      'Refactor app\n\nUse a function so the sum can be reused.\n\nRefs #12',
      {
        'src/app.js': 'function sum(a, b) {\n  return a + b;\n}\nconsole.log(sum(1, 2));\n',
        'README.md': null,
        'docs/usage.md': 'Run it\n',
        'old-name.txt': null,
        'new-name.txt': 'same content in a file that is going to be renamed\n',
      },
    );
    app = await testApp(root.dir);
  });

  afterAll(async () => {
    await app.close();
    await root.cleanup();
  });

  it('lists co-authors from trailers', async () => {
    const res = await app.inject(`/api/repos/demo/commits/${second}`);
    expect(res.json().commit.coAuthors).toEqual([]);
  });

  it('returns the full message and parents', async () => {
    const res = await app.inject(`/api/repos/demo/commits/${second}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().commit).toMatchObject({
      sha: second,
      parents: [first],
      subject: 'Refactor app',
      body: 'Use a function so the sum can be reused.\n\nRefs #12',
    });
  });

  it('returns the changed files with statuses and line counts', async () => {
    const { files, stats } = (await app.inject(`/api/repos/demo/commits/${second}`)).json();
    const summary = files.map((f: { path: string; status: string; oldPath: string | null }) => [
      f.path,
      f.status,
      f.oldPath,
    ]);
    expect(summary).toEqual(
      expect.arrayContaining([
        ['README.md', 'deleted', null],
        ['docs/usage.md', 'added', null],
        ['new-name.txt', 'renamed', 'old-name.txt'],
        ['src/app.js', 'modified', null],
      ]),
    );
    expect(stats).toEqual({ files: 4, additions: 5, deletions: 4 });
  });

  it('numbers diff lines on both sides', async () => {
    const { files } = (await app.inject(`/api/repos/demo/commits/${second}`)).json();
    const app_js = files.find((f: { path: string }) => f.path === 'src/app.js');
    expect(app_js.hunks[0].lines.slice(0, 3)).toEqual([
      { type: 'del', content: 'const a = 1;', oldLine: 1, newLine: null },
      { type: 'del', content: 'const b = 2;', oldLine: 2, newLine: null },
      { type: 'del', content: 'console.log(a + b);', oldLine: 3, newLine: null },
    ]);
  });

  it('shows everything as added in the first commit', async () => {
    const { files } = (await app.inject(`/api/repos/demo/commits/${first}`)).json();
    expect(files.every((f: { status: string }) => f.status === 'added')).toBe(true);
  });

  it('accepts abbreviated hashes and rejects unknown ones', async () => {
    expect((await app.inject(`/api/repos/demo/commits/${second.slice(0, 8)}`)).statusCode).toBe(
      200,
    );
    expect((await app.inject('/api/repos/demo/commits/0000000')).statusCode).toBe(404);
    expect((await app.inject('/api/repos/demo/commits/--help')).statusCode).toBe(400);
  });
});
