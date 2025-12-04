import type { RepoLocation } from './repos.js';
import { git } from './run.js';

export type EntryType = 'tree' | 'blob' | 'commit';

export interface TreeEntry {
  name: string;
  /** Full path from the repository root. */
  path: string;
  type: EntryType;
  mode: string;
  sha: string;
  /** Size in bytes for files, null for directories and submodules. */
  size: number | null;
}

const LINE = /^(\d{6}) (blob|tree|commit) ([0-9a-f]+) +(-|\d+)\t(.*)$/;

/** Parses `git ls-tree --long` output. */
export function parseLsTree(output: string): TreeEntry[] {
  const entries: TreeEntry[] = [];
  for (const line of output.split('\n')) {
    const match = LINE.exec(line);
    if (!match) continue;
    const [, mode, type, sha, size, fullPath] = match as unknown as [
      string,
      string,
      EntryType,
      string,
      string,
      string,
    ];
    entries.push({
      name: fullPath.slice(fullPath.lastIndexOf('/') + 1),
      path: fullPath,
      type,
      mode,
      sha,
      size: size === '-' ? null : Number(size),
    });
  }
  return entries;
}

const TYPE_ORDER: Record<EntryType, number> = { tree: 0, commit: 1, blob: 2 };

/** Folders first, then files, each alphabetically (case-insensitive, numbers in order). */
export function sortEntries(entries: TreeEntry[]): TreeEntry[] {
  return [...entries].sort(
    (a, b) =>
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }),
  );
}

/** Entries of the directory at `path` ('' for the root) in `commit`. */
export async function listTree(
  repo: RepoLocation,
  commit: string,
  path: string,
): Promise<TreeEntry[]> {
  const treeish = path === '' ? commit : `${commit}:${path}`;
  const out = await git(repo.path, ['ls-tree', '--long', treeish]);
  return sortEntries(
    parseLsTree(out).map((entry) => ({
      ...entry,
      path: path === '' ? entry.path : `${path}/${entry.path}`,
    })),
  );
}
