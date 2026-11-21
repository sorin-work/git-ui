import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, lstat, readFile, readlink, rm, truncate, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { symlink } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from '../../test/app.js';
import { TestRepo, tempDir } from '../../test/repo.js';

const run = promisify(execFile);
const LONG = `${'deep/'.repeat(25)}naïve café.txt`;

describe('archive route', () => {
  let root: Awaited<ReturnType<typeof tempDir>>;
  let app: FastifyInstance;

  beforeAll(async () => {
    root = await tempDir();
    const repo = await TestRepo.create(root.dir, 'demo');
    await repo.commit('Initial commit', { 'README.md': '# Demo\n', 'src/a.ts': 'x' });
    await repo.write({ [LONG]: 'long\n', 'run.sh': '#!/bin/sh\n', 'empty.txt': '' });
    await chmod(path.join(repo.path, 'run.sh'), 0o755);
    await symlink('src/a.ts', path.join(repo.path, 'link'));
    await repo.commit('More files');
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

  it.each(['tar.gz', 'zip'])('builds a %s that tar and unzip read back', async (format) => {
    const res = await app.inject(`/api/repos/demo/archive?format=${format}`);
    expect(res.statusCode).toBe(200);
    const out = await tempDir();
    try {
      const file = path.join(out.dir, `a.${format}`);
      await writeFile(file, res.rawPayload);
      if (format === 'zip') await run('unzip', ['-q', file, '-d', out.dir]);
      else await run('tar', ['-xzf', file, '-C', out.dir]);
      const dir = path.join(out.dir, 'demo-main');
      expect(await readFile(path.join(dir, 'src/a.ts'), 'utf8')).toBe('x');
      expect(await readFile(path.join(dir, LONG), 'utf8')).toBe('long\n');
      expect(await readFile(path.join(dir, 'empty.txt'), 'utf8')).toBe('');
      expect((await lstat(path.join(dir, 'run.sh'))).mode & 0o100).toBe(0o100);
      expect((await lstat(path.join(dir, 'README.md'))).mode & 0o100).toBe(0);
      expect(await readlink(path.join(dir, 'link'))).toBe('src/a.ts');
    } finally {
      await out.cleanup();
    }
  });

  it.each(['tar.gz', 'zip'])('answers 500 for a %s when an object is missing', async (format) => {
    const broken = await TestRepo.create(root.dir, 'broken');
    await broken.commit('one', { 'a.txt': 'a\n', 'b.txt': 'b\n' });
    const sha = (await broken.run(['rev-parse', 'HEAD:b.txt'])).trim();
    await rm(path.join(broken.path, '.git/objects', sha.slice(0, 2), sha.slice(2)));
    const res = await app.inject(`/api/repos/broken/archive?format=${format}`);
    // Found before anything is sent, so it is an ordinary error response.
    expect(res.statusCode).toBe(500);
    await rm(broken.path, { recursive: true });
  });

  it.each(['tar.gz', 'zip'])('cuts the %s off when git fails halfway', async (format) => {
    const name = `corrupt-${format.replace('.', '')}`;
    const corrupt = await TestRepo.create(root.dir, name);
    // a.bin comes first and is big enough that bytes reach the client.
    await corrupt.commit('one', { 'a.bin': randomBytes(100_000), 'z.bin': randomBytes(200_000) });
    const sha = (await corrupt.run(['rev-parse', 'HEAD:z.bin'])).trim();
    const object = path.join(corrupt.path, '.git/objects', sha.slice(0, 2), sha.slice(2));
    // The header (and so the size ls-tree prints) is fine; the content is not.
    await chmod(object, 0o644);
    await truncate(object, 100_000);
    // Either the connection is cut, or (when nothing was sent yet) the answer
    // is an error. Never a 200 that looks complete.
    const outcome = await app.inject(`/api/repos/${name}/archive?format=${format}`).then(
      (res) => res.statusCode,
      () => 'cut off',
    );
    expect([500, 'cut off']).toContain(outcome);
    await rm(corrupt.path, { recursive: true });
  });
});
