import { badRequest, notFound } from '../lib/errors.js';
import { defaultBranch } from './summary.js';
import type { RepoLocation } from './repos.js';
import { git, GitError } from './run.js';
import { isSafeRef, normalizeRepoPath } from './validate.js';

/**
 * Turns a branch, tag or commit name into a full commit sha. Without a ref the
 * repository's default branch is used.
 */
export async function resolveCommit(
  repo: RepoLocation,
  ref?: string,
): Promise<{
  ref: string;
  commit: string;
}> {
  const name = ref ?? (await defaultBranch(repo)) ?? 'HEAD';
  if (!isSafeRef(name)) throw badRequest(`Invalid ref "${name}"`);
  try {
    const out = await git(repo.path, [
      'rev-parse',
      '--verify',
      '--quiet',
      '--end-of-options',
      `${name}^{commit}`,
    ]);
    return { ref: name, commit: out.trim() };
  } catch (err) {
    if (err instanceof GitError) throw notFound(`Revision "${name}"`);
    throw err;
  }
}

/** Validates a path inside the repository, rejecting anything that tries to escape. */
export function repoPath(input: string | undefined): string {
  const normalized = normalizeRepoPath(input ?? '');
  if (normalized === null) throw badRequest('Invalid path');
  return normalized;
}

/** 'tree', 'blob' or 'commit' (submodule) for a path at a commit, or null if it does not exist. */
export async function objectType(
  repo: RepoLocation,
  commit: string,
  path: string,
): Promise<string | null> {
  if (path === '') return 'tree';
  try {
    return (await git(repo.path, ['cat-file', '-t', `${commit}:${path}`])).trim();
  } catch (err) {
    if (err instanceof GitError) return null;
    throw err;
  }
}
