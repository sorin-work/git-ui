import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { isSafeRepoName } from './validate.js';

export interface RepoLocation {
  /** Name used in URLs: the directory name without a trailing ".git". */
  name: string;
  /** Absolute path git should run in. */
  path: string;
  bare: boolean;
}

async function exists(file: string, kind: 'file' | 'dir'): Promise<boolean> {
  try {
    const s = await stat(file);
    return kind === 'dir' ? s.isDirectory() : s.isFile();
  } catch {
    return false;
  }
}

/** Checks whether a directory is a git repository, and which kind. */
export async function detectRepo(dir: string): Promise<{ bare: boolean } | null> {
  if (await exists(path.join(dir, '.git'), 'dir')) return { bare: false };
  if (await exists(path.join(dir, '.git'), 'file')) return { bare: false }; // worktree or submodule
  const [head, objects, refs] = await Promise.all([
    exists(path.join(dir, 'HEAD'), 'file'),
    exists(path.join(dir, 'objects'), 'dir'),
    exists(path.join(dir, 'refs'), 'dir'),
  ]);
  return head && objects && refs ? { bare: true } : null;
}

/**
 * The repositories served by the app: every direct subdirectory of
 * `reposDir` that is a git repository (bare or with a working tree).
 */
export class RepoRegistry {
  constructor(readonly reposDir: string) {}

  async list(): Promise<RepoLocation[]> {
    let entries;
    try {
      entries = await readdir(this.reposDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const found = await Promise.all(
      entries.map(async (entry): Promise<RepoLocation | null> => {
        if (entry.name.startsWith('.')) return null;
        const dir = path.join(this.reposDir, entry.name);
        if (!entry.isDirectory() && !(entry.isSymbolicLink() && (await exists(dir, 'dir')))) {
          return null;
        }
        const repo = await detectRepo(dir);
        if (!repo) return null;
        const name = entry.name.replace(/\.git$/, '');
        return isSafeRepoName(name) ? { name, path: dir, bare: repo.bare } : null;
      }),
    );

    const byName = new Map<string, RepoLocation>();
    for (const repo of found) {
      if (repo && !byName.has(repo.name)) byName.set(repo.name, repo);
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(name: string): Promise<RepoLocation | null> {
    if (!isSafeRepoName(name)) return null;
    return (await this.list()).find((repo) => repo.name === name) ?? null;
  }
}
