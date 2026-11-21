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

  it.each(['tar.gz', 'zip'])(
    'refuses a %s of a tree that would unpack outside its folder',
    async (format) => {
      const name = `evil-${format.replace('.', '')}`;
      const evil = await TestRepo.create(root.dir, name);
      await evil.commit('one', { 'a.txt': 'a\n' });
      const blob = (await evil.run(['rev-parse', 'HEAD:a.txt'])).trim();
      // git never writes such a tree; build it by hand.
      const file = path.join(root.dir, `${name}.tree`);
      await writeFile(
        file,
        Buffer.concat([Buffer.from('100644 ../escape\0'), Buffer.from(blob, 'hex')]),
      );
      const tree = (
        await evil.run(['hash-object', '-t', 'tree', '--literally', '-w', file])
      ).trim();
      const commit = (
        await evil.run([
          '-c',
          'user.name=T',
          '-c',
          'user.email=t@e.st',
          'commit-tree',
          tree,
          '-m',
          'evil',
        ])
      ).trim();
      const res = await app.inject(`/api/repos/${name}/archive?format=${format}&ref=${commit}`);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('unsafe_tree');
      await rm(evil.path, { recursive: true });
    },
  );

  it('refuses an archive with a symlink to an absolute path', async () => {
    const abs = await TestRepo.create(root.dir, 'abs-link');
    await symlink('/etc/passwd', path.join(abs.path, 'passwd'));
    await abs.commit('link');
    const res = await app.inject('/api/repos/abs-link/archive?format=tar.gz');
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toMatch(/absolute path/);
    await rm(abs.path, { recursive: true });
  });

  it('archives commits dated outside what zip and tar fields hold', async () => {
    const future = await TestRepo.create(root.dir, 'future');
    await future.commit('far ahead', { 'a.txt': 'a\n' }, { date: '@9000000000 +0000' });
    const out = await tempDir();
    try {
      for (const format of ['zip', 'tar.gz']) {
        const res = await app.inject(`/api/repos/future/archive?format=${format}`);
        expect(res.statusCode).toBe(200);
        const file = path.join(out.dir, `f.${format}`);
        await writeFile(file, res.rawPayload);
        if (format === 'zip') await run('unzip', ['-tq', file]);
        else await run('tar', ['-tzf', file]);
      }
    } finally {
      await out.cleanup();
      await rm(future.path, { recursive: true });
    }
  });

  it('stops an archive that runs past its time limit and frees its slot', async () => {
    const limited = await testApp(root.dir, {
      ARCHIVE_TIMEOUT_MS: '1',
      ARCHIVE_MAX_CONCURRENT: '1',
    });
    try {
      for (let i = 0; i < 2; i++) {
        // Cut off, or 504 when the timer fired before anything was sent.
        // Never 503: the first attempt gave its slot back.
        const outcome = await limited.inject('/api/repos/demo/archive?format=tar.gz').then(
          (res) => res.statusCode,
          () => 'cut off',
        );
        expect([504, 'cut off']).toContain(outcome);
      }
    } finally {
      await limited.close();
    }
  });
});
