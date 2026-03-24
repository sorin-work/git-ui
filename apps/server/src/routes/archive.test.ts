import { gunzipSync } from 'node:zlib';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from '../../test/app.js';
import { TestRepo, tempDir } from '../../test/repo.js';

describe('archive route', () => {
  let root: Awaited<ReturnType<typeof tempDir>>;
  let app: FastifyInstance;

  beforeAll(async () => {
    root = await tempDir();
    const repo = await TestRepo.create(root.dir, 'demo');
    await repo.commit('Initial commit', { 'README.md': '# Demo\n', 'src/a.ts': 'x' });
    await repo.checkout('release/1.0', true);
    await repo.checkout('main');
    app = await testApp(root.dir);
  });

  afterAll(async () => {
    await app.close();
    await root.cleanup();
  });

  it('downloads a zip of the default branch', async () => {
    const res = await app.inject('/api/repos/demo/archive');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toBe('attachment; filename="demo-main.zip"');
    expect(res.rawPayload.subarray(0, 2).toString()).toBe('PK');
  });

  it('downloads a tarball with every file under a folder named after the ref', async () => {
    const res = await app.inject('/api/repos/demo/archive?format=tar.gz&ref=release/1.0');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="demo-release-1.0.tar.gz"',
    );
    const tar = gunzipSync(res.rawPayload).toString('latin1');
    expect(tar).toContain('demo-release-1.0/README.md');
    expect(tar).toContain('demo-release-1.0/src/a.ts');
  });

  it('rejects unknown formats and refs', async () => {
    expect((await app.inject('/api/repos/demo/archive?format=rar')).statusCode).toBe(400);
    expect((await app.inject('/api/repos/demo/archive?ref=nope')).statusCode).toBe(404);
  });
});
