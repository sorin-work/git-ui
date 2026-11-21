import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { blame } from './blame.js';
import { commitDiff } from './commit.js';
import { git, GitError, gitBuffer, invocation, withSafetyFlags } from './run.js';

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
    const repo = { name: 'x', path: dir, gitDir: path.join(dir, '.git'), bare: false };

    await commitDiff(repo, 'HEAD');
    await blame(repo, (await git(dir, ['rev-parse', 'HEAD'])).trim(), 'a.txt');
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
    expect(withSafetyFlags(['blame', 'HEAD'])).toEqual([
      'blame',
      '--no-textconv',
      '--no-ignore-revs-file',
      'HEAD',
    ]);
    expect(withSafetyFlags(['ls-tree', 'HEAD'])).toEqual(['ls-tree', 'HEAD']);
  });

  it('kills git when it runs past the timeout', async () => {
    // hash-object --stdin waits for input that never comes.
    const error = await git(dir, ['hash-object', '--stdin'], { timeoutMs: 200 }).catch((e) => e);
    expect(error).toBeInstanceOf(GitError);
    expect(error.timedOut).toBe(true);
  });

  it('reports output that is too large to buffer', async () => {
    const error = await git(dir, ['log', '-p'], { maxBuffer: 10 }).catch((e) => e);
    expect(error).toBeInstanceOf(GitError);
    expect(error.outputTooLarge).toBe(true);
  });

  it('does not run arguments through a shell', async () => {
    const error = await git(dir, ['rev-parse', '--verify', '$(touch pwned)']).catch((e) => e);
    expect(error).toBeInstanceOf(GitError);
  });
});

describe('git environment', () => {
  let dir: string;
  const saved = { ...process.env };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'git-ui-env-'));
    await git(dir, ['init', '--quiet', '--initial-branch=main']);
  });

  afterAll(async () => {
    process.env = saved;
    await rm(dir, { recursive: true, force: true });
  });

  it('ignores git variables and user config from the server environment', async () => {
    const home = path.join(dir, 'home');
    await mkdir(home);
    await writeFile(path.join(home, '.gitconfig'), '[user]\n\tname = From Home\n');
    process.env.HOME = home;
    process.env.GIT_DIR = path.join(dir, 'nowhere');
    process.env.GIT_CONFIG_PARAMETERS = "'user.email'='from@env'";
    try {
      expect((await git(dir, ['rev-parse', '--git-dir'])).trim()).toBe('.git');
      const error = await git(dir, ['config', '--get-regexp', '^user\\.']).catch((e) => e);
      expect(error).toBeInstanceOf(GitError);
      expect(error.exitCode).toBe(1);
    } finally {
      process.env = { ...saved };
    }
  });

  it('pins config before the caller’s own -c options, so those still win', () => {
    const { args, env } = invocation(dir, ['-c', 'core.quotepath=off', 'show', 'HEAD']);
    expect(args[0]).toBe('--no-pager');
    expect(args).toContain('log.showSignature=false');
    expect(args.indexOf('core.quotepath=off')).toBeGreaterThan(args.indexOf('color.diff=never'));
    expect(env.GIT_CONFIG_GLOBAL).toBe('/dev/null');
    expect(env.HOME).toBeUndefined();
  });
});
