import { parseDiff, type FileDiff } from './diff.js';
import type { CommitSummary } from './log.js';
import type { RepoLocation } from './repos.js';
import { git } from './run.js';

export interface CommitDetail extends CommitSummary {
  /** Message without the subject line. */
  body: string;
  /** People credited with "Co-authored-by:" trailers. */
  coAuthors: { name: string; email: string }[];
}

/** Reads "Co-authored-by: Name <email>" trailers from a commit message body. */
export function parseCoAuthors(body: string): { name: string; email: string }[] {
  const people: { name: string; email: string }[] = [];
  for (const match of body.matchAll(/^co-authored-by:\s*(.+?)\s*<([^>\s]+)>\s*$/gim)) {
    const person = { name: match[1]!, email: match[2]! };
    if (!people.some((p) => p.email.toLowerCase() === person.email.toLowerCase())) {
      people.push(person);
    }
  }
  return people;
}

const DETAIL_FORMAT = ['%H', '%h', '%P', '%an', '%ae', '%aI', '%cn', '%ce', '%cI', '%s', '%b'].join(
  '%x00',
);

export async function readCommit(repo: RepoLocation, sha: string): Promise<CommitDetail> {
  const out = await git(repo.path, ['show', '--no-patch', `--format=${DETAIL_FORMAT}`, sha]);
  const [hash, shortSha, parents, an, ae, ad, cn, ce, cd, subject, body] = out.split('\0');
  return {
    sha: hash ?? sha,
    shortSha: shortSha ?? '',
    parents: parents ? parents.split(' ') : [],
    author: { name: an ?? '', email: ae ?? '', date: ad ?? '' },
    committer: { name: cn ?? '', email: ce ?? '', date: cd ?? '' },
    subject: subject ?? '',
    body: (body ?? '').trim(),
    coAuthors: parseCoAuthors(body ?? ''),
  };
}

/**
 * Diff a commit introduced, compared with its first parent. For merges this
 * is what the merge brought into the branch; git's default for merges is a
 * "combined" diff that only shows conflict resolutions (and usually nothing).
 */
export async function commitDiff(repo: RepoLocation, sha: string): Promise<FileDiff[]> {
  const out = await git(repo.path, [
    '-c',
    'core.quotepath=off',
    'show',
    '--diff-merges=first-parent',
    '--format=',
    '--patch',
    '--find-renames',
    sha,
  ]);
  return parseDiff(out);
}

export function diffStats(files: FileDiff[]) {
  return {
    files: files.length,
    additions: files.reduce((sum, f) => sum + f.additions, 0),
    deletions: files.reduce((sum, f) => sum + f.deletions, 0),
  };
}
