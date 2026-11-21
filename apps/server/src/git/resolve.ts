import { badRequest, HttpError, notFound } from '../lib/errors.js';
import { defaultBranch } from './summary.js';
import type { RepoLocation } from './repos.js';
import { git, GitError } from './run.js';
import { isSafeRef, normalizeRepoPath } from './validate.js';

export type RefKind = 'branch' | 'tag' | 'commit';

/** The commit `revision` names, or null when it names none. */
async function verifyCommit(repo: RepoLocation, revision: string): Promise<string | null> {
  try {
    const out = await git(repo, [
      'rev-parse',
      '--verify',
      '--quiet',
      '--end-of-options',
      `${revision}^{commit}`,
    ]);
    return out.trim() || null;
  } catch (err) {
    if (err instanceof GitError) return null;
    throw err;
  }
}

/**
 * Where to look for a name, in order. git's own lookup would let a tag beat
 * a branch of the same name, a commit whose sha starts like a branch name
 * beat that branch, and accept refs/remotes, refs/stash or "@" as well. Here
 * a name is a full sha, a branch, a tag or an abbreviated sha, in that
 * order, and nothing else. `refs/heads/x` and `refs/tags/x` pick one of a
 * branch and a tag that share a name.
 */
export function refCandidates(name: string): [string, RefKind][] {
  if (name === 'HEAD') return [['HEAD', 'commit']];
  if (name.startsWith('refs/heads/')) return [[name, 'branch']];
  if (name.startsWith('refs/tags/')) return [[name, 'tag']];
  if (name.startsWith('refs/')) return [];
  const candidates: [string, RefKind][] = [];
  if (/^([0-9a-f]{40}|[0-9a-f]{64})$/i.test(name)) candidates.push([name, 'commit']);
  candidates.push([`refs/heads/${name}`, 'branch'], [`refs/tags/${name}`, 'tag']);
  if (/^[0-9a-f]{7,63}$/i.test(name)) candidates.push([name, 'commit']);
  return candidates;
}

/**
 * The commit an abbreviated sha names, looked up among objects only: asking
 * rev-parse for `<hex>^{commit}` would also take a ref called `<hex>` (in
 * refs/remotes, say), which is the guessing the lookup order is meant to
 * stop. Throws when the prefix fits more than one commit.
 */
async function commitByPrefix(repo: RepoLocation, prefix: string): Promise<string | null> {
  let objects: string[];
  try {
    const out = await git(repo, ['rev-parse', `--disambiguate=${prefix.toLowerCase()}`]);
    objects = out.split('\n').filter((line) => /^[0-9a-f]{40,64}$/.test(line));
  } catch (err) {
    if (err instanceof GitError) return null;
    throw err;
  }
  const commits = new Set<string>();
  for (const object of objects) {
    // Full object names are never read as refs; tags peel to their commit.
    const commit = await verifyCommit(repo, object);
    if (commit) commits.add(commit);
  }
  if (commits.size > 1) {
    throw new HttpError(409, `Revision "${prefix}" is ambiguous; use more characters`, 'ambiguous');
  }
  return [...commits][0] ?? null;
}

/**
 * Turns a branch, tag or commit name into a full commit sha. Without a ref the
 * repository's default branch is used.
 */
export async function resolveCommit(
  repo: RepoLocation,
  ref?: string,
): Promise<{ ref: string; kind: RefKind; commit: string }> {
  const name = ref ?? (await defaultBranch(repo)) ?? 'HEAD';
  if (!isSafeRef(name)) throw badRequest(`Invalid ref "${name}"`);
  for (const [revision, kind] of refCandidates(name)) {
    const prefix =
      kind === 'commit' &&
      /^[0-9a-f]{7,63}$/i.test(revision) &&
      !/^([0-9a-f]{40}|[0-9a-f]{64})$/i.test(revision);
    const commit = prefix
      ? await commitByPrefix(repo, revision)
      : await verifyCommit(repo, revision);
    if (commit) return { ref: name, kind, commit };
  }
  throw notFound(`Revision "${name}"`);
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
    return (await git(repo, ['cat-file', '-t', '--end-of-options', `${commit}:${path}`])).trim();
  } catch (err) {
    if (err instanceof GitError) return null;
    throw err;
  }
}
