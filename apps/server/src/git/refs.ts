import type { RepoLocation } from './repos.js';
import { git } from './run.js';

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

/** Branches listed at most; ahead/behind costs one git call per branch. */
export const MAX_BRANCHES = 200;

function records(output: string): string[][] {
  return output
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.split('\0'));
}

async function aheadBehind(repo: RepoLocation, base: string, branch: string) {
  const out = await git(repo.path, [
    'rev-list',
    '--left-right',
    '--count',
    `refs/heads/${base}...refs/heads/${branch}`,
  ]);
  const [behind, ahead] = out.trim().split(/\s+/).map(Number);
  return { ahead: ahead ?? 0, behind: behind ?? 0 };
}

export async function listBranches(
  repo: RepoLocation,
  defaultBranch: string | null,
): Promise<Branch[]> {
  const out = await git(repo.path, [
    'for-each-ref',
    '--sort=-committerdate',
    `--count=${MAX_BRANCHES}`,
    '--format=%(refname:short)%00%(objectname)%00%(committerdate:iso-strict)%00%(subject)%00%(authorname)',
    'refs/heads',
  ]);

  return Promise.all(
    records(out).map(async ([name = '', sha = '', date = '', subject = '', author = '']) => {
      const isDefault = name === defaultBranch;
      const counts =
        defaultBranch && !isDefault
          ? await aheadBehind(repo, defaultBranch, name)
          : { ahead: 0, behind: 0 };
      return { name, sha, date, subject, author, isDefault, ...counts };
    }),
  );
}

export async function listTags(repo: RepoLocation): Promise<Tag[]> {
  const out = await git(repo.path, [
    'for-each-ref',
    '--sort=-creatordate',
    '--format=%(refname:short)%00%(objecttype)%00%(objectname)%00%(*objectname)%00%(creatordate:iso-strict)%00%(contents:subject)',
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
