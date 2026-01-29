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
/**
 * Fields are separated by the ASCII unit separator and commits by NUL (`-z`),
 * characters that can't appear in names or subjects. A visible delimiter such
 * as "|" breaks as soon as a commit message contains it.
 */
const FIELD_SEPARATOR = '\x1f';
export const LOG_FORMAT = FIELDS.join('%x1f');

/** Parses `git log -z --format=LOG_FORMAT` output. */
export function parseLog(output: string): CommitSummary[] {
  return output
    .split('\0')
    .map((record) => record.replace(/^\n/, ''))
    .filter((record) => record.trim() !== '')
    .map((record) => {
      const [sha, shortSha, parents, an, ae, ad, cn, ce, cd, subject] =
        record.split(FIELD_SEPARATOR);
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
    '-z',
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
