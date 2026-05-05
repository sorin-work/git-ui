import type { RepoLocation } from './repos.js';
import { git } from './run.js';
import type { CommitBrief } from './summary.js';

/** How far back to look; entries untouched in this many commits get no date. */
export const MAX_WALK = 2000;

interface LogRecord {
  commit: CommitBrief;
  files: string[];
}

/**
 * Parses `git log -z --name-only --format=%x1e%H%x1f%s%x1f%an%x1f%aI`:
 * each record is "\x1e<header>\0\n<file>\0<file>\0…".
 */
export function parseNameOnlyLog(output: string): LogRecord[] {
  return output
    .split('\x1e')
    .filter(Boolean)
    .map((chunk) => {
      const [header = '', ...files] = chunk.split('\0');
      const [sha = '', subject = '', author = '', date = ''] = header.split('\x1f');
      return {
        commit: { sha, subject, author, date },
        files: files.map((f) => f.replace(/^\n/, '')).filter(Boolean),
      };
    });
}

/** For each name, the first record (newest commit) that touched it inside `dir`. */
export function latestPerEntry(
  records: LogRecord[],
  dir: string,
  names: string[],
): Record<string, CommitBrief> {
  const wanted = new Set(names);
  const found: Record<string, CommitBrief> = {};
  const prefix = dir ? `${dir}/` : '';
  for (const { commit, files } of records) {
    for (const file of files) {
      if (!file.startsWith(prefix)) continue;
      const child = file.slice(prefix.length).split('/')[0]!;
      if (wanted.has(child) && !found[child]) found[child] = commit;
    }
    if (Object.keys(found).length === wanted.size) break;
  }
  return found;
}

/**
 * The last commit that changed each entry of a directory, using a single
 * `git log` walk instead of one git process per file.
 */
export async function latestCommits(
  repo: RepoLocation,
  commit: string,
  dir: string,
  names: string[],
): Promise<Record<string, CommitBrief>> {
  if (names.length === 0) return {};
  const out = await git(repo.path, [
    'log',
    '-z',
    '--name-only',
    '--format=%x1e%H%x1f%s%x1f%an%x1f%aI',
    `--max-count=${MAX_WALK}`,
    commit,
    '--',
    dir || '.',
  ]);
  return latestPerEntry(parseNameOnlyLog(out), dir, names);
}
