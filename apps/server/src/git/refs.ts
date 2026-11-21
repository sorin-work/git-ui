import type { RepoLocation } from './repos.js';
import { git, gitVersion } from './run.js';
import { isSafeRef } from './validate.js';

export interface Branch {
  name: string;
  sha: string;
  date: string;
  subject: string;
  author: string;
  isDefault: boolean;
  /** Commits on this branch that the default branch does not have. */
  ahead: number;
  /** Commits on the default branch that this branch does not have. */
  behind: number;
}

export interface Tag {
  name: string;
  /** The commit the tag points to. */
  sha: string;
  date: string;
  annotated: boolean;
  /** Subject of the tag message for annotated tags, of the commit otherwise. */
  subject: string;
}

/**
 * Names come from `%(refname:lstrip=2)`, not `:short`: when a branch and a
 * tag share a name, `:short` prints `heads/v1` and `tags/v1`, which are not
 * the names the API takes.
 */

/** Branches listed at most; before git 2.41 ahead/behind costs one git call per branch. */
export const MAX_BRANCHES = 200;

function records(output: string): string[][] {
  return output
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.split('\0'));
}

async function aheadBehind(repo: RepoLocation, base: string, branch: string) {
  const out = await git(repo, [
    'rev-list',
    '--left-right',
    '--count',
    '--end-of-options',
    `refs/heads/${base}...refs/heads/${branch}`,
    '--',
  ]);
  const [behind, ahead] = out.trim().split(/\s+/).map(Number);
  return { ahead: ahead ?? 0, behind: behind ?? 0 };
}

/** `%(ahead-behind:...)` in for-each-ref counts every branch in one walk, from git 2.41. */
export async function supportsAheadBehind(): Promise<boolean> {
  const [major, minor] = await gitVersion();
  return major > 2 || (major === 2 && minor >= 41);
}

const BRANCH_FORMAT =
  '%(refname:lstrip=2)%00%(objectname)%00%(committerdate:iso-strict)%00%(subject)%00%(authorname)';

export async function listBranches(
  repo: RepoLocation,
  defaultBranch: string | null,
  { oneWalk }: { oneWalk?: boolean } = {},
): Promise<Branch[]> {
  // The default branch goes into a format string; only use names that
  // cannot close or extend the placeholder.
  const single =
    defaultBranch !== null &&
    isSafeRef(defaultBranch) &&
    (oneWalk ?? (await supportsAheadBehind()));
  const out = await git(repo, [
    'for-each-ref',
    '--sort=-committerdate',
    `--count=${MAX_BRANCHES}`,
    `--format=${BRANCH_FORMAT}${single ? `%00%(ahead-behind:refs/heads/${defaultBranch})` : ''}`,
    'refs/heads',
  ]);

  return Promise.all(
    records(out).map(
      async ([name = '', sha = '', date = '', subject = '', author = '', counted = '']) => {
        const isDefault = name === defaultBranch;
        let counts = { ahead: 0, behind: 0 };
        if (single) {
          const [ahead = 0, behind = 0] = counted.split(' ').map(Number);
          counts = { ahead, behind };
        } else if (defaultBranch && !isDefault) {
          // One process per branch, which the git process limit keeps in check.
          counts = await aheadBehind(repo, defaultBranch, name);
        }
        return { name, sha, date, subject, author, isDefault, ...counts };
      },
    ),
  );
}

export async function listTags(repo: RepoLocation): Promise<Tag[]> {
  const out = await git(repo, [
    'for-each-ref',
    '--sort=-creatordate',
    '--format=%(refname:lstrip=2)%00%(objecttype)%00%(objectname)%00%(*objectname)%00%(creatordate:iso-strict)%00%(contents:subject)',
    'refs/tags',
  ]);

  return records(out).map(
    ([name = '', type = '', object = '', peeled = '', date = '', subject = '']) => ({
      name,
      sha: type === 'tag' ? peeled : object,
      date,
      annotated: type === 'tag',
      subject,
    }),
  );
}
