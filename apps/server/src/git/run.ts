import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { Semaphore } from '../lib/semaphore.js';

/**
 * Config set on every invocation with `-c`, which beats anything in the
 * repository's own config. The repositories we serve are not necessarily
 * trusted, and their config is input like any other: it can name programs
 * for git to run and change the output our parsers read.
 */
export const PINNED_CONFIG: readonly (readonly [string, string])[] = [
  // Programs. Read commands would otherwise run these from a repository's
  // config: hooks and fsmonitor, gpg for `log.showSignature` and `%G?` (also
  // inside `export-subst` files in archives).
  ['core.fsmonitor', 'false'],
  ['core.hooksPath', '/dev/null'],
  ['core.pager', 'cat'],
  ['log.showSignature', 'false'],
  ['gpg.program', 'false'],
  ['gpg.ssh.program', 'false'],
  ['gpg.x509.program', 'false'],

  // Output. Colors, other diff prefixes, an extra grep column or another
  // encoding would turn what the parsers read into garbage.
  ['color.ui', 'never'],
  ['color.diff', 'never'],
  ['color.grep', 'never'],
  ['color.branch', 'never'],
  ['color.showBranch', 'never'],
  ['color.status', 'never'],
  ['diff.noprefix', 'false'],
  ['diff.mnemonicPrefix', 'false'],
  ['diff.srcPrefix', 'a/'],
  ['diff.dstPrefix', 'b/'],
  ['diff.relative', 'false'],
  ['diff.suppressBlankEmpty', 'false'],
  ['diff.submodule', 'short'],
  ['grep.column', 'false'],
  ['i18n.logOutputEncoding', 'UTF-8'],
  ['log.follow', 'false'],
  ['log.showRoot', 'true'],

  // Files outside the repository that config could point at. (blame's
  // ignoreRevsFile is a list that `-c` cannot clear; see NO_PROGRAM_FLAGS.)
  ['core.attributesFile', '/dev/null'],
  ['diff.orderFile', '/dev/null'],
  ['mailmap.file', '/dev/null'],
];

const BASE_ARGS = [
  '--no-pager',
  ...PINNED_CONFIG.flatMap(([key, value]) => ['-c', `${key}=${value}`]),
];

/**
 * The environment git runs with. It starts empty rather than from
 * `process.env`, so variables such as GIT_DIR, GIT_CONFIG_PARAMETERS or
 * GIT_EXTERNAL_DIFF set for the server never reach git, and neither does
 * HOME: the system and user config of the host do not apply either.
 */
export function gitEnvironment(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_ATTR_NOSYSTEM: '1',
    // refs/replace can make a sha show another commit's content.
    GIT_NO_REPLACE_OBJECTS: '1',
    // A path is a path: no `:(exclude)` magic and no `*` patterns in what
    // the API passes after `--`.
    GIT_LITERAL_PATHSPECS: '1',
    // Never write to the repositories, not even the index of a clone.
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    LC_ALL: 'C',
  };
  for (const key of ['PATH', 'TMPDIR']) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return { ...env, ...extra };
}

/**
 * Diff drivers set up in a repository's .gitattributes and config (textconv,
 * external diff) are programs git runs when it shows content. Never let a
 * repository we only want to display run its own programs. blame also drops
 * the ignore-revs files from config: they can name any file on the host,
 * and a missing one makes every blame fail.
 */
const NO_PROGRAM_FLAGS: Record<string, string[]> = {
  show: ['--no-textconv', '--no-ext-diff'],
  log: ['--no-textconv', '--no-ext-diff'],
  diff: ['--no-textconv', '--no-ext-diff'],
  blame: ['--no-textconv', '--no-ignore-revs-file'],
  grep: ['--no-textconv'],
};

/** Inserts NO_PROGRAM_FLAGS right after the subcommand (skipping leading `-c x=y` pairs). */
export function withSafetyFlags(args: readonly string[]): string[] {
  let i = 0;
  while (args[i] === '-c') i += 2;
  const flags = NO_PROGRAM_FLAGS[args[i] ?? ''];
  return flags ? [...args.slice(0, i + 1), ...flags, ...args.slice(i + 1)] : [...args];
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * How many git processes may run at once. Without a limit one page can start
 * hundreds (the repository list runs three per repository, the branches page
 * one per branch). Calls beyond the limit wait in line, and fail with a
 * BusyError (503) when they waited too long. Archives have their own limit
 * (see routes/archive.ts) and are not counted here.
 */
export const gitSlots = new Semaphore(2 * availableParallelism(), 10_000);

export function configureGit(options: { maxProcesses: number; queueTimeoutMs: number }) {
  gitSlots.limit = options.maxProcesses;
  gitSlots.waitMs = options.queueTimeoutMs;
}
const DEFAULT_MAX_BUFFER = 32 * 1024 * 1024;

const NOT_FOUND_PATTERNS = [
  /unknown revision/i,
  /bad revision/i,
  /bad object/i,
  /not a valid object name/i,
  /invalid object name/i,
  /does not exist in/i,
  /exists on disk, but not in/i,
  /path '.*' does not exist/i,
  /no such path/i,
  /needed a single revision/i,
];

export class GitError extends Error {
  readonly args: readonly string[];
  readonly exitCode: number | null;
  readonly stderr: string;
  /** git was killed because it ran longer than the timeout. */
  readonly timedOut: boolean;
  /** git produced more output than we are willing to buffer. */
  readonly outputTooLarge: boolean;

  constructor(
    args: readonly string[],
    exitCode: number | null,
    stderr: string,
    reason: { timedOut?: boolean; outputTooLarge?: boolean } = {},
  ) {
    super(`git ${args[0] ?? ''} failed: ${stderr.trim().split('\n')[0] ?? 'unknown error'}`);
    this.name = 'GitError';
    this.args = args;
    this.exitCode = exitCode;
    this.stderr = stderr;
    this.timedOut = reason.timedOut ?? false;
    this.outputTooLarge = reason.outputTooLarge ?? false;
  }

  /** The command failed because a ref, object or path does not exist. */
  get isNotFound(): boolean {
    return NOT_FOUND_PATTERNS.some((pattern) => pattern.test(this.stderr));
  }
}

export interface GitOptions {
  timeoutMs?: number;
  maxBuffer?: number;
  /** Extra environment variables, e.g. commit dates. */
  env?: Record<string, string>;
}

/**
 * Where git runs. A plain path is for creating repositories (tests, demo
 * data); everything that reads a served repository passes its location.
 */
export interface GitTarget {
  /** The repository folder: the work tree of a clone, or the bare repository. */
  path: string;
  /** The checked git directory (see RepoRegistry). */
  gitDir: string;
  bare: boolean;
}

/** Full argument list, working directory and environment for one git call. */
export function invocation(
  target: string | GitTarget,
  args: readonly string[],
  env: Record<string, string> = {},
) {
  if (typeof target === 'string') {
    return {
      cwd: target,
      // Repositories mounted from the host are often owned by another user, and
      // git refuses to open those ("dubious ownership"). Trust exactly the
      // repository being read, not every directory.
      args: [...BASE_ARGS, '-c', `safe.directory=${target}`, ...withSafetyFlags(args)],
      // Never fall back to a repository further up.
      env: gitEnvironment({ GIT_CEILING_DIRECTORIES: path.dirname(target), ...env }),
    };
  }
  return {
    cwd: target.path,
    args: [
      ...BASE_ARGS,
      '-c',
      `safe.directory=${target.path}`,
      '-c',
      `safe.directory=${target.gitDir}`,
      // The work tree is pinned to the repository folder below, so a bare
      // repository would read .mailmap from its own folder; keep reading it
      // from HEAD as git does for bare repositories.
      ...(target.bare ? ['-c', 'mailmap.blob=HEAD:.mailmap'] : []),
      ...withSafetyFlags(args),
    ],
    // An explicit git directory means no discovery: git cannot end up in a
    // repository further up if this one disappears, and `core.worktree` in
    // the repository's config cannot point at a folder elsewhere.
    env: gitEnvironment({ GIT_DIR: target.gitDir, GIT_WORK_TREE: target.path, ...env }),
  };
}

function run<T extends string | Buffer>(
  target: string | GitTarget,
  args: readonly string[],
  encoding: 'utf8' | 'buffer',
  options: GitOptions,
): Promise<T> {
  return gitSlots.run(
    () =>
      new Promise<T>((resolve, reject) => {
        const call = invocation(target, args, options.env);
        execFile(
          'git',
          call.args,
          {
            cwd: call.cwd,
            encoding,
            timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
            env: call.env,
            windowsHide: true,
          },
          (error, stdout, stderr) => {
            if (error) {
              const code = typeof error.code === 'number' ? error.code : null;
              reject(
                new GitError(args, code, String(stderr || error.message), {
                  timedOut: error.killed === true && error.signal !== null,
                  outputTooLarge: error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
                }),
              );
              return;
            }
            resolve(stdout as T);
          },
        );
      }),
  );
}

let version: Promise<[number, number]> | null = null;

/** The installed git's major and minor version, asked once. */
export function gitVersion(): Promise<[number, number]> {
  version ??= new Promise((resolve) => {
    execFile('git', ['--version'], { env: gitEnvironment() }, (error, stdout) => {
      const match = /(\d+)\.(\d+)/.exec(String(stdout));
      resolve(error || !match ? [0, 0] : [Number(match[1]), Number(match[2])]);
    });
  });
  return version;
}

/**
 * Runs git for `target` without a shell. Arguments are passed as an array,
 * so nothing a user types can be interpreted by a shell; callers still have
 * to make sure refs and paths can't be read as options.
 */
export function git(target: string | GitTarget, args: readonly string[], options: GitOptions = {}) {
  return run<string>(target, args, 'utf8', options);
}

/** Like `git()` but returns raw bytes, for file contents. */
export function gitBuffer(
  target: string | GitTarget,
  args: readonly string[],
  options: GitOptions = {},
) {
  return run<Buffer>(target, args, 'buffer', options);
}

/**
 * Starts git with stdin and stdout as pipes, for `cat-file --batch`. The
 * caller reads stdout, writes stdin and checks the exit code itself.
 */
export function gitProcess(
  target: string | GitTarget,
  args: readonly string[],
): ChildProcessWithoutNullStreams {
  const call = invocation(target, args);
  return spawn('git', call.args, { cwd: call.cwd, env: call.env, windowsHide: true });
}
