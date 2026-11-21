import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { isSafeRepoName } from './validate.js';

export interface RepoLocation {
  /** Name used in URLs: the directory name without a trailing ".git". */
  name: string;
  /** Absolute path git should run in. */
  path: string;
  /** The git directory, resolved and checked to be inside REPOS_DIR. */
  gitDir: string;
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

async function readText(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Checks whether a directory is a git repository, which kind, and where its
 * git directory is: `.git` for a clone, the folder itself for a bare
 * repository, or wherever the `gitdir:` line of a `.git` file points
 * (worktrees and submodules).
 */
export async function detectRepo(dir: string): Promise<{ bare: boolean; gitDir: string } | null> {
  const dotGit = path.join(dir, '.git');
  if (await exists(dotGit, 'dir')) return { bare: false, gitDir: dotGit };
  if (await exists(dotGit, 'file')) {
    const match = /^gitdir: (.+?)\r?$/m.exec((await readText(dotGit)) ?? '');
    return match ? { bare: false, gitDir: path.resolve(dir, match[1]!) } : null;
  }
  const [head, objects, refs] = await Promise.all([
    exists(path.join(dir, 'HEAD'), 'file'),
    exists(path.join(dir, 'objects'), 'dir'),
    exists(path.join(dir, 'refs'), 'dir'),
  ]);
  return head && objects && refs ? { bare: true, gitDir: dir } : null;
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** git follows alternates of alternates up to this depth, and so do we. */
const MAX_ALTERNATE_DEPTH = 5;

/** Parts of a git directory that could be symlinks to another repository's. */
const LINKABLE = [
  'HEAD',
  'packed-refs',
  'refs',
  'refs/heads',
  'refs/tags',
  'objects',
  'objects/info',
  'objects/pack',
];

/**
 * Everything git would read for a repository must be inside `base`: its git
 * directory, the main repository of a linked worktree (`commondir`), every
 * alternate object store, and the refs and objects even when they are
 * symlinks. Returns why a repository is refused, or null when it is fine.
 * `base` must be a real path.
 */
export async function escapeReason(base: string, gitDir: string): Promise<string | null> {
  const real = await realpath(gitDir).catch(() => null);
  if (!real) return 'its git directory does not exist';
  if (!isInside(base, real)) return 'its git directory is outside REPOS_DIR';

  let common = real;
  const commondir = (await readText(path.join(real, 'commondir')))?.trim();
  if (commondir) {
    const target = await realpath(path.resolve(real, commondir)).catch(() => null);
    if (!target || !isInside(base, target)) return 'its commondir is outside REPOS_DIR';
    common = target;
  }

  for (const part of LINKABLE) {
    const dir = part === 'HEAD' ? real : common;
    const target = await realpath(path.join(dir, part)).catch(() => null);
    if (target && !isInside(base, target)) return `${part} is a link out of REPOS_DIR`;
  }

  // Loose object folders (objects/ab) could be links too.
  const objects = path.join(common, 'objects');
  const entries = await readdir(objects, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isSymbolicLink()) continue;
    const target = await realpath(path.join(objects, entry.name)).catch(() => null);
    if (target && !isInside(base, target))
      return `objects/${entry.name} is a link out of REPOS_DIR`;
  }

  // Alternates add another object store; relative entries are relative to
  // the objects folder that lists them.
  let stores = [objects];
  for (let depth = 0; depth < MAX_ALTERNATE_DEPTH && stores.length > 0; depth++) {
    const next: string[] = [];
    for (const store of stores) {
      const list = await readText(path.join(store, 'info', 'alternates'));
      if (list === null) continue;
      for (const line of list.split('\n').map((l) => l.trim())) {
        if (line === '' || line.startsWith('#')) continue;
        // git unquotes C-style quoted entries; we do not try to.
        if (line.startsWith('"')) return 'objects/info/alternates has a quoted entry';
        const target = await realpath(path.resolve(store, line)).catch(() => null);
        // git skips alternates that do not exist, so they cannot leak anything.
        if (target === null) continue;
        if (!isInside(base, target)) return 'objects/info/alternates points outside REPOS_DIR';
        next.push(target);
      }
    }
    stores = next;
  }
  return null;
}

export interface SkippedRepo {
  dir: string;
  reason: string;
}

/**
 * The repositories served by the app: every direct subdirectory of
 * `reposDir` that is a git repository (bare or with a working tree).
 * Symlinks are followed only when they point at a directory inside
 * `reposDir`, and a repository whose git data lives outside `reposDir`
 * (see `escapeReason`) is left out, so nothing in the folder can publish a
 * repository from elsewhere on the machine.
 */
export class RepoRegistry {
  private readonly reported = new Set<string>();

  constructor(
    readonly reposDir: string,
    /** Called once per directory and reason when a repository is left out. */
    private readonly onSkip: (skipped: SkippedRepo) => void = () => {},
  ) {}

  private skip(dir: string, reason: string) {
    const key = `${dir}\0${reason}`;
    if (this.reported.has(key)) return;
    this.reported.add(key);
    this.onSkip({ dir, reason });
  }

  async list(): Promise<RepoLocation[]> {
    let base;
    let entries;
    try {
      base = await realpath(this.reposDir);
      entries = await readdir(base, { withFileTypes: true });
    } catch {
      return [];
    }

    const found = await Promise.all(
      entries.map(async (entry): Promise<RepoLocation | null> => {
        if (entry.name.startsWith('.')) return null;
        const dir = path.join(base, entry.name);
        if (entry.isSymbolicLink()) {
          const target = await realpath(dir).catch(() => null);
          if (!target || !isInside(base, target) || !(await exists(target, 'dir'))) return null;
        } else if (!entry.isDirectory()) {
          return null;
        }
        const repo = await detectRepo(dir);
        if (!repo) return null;
        const name = entry.name.replace(/\.git$/, '');
        if (!isSafeRepoName(name)) return null;
        const reason = await escapeReason(base, repo.gitDir);
        if (reason) {
          this.skip(dir, reason);
          return null;
        }
        const gitDir = await realpath(repo.gitDir).catch(() => null);
        return gitDir ? { name, path: dir, gitDir, bare: repo.bare } : null;
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
