import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from '../../test/app.js';
import { TestRepo, tempDir } from '../../test/repo.js';

describe('blame route', () => {
  let root: Awaited<ReturnType<typeof tempDir>>;
  let app: FastifyInstance;
  let first: string;
  let second: string;

  beforeAll(async () => {
    root = await tempDir();
    const repo = await TestRepo.create(root.dir, 'demo');
    first = await repo.commit(
      'Add greeting',
      { 'hello.py': 'name = "world"\nprint(name)\n' },
      { author: 'Ana Pop', email: 'ana@example.com' },
    );
    second = await repo.commit(
      'Say hello properly',
      { 'hello.py': 'name = "world"\nprint(f"Hello, {name}!")\n' },
      { author: 'Ben Ode', email: 'ben@example.com' },
    );
    app = await testApp(root.dir);
  });

  afterAll(async () => {
    await app.close();
    await root.cleanup();
  });

  it('shows which commit last touched each line', async () => {
    const res = await app.inject('/api/repos/demo/blame?path=hello.py');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.lines.map((l: { sha: string; content: string }) => [l.sha, l.content])).toEqual([
      [first, 'name = "world"'],
      [second, 'print(f"Hello, {name}!")'],
    ]);
    expect(body.commits[second]).toMatchObject({
      author: 'Ben Ode',
      summary: 'Say hello properly',
    });
  });

  it('blames an older version of the file', async () => {
    const res = await app.inject(`/api/repos/demo/blame?path=hello.py&ref=${first}`);
    expect(new Set(res.json().lines.map((l: { sha: string }) => l.sha))).toEqual(new Set([first]));
  });

  it('rejects folders and missing files', async () => {
    expect((await app.inject('/api/repos/demo/blame?path=')).statusCode).toBe(400);
    expect((await app.inject('/api/repos/demo/blame?path=nope.py')).statusCode).toBe(404);
  });
});
