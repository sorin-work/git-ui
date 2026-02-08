import { execFile } from 'node:child_process';

/**
 * Arguments added to every invocation. Besides keeping the output stable,
 * they switch off config that could make git run programs: the repositories
 * we serve are not necessarily trusted.
 */
const BASE_ARGS = [
  '--no-pager',
  '-c',
  'color.ui=never',
  '-c',
  'core.pager=cat',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'core.hooksPath=/dev/null',
];

/**
 * Diff drivers set up in a repository's .gitattributes and config (textconv,
 * external diff) are programs git runs when it shows content. Never let a
 * repository we only want to display run its own programs.
 */
const NO_PROGRAM_FLAGS: Record<string, string[]> = {
  show: ['--no-textconv', '--no-ext-diff'],
  log: ['--no-textconv', '--no-ext-diff'],
  diff: ['--no-textconv', '--no-ext-diff'],
  blame: ['--no-textconv'],
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

  constructor(args: readonly string[], exitCode: number | null, stderr: string) {
    super(`git ${args[0] ?? ''} failed: ${stderr.trim().split('\n')[0] ?? 'unknown error'}`);
    this.name = 'GitError';
    this.args = args;
    this.exitCode = exitCode;
    this.stderr = stderr;
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

function run<T extends string | Buffer>(
  repoPath: string,
  args: readonly string[],
  encoding: 'utf8' | 'buffer',
  options: GitOptions,
): Promise<T> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      // Repositories mounted from the host are often owned by another user, and
      // git refuses to open those ("dubious ownership"). Trust exactly the
      // repository being read, not every directory.
      [...BASE_ARGS, '-c', `safe.directory=${repoPath}`, ...withSafetyFlags(args)],
      {
        cwd: repoPath,
        encoding,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          LC_ALL: 'C',
          ...options.env,
        },
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          const code = typeof error.code === 'number' ? error.code : null;
          reject(new GitError(args, code, String(stderr || error.message)));
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
