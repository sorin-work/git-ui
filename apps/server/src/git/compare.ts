import { diffStats } from './commit.js';
import { parseDiff, type FileDiff } from './diff.js';
import { LOG_FORMAT, parseLog, type CommitSummary } from './log.js';
import type { RepoLocation } from './repos.js';
import { git } from './run.js';

/** Commits listed at most on a compare page. */
export const MAX_COMPARE_COMMITS = 250;

export interface Comparison {
  mergeBase: string | null;
  /** Commits in head that are not in base. */
  aheadBy: number;
  /** Commits in base that are not in head. */
  behindBy: number;
  /** Commits in head that are not in base, oldest first. */
  commits: CommitSummary[];
  /** True when there are more commits than `commits` contains. */
  truncated: boolean;
  /** What head changes compared to the point where it split from base. */
  files: FileDiff[];
  stats: { files: number; additions: number; deletions: number };
}

/**
 * Compares two commits the way a pull request would: the diff is taken from
 * their merge base, so changes made on `base` meanwhile are not shown.
 */
export async function compare(repo: RepoLocation, base: string, head: string): Promise<Comparison> {
  const mergeBase = await git(repo.path, ['merge-base', base, head])
    .then((out) => out.trim() || null)
    .catch(() => null);

  const [counts, log, patch] = await Promise.all([
    git(repo.path, ['rev-list', '--left-right', '--count', `${base}...${head}`]),
    git(repo.path, [
      'log',
      '-z',
      '--reverse',
      `--format=${LOG_FORMAT}`,
      `--max-count=${MAX_COMPARE_COMMITS + 1}`,
      `${base}..${head}`,
    ]),
    mergeBase
      ? git(repo.path, ['-c', 'core.quotepath=off', 'diff', '--find-renames', mergeBase, head])
      : Promise.resolve(''),
  ]);

  const [behindBy = 0, aheadBy = 0] = counts.trim().split(/\s+/).map(Number);
  const commits = parseLog(log);
  const files = parseDiff(patch);
  return {
    mergeBase,
    aheadBy,
    behindBy,
    commits: commits.slice(0, MAX_COMPARE_COMMITS),
    truncated: commits.length > MAX_COMPARE_COMMITS,
    files,
    stats: diffStats(files),
  };
}
