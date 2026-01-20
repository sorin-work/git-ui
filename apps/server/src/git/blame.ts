import type { RepoLocation } from './repos.js';
import { git } from './run.js';

export interface BlameLine {
  /** Line number in the file as it is at the requested commit. */
  number: number;
  content: string;
  /** Commit that last changed this line. */
  sha: string;
  /** Line number in that commit's version of the file. */
  originalNumber: number;
}

export interface BlameCommit {
  author: string;
  email: string;
  date: string;
  summary: string;
}

export interface Blame {
  lines: BlameLine[];
  commits: Record<string, BlameCommit>;
}

const HEADER = /^([0-9a-f]{40}) (\d+) (\d+)(?: \d+)?$/;

/**
 * Parses `git blame --porcelain`. Every line starts with a header naming the
 * commit; details about a commit (author, summary…) are only printed the
 * first time it appears, and the line's content follows prefixed by a tab.
 */
export function parseBlame(output: string): Blame {
  const lines: BlameLine[] = [];
  const commits: Record<string, BlameCommit> = {};
  let current: { sha: string; original: number; final: number } | null = null;
  let info: Partial<BlameCommit> & { time?: number } = {};

  for (const line of output.split('\n')) {
    if (current === null) {
      const header = HEADER.exec(line);
      if (header) {
        current = { sha: header[1]!, original: Number(header[2]), final: Number(header[3]) };
        info = {};
      }
      continue;
    }

    if (line.startsWith('\t')) {
      if (!commits[current.sha]) {
        commits[current.sha] = {
          author: info.author ?? '',
          email: info.email ?? '',
          date: info.time === undefined ? '' : new Date(info.time * 1000).toISOString(),
          summary: info.summary ?? '',
        };
      }
      lines.push({
        number: current.final,
        content: line.slice(1),
        sha: current.sha,
        originalNumber: current.original,
      });
      current = null;
    } else if (line.startsWith('author ')) {
      info.author = line.slice('author '.length);
    } else if (line.startsWith('author-mail ')) {
      info.email = line.slice('author-mail '.length).replace(/^<|>$/g, '');
    } else if (line.startsWith('author-time ')) {
      info.time = Number(line.slice('author-time '.length));
    } else if (line.startsWith('summary ')) {
      info.summary = line.slice('summary '.length);
    }
  }

  return { lines, commits };
}

export async function blame(repo: RepoLocation, commit: string, path: string): Promise<Blame> {
  const out = await git(repo.path, ['blame', '--porcelain', commit, '--', path]);
  return parseBlame(out);
}
