import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { git } from '../git/run.js';

export interface Author {
  name: string;
  email: string;
}

/** Builds a repository with a scripted history: fixed authors and dates. */
export class RepoBuilder {
  private constructor(readonly path: string) {}

  static async init(dir: string, branch = 'main'): Promise<RepoBuilder> {
    await mkdir(dir, { recursive: true });
    await git(dir, ['init', '--quiet', `--initial-branch=${branch}`]);
    return new RepoBuilder(dir);
  }

  private identity(author: Author, date: string) {
    return {
      args: ['-c', `user.name=${author.name}`, '-c', `user.email=${author.email}`],
      env: { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    };
  }

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

  async commit(
    author: Author,
    date: string,
    message: string,
    files: Record<string, string | Buffer | null> = {},
  ) {
    await this.write(files);
    await git(this.path, ['add', '--all']);
    const { args, env } = this.identity(author, date);
    await git(this.path, [...args, 'commit', '--quiet', '--allow-empty', '-m', message], { env });
  }

  async move(from: string, to: string) {
    await mkdir(path.dirname(path.join(this.path, to)), { recursive: true });
    await git(this.path, ['mv', from, to]);
  }

  async branch(name: string, from?: string) {
    await git(this.path, ['checkout', '--quiet', '-b', name, ...(from ? [from] : [])]);
  }

  async checkout(name: string) {
    await git(this.path, ['checkout', '--quiet', name]);
  }

  async merge(author: Author, date: string, branch: string, message: string) {
    const { args, env } = this.identity(author, date);
    await git(this.path, [...args, 'merge', '--quiet', '--no-ff', '-m', message, branch], { env });
  }

  async tag(author: Author, date: string, name: string, message: string) {
    const { args, env } = this.identity(author, date);
    await git(this.path, [...args, 'tag', '-a', name, '-m', message], { env });
  }

  async describe(text: string) {
    await writeFile(path.join(this.path, '.git', 'description'), `${text}\n`);
  }
}
