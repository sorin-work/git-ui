import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { git } from '../src/git/run.js';

/** A temporary directory removed by `cleanup()`. */
export async function tempDir(prefix = 'git-ui-test-') {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

interface CommitOptions {
  author?: string;
  email?: string;
  /** ISO date, used for both author and committer date. */
  date?: string;
}

let clock = Date.parse('2025-01-01T09:00:00Z');

/** A throwaway repository with helpers to build history quickly in tests. */
export class TestRepo {
  private constructor(readonly path: string) {}

  static async create(parent: string, name: string): Promise<TestRepo> {
    const dir = path.join(parent, name);
    await mkdir(dir, { recursive: true });
    await git(dir, ['init', '--quiet', '--initial-branch=main']);
    return new TestRepo(dir);
  }

  run(args: string[], env: Record<string, string> = {}) {
    return git(this.path, args, { env });
  }

  /** Writes files (null deletes) relative to the repository root. */
  async write(files: Record<string, string | Buffer | null>) {
    for (const [file, content] of Object.entries(files)) {
      const full = path.join(this.path, file);
      if (content === null) {
        await rm(full, { force: true });
      } else {
        await mkdir(path.dirname(full), { recursive: true });
        await writeFile(full, content);
      }
    }
  }

  /** Writes the files, commits everything and returns the new commit's sha. */
  async commit(
    message: string,
    files: Record<string, string | Buffer | null> = {},
    options: CommitOptions = {},
  ): Promise<string> {
    await this.write(files);
    clock += 3_600_000;
    const date = options.date ?? new Date(clock).toISOString();
    const author = options.author ?? 'Test Author';
    const email = options.email ?? 'author@example.com';
    await this.run(['add', '--all']);
    await this.run(
      [
        '-c',
        `user.name=${author}`,
        '-c',
        `user.email=${email}`,
        'commit',
        '--quiet',
        '--allow-empty',
        '-m',
        message,
      ],
      { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    );
    return (await this.run(['rev-parse', 'HEAD'])).trim();
  }

  async checkout(branch: string, create = false) {
    await this.run(
      create ? ['checkout', '--quiet', '-b', branch] : ['checkout', '--quiet', branch],
    );
  }

  async tag(name: string, message?: string) {
    const args = message
      ? [
          '-c',
          'user.name=Tagger',
          '-c',
          'user.email=tagger@example.com',
          'tag',
          '-a',
          name,
          '-m',
          message,
        ]
      : ['tag', name];
    await this.run(args);
  }
}
