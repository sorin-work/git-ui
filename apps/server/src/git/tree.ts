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

const RECORD = /^(\d{6}) (blob|tree|commit) ([0-9a-f]+) +(-|\d+)\t(.*)$/s;

/**
 * Parses `git ls-tree --long -z` output. Records are NUL-separated so file
 * names are passed through verbatim; without -z git quotes names containing
 * non-ASCII characters, quotes or tabs (e.g. "caf\303\251.md").
 */
export function parseLsTree(output: string): TreeEntry[] {
  const entries: TreeEntry[] = [];
  for (const record of output.split('\0')) {
    const match = RECORD.exec(record);
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

/** Files listed at most by `listAllFiles`. */
export const MAX_FILES = 50_000;

/** Every file path at a commit (recursively), for the go-to-file finder. */
export async function listAllFiles(
  repo: RepoLocation,
  commit: string,
): Promise<{ files: string[]; truncated: boolean }> {
  const out = await git(repo.path, ['ls-tree', '-r', '-z', '--name-only', commit]);
  const files = out.split('\0').filter(Boolean);
  return { files: files.slice(0, MAX_FILES), truncated: files.length > MAX_FILES };
}

/** Entries of the directory at `path` ('' for the root) in `commit`. */
export async function listTree(
  repo: RepoLocation,
  commit: string,
  path: string,
): Promise<TreeEntry[]> {
  const treeish = path === '' ? commit : `${commit}:${path}`;
  const out = await git(repo.path, ['ls-tree', '--long', '-z', treeish]);
  return sortEntries(
    parseLsTree(out).map((entry) => ({
      ...entry,
      path: path === '' ? entry.path : `${path}/${entry.path}`,
    })),
  );
}
