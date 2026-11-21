import { execFile, spawn } from 'node:child_process';
import type { Readable } from 'node:stream';

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

/** Full argument list and environment for one git call. */
export function invocation(
  repoPath: string,
  args: readonly string[],
  env: Record<string, string> = {},
) {
  return {
    // Repositories mounted from the host are often owned by another user, and
    // git refuses to open those ("dubious ownership"). Trust exactly the
    // repository being read, not every directory.
    args: [...BASE_ARGS, '-c', `safe.directory=${repoPath}`, ...withSafetyFlags(args)],
    env: gitEnvironment(env),
  };
}

function run<T extends string | Buffer>(
  repoPath: string,
  args: readonly string[],
  encoding: 'utf8' | 'buffer',
  options: GitOptions,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const call = invocation(repoPath, args, options.env);
    execFile(
      'git',
      call.args,
      {
        cwd: repoPath,
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
  });
}

/**
 * Runs git in `repoPath` without a shell. Arguments are passed as an array,
 * so nothing a user types can be interpreted by a shell; callers still have
 * to make sure refs and paths can't be read as options.
 */
export function git(repoPath: string, args: readonly string[], options: GitOptions = {}) {
  return run<string>(repoPath, args, 'utf8', options);
}

/** Like `git()` but returns raw bytes, for file contents. */
export function gitBuffer(repoPath: string, args: readonly string[], options: GitOptions = {}) {
  return run<Buffer>(repoPath, args, 'buffer', options);
}

/**
 * Streams git's stdout instead of buffering it, for output that can be large
 * (archives). The stream errors with a GitError if git fails.
 */
export function gitStream(repoPath: string, args: readonly string[]): Readable {
  const call = invocation(repoPath, args);
  const child = spawn('git', call.args, { cwd: repoPath, env: call.env, windowsHide: true });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  child.on('close', (code) => {
    if (code !== 0) child.stdout.destroy(new GitError(args, code, stderr));
  });
  return child.stdout;
}
