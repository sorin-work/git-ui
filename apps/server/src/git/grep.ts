import type { RepoLocation } from './repos.js';
import { git, GitError } from './run.js';

export const MAX_MATCHES = 300;
const MAX_PER_FILE = 20;
const MAX_LINE_LENGTH = 500;

export interface Match {
  path: string;
  line: number;
  text: string;
}

export interface SearchResult {
  matches: Match[];
  /** True when there were more matches than are returned. */
  truncated: boolean;
}

/** Parses `git grep -z -n <tree>` output: "<tree>:<path>\0<line>\0<text>". */
export function parseGrep(output: string, treeish: string): Match[] {
  const prefix = `${treeish}:`;
  const matches: Match[] = [];
  for (const record of output.split('\n')) {
    const [location, line, ...text] = record.split('\0');
    if (!location || !line) continue;
    matches.push({
      path: location.startsWith(prefix) ? location.slice(prefix.length) : location,
      line: Number(line),
      text: text.join('\0').slice(0, MAX_LINE_LENGTH),
    });
  }
  return matches;
}

/** Searches file contents at a commit for a literal string. Binary files are skipped. */
export async function searchCode(
  repo: RepoLocation,
  commit: string,
  query: string,
  options: { path?: string; caseSensitive?: boolean } = {},
): Promise<SearchResult> {
  const args = [
    'grep',
    '-z',
    '--line-number',
    '-I',
    '--fixed-strings',
    `--max-count=${MAX_PER_FILE}`,
  ];
  if (!options.caseSensitive) args.push('--ignore-case');
  args.push('-e', query, commit, '--');
  if (options.path) args.push(options.path);

  let out: string;
  try {
    out = await git(repo.path, args);
  } catch (err) {
    // git grep exits with 1 when nothing matches (and 128 on real errors).
    if (err instanceof GitError && err.exitCode === 1) {
      return { matches: [], truncated: false };
    }
    throw err;
  }

  const matches = parseGrep(out, commit);
  return { matches: matches.slice(0, MAX_MATCHES), truncated: matches.length > MAX_MATCHES };
}
