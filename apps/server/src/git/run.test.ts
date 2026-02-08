import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { blame } from './blame.js';
import { commitDiff } from './commit.js';
import { git, GitError, gitBuffer, withSafetyFlags } from './run.js';

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

  it('never runs diff drivers configured by the repository', async () => {
    // A repository can map files to a "textconv" program in .gitattributes;
    // git show, log -p, diff and blame run it unless told not to.
    const marker = path.join(dir, 'pwned');
    const program = `sh -c 'touch ${marker}; cat "$0"'`;
    await git(dir, ['config', 'diff.evil.textconv', program]);
    await git(dir, ['config', 'diff.external', program]);
    await git(dir, ['config', 'core.fsmonitor', program]);
    await writeFile(path.join(dir, '.gitattributes'), 'a.txt diff=evil\n');
    await writeFile(path.join(dir, 'a.txt'), 'one\n');
    await git(dir, ['add', '.']);
    await git(dir, ['-c', 'user.name=T', '-c', 'user.email=t@e.st', 'commit', '-qm', 'one']);
    await writeFile(path.join(dir, 'a.txt'), 'two\n');
    await git(dir, ['-c', 'user.name=T', '-c', 'user.email=t@e.st', 'commit', '-qam', 'two']);
    const repo = { name: 'x', path: dir, bare: false };

    await commitDiff(repo, 'HEAD');
    await blame(repo, 'HEAD', 'a.txt');
    await git(dir, ['log', '-p', '-1']);
    await git(dir, ['diff', 'HEAD~1', 'HEAD']);
    expect(existsSync(marker)).toBe(false);
  });

  it('adds the safety flags after the subcommand', () => {
    expect(withSafetyFlags(['-c', 'core.quotepath=off', 'show', 'HEAD'])).toEqual([
      '-c',
      'core.quotepath=off',
      'show',
      '--no-textconv',
      '--no-ext-diff',
      'HEAD',
    ]);
    expect(withSafetyFlags(['blame', 'HEAD'])).toEqual(['blame', '--no-textconv', 'HEAD']);
    expect(withSafetyFlags(['ls-tree', 'HEAD'])).toEqual(['ls-tree', 'HEAD']);
  });

  it('does not run arguments through a shell', async () => {
    const error = await git(dir, ['rev-parse', '--verify', '$(touch pwned)']).catch((e) => e);
    expect(error).toBeInstanceOf(GitError);
  });
});
