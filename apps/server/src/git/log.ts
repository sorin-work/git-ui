import type { RepoLocation } from './repos.js';
import { git } from './run.js';

export interface Person {
  name: string;
  email: string;
  date: string;
}

export interface CommitSummary {
  sha: string;
  shortSha: string;
  parents: string[];
  author: Person;
  committer: Person;
  subject: string;
}

const FIELDS = ['%H', '%h', '%P', '%an', '%ae', '%aI', '%cn', '%ce', '%cI', '%s'];
export const LOG_FORMAT = FIELDS.join('|');

/** Parses `git log --format=LOG_FORMAT` output, one commit per line. */
export function parseLog(output: string): CommitSummary[] {
  return output
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [sha, shortSha, parents, an, ae, ad, cn, ce, cd, subject] = line.split('|');
      return {
        sha: sha ?? '',
        shortSha: shortSha ?? '',
        parents: parents ? parents.split(' ') : [],
        author: { name: an ?? '', email: ae ?? '', date: ad ?? '' },
        committer: { name: cn ?? '', email: ce ?? '', date: cd ?? '' },
        subject: subject ?? '',
      };
    });
}

export interface LogOptions {
  path?: string;
  /** Matches author name or email, case-insensitive, as plain text. */
  author?: string;
  /** Searches commit messages, case-insensitive, as plain text. */
  query?: string;
  skip: number;
  limit: number;
}

export async function listCommits(
  repo: RepoLocation,
  commit: string,
  options: LogOptions,
): Promise<CommitSummary[]> {
  const args = [
    'log',
    `--format=${LOG_FORMAT}`,
    `--skip=${options.skip}`,
    `--max-count=${options.limit}`,
    '--regexp-ignore-case',
    '--fixed-strings',
  ];
  if (options.author) args.push(`--author=${options.author}`);
  if (options.query) args.push(`--grep=${options.query}`);
  args.push(commit, '--');
  if (options.path) args.push(options.path);

  return parseLog(await git(repo.path, args));
}
