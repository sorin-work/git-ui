import { execFile } from 'node:child_process';

/** Arguments added to every invocation so user or system config can't change the output. */
const BASE_ARGS = ['--no-pager', '-c', 'color.ui=never', '-c', 'core.pager=cat'];

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
      [...BASE_ARGS, ...args],
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
