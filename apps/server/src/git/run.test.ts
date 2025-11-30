import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { git, GitError, gitBuffer } from './run.js';

describe('git runner', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'git-ui-run-'));
    await git(dir, ['init', '--quiet', '--initial-branch=main']);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns stdout as text', async () => {
    const out = await git(dir, ['rev-parse', '--is-inside-work-tree']);
    expect(out.trim()).toBe('true');
  });

  it('returns stdout as bytes', async () => {
    const out = await gitBuffer(dir, ['rev-parse', '--git-dir']);
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.toString().trim()).toBe('.git');
  });

  it('wraps failures in GitError and recognises missing objects', async () => {
    const error = await git(dir, ['rev-parse', '--verify', 'nope^{commit}']).catch((e) => e);
    expect(error).toBeInstanceOf(GitError);
    expect(error.exitCode).not.toBe(0);
    expect((error as GitError).isNotFound).toBe(true);
  });

  it('does not run arguments through a shell', async () => {
    const error = await git(dir, ['rev-parse', '--verify', '$(touch pwned)']).catch((e) => e);
    expect(error).toBeInstanceOf(GitError);
  });
});
