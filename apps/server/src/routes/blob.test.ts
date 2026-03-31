import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from '../../test/app.js';
import { TestRepo, tempDir } from '../../test/repo.js';
import { MAX_DISPLAY_BYTES } from '../git/blob.js';

describe('blob route', () => {
  let root: Awaited<ReturnType<typeof tempDir>>;
  let app: FastifyInstance;

  beforeAll(async () => {
    root = await tempDir();
    const repo = await TestRepo.create(root.dir, 'demo');
    await repo.commit('Add files', {
      'src/main.go': 'package main\n\nfunc main() {}\n',
      'logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
      'big.txt': 'x'.repeat(MAX_DISPLAY_BYTES + 1),
      Dockerfile: 'FROM alpine\n',
      'notes/über.txt': 'grüße\n',
      'site/index.html': '<script>fetch("/api/repos")</script>',
      'site/app.js': 'alert(document.cookie)',
      'site/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    });
    app = await testApp(root.dir);
  });

  afterAll(async () => {
    await app.close();
    await root.cleanup();
  });

  it('returns text content with its language', async () => {
    const res = await app.inject('/api/repos/demo/blob?path=src/main.go');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      ref: 'main',
      path: 'src/main.go',
      name: 'main.go',
      language: 'go',
      image: false,
      binary: false,
      truncated: false,
      size: 29,
      content: 'package main\n\nfunc main() {}\n',
    });
  });

  it('recognises files by name', async () => {
    const res = await app.inject('/api/repos/demo/blob?path=Dockerfile');
    expect(res.json().language).toBe('dockerfile');
  });

  it('does not send binary content', async () => {
    const res = await app.inject('/api/repos/demo/blob?path=logo.png');
    expect(res.json()).toMatchObject({ binary: true, image: true, content: null, size: 12 });
  });

  it('does not send files that are too large', async () => {
    const res = await app.inject('/api/repos/demo/blob?path=big.txt');
    expect(res.json()).toMatchObject({ truncated: true, content: null });
  });

  it('decodes UTF-8 content', async () => {
    const res = await app.inject(
      `/api/repos/demo/blob?path=${encodeURIComponent('notes/über.txt')}`,
    );
    expect(res.json().content).toBe('grüße\n');
  });

  it('serves raw bytes with a content type', async () => {
    const png = await app.inject('/api/repos/demo/raw?path=logo.png');
    expect(png.statusCode).toBe(200);
    expect(png.headers['content-type']).toBe('image/png');
    expect(png.rawPayload.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const text = await app.inject('/api/repos/demo/raw?path=src/main.go');
    expect(text.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(text.body).toBe('package main\n\nfunc main() {}\n');
  });

  it('never serves repository files as something the browser would run', async () => {
    for (const file of ['site/index.html', 'site/app.js']) {
      const res = await app.inject(`/api/repos/demo/raw?path=${file}`);
      expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toMatch(/^sandbox;/);
    }
  });

  it('serves SVG as an image but sandboxed so embedded scripts cannot run', async () => {
    const res = await app.inject('/api/repos/demo/raw?path=site/logo.svg');
    expect(res.headers['content-type']).toBe('image/svg+xml');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toMatch(/^sandbox;/);
  });

  it('offers raw files as downloads', async () => {
    const res = await app.inject(
      `/api/repos/demo/raw?download=1&path=${encodeURIComponent('notes/über.txt')}`,
    );
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="_ber.txt"; filename*=UTF-8''%C3%BCber.txt`,
    );
  });

  it('rejects directories, missing files and a missing path', async () => {
    expect((await app.inject('/api/repos/demo/blob?path=src')).statusCode).toBe(400);
    expect((await app.inject('/api/repos/demo/blob?path=nope.txt')).statusCode).toBe(404);
    expect((await app.inject('/api/repos/demo/blob')).statusCode).toBe(400);
  });
});
