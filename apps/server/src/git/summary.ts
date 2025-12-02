import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { RepoLocation } from './repos.js';
import { git, GitError } from './run.js';

export interface CommitBrief {
  sha: string;
  subject: string;
  author: string;
  date: string;
}

export interface RepoSummary {
  name: string;
  description: string | null;
  bare: boolean;
  defaultBranch: string | null;
  lastCommit: CommitBrief | null;
}

const PLACEHOLDER_DESCRIPTION = /^Unnamed repository;/;

async function readDescription(repo: RepoLocation): Promise<string | null> {
  const file = repo.bare
    ? path.join(repo.path, 'description')
    : path.join(repo.path, '.git', 'description');
  try {
    const text = (await readFile(file, 'utf8')).trim();
    return text && !PLACEHOLDER_DESCRIPTION.test(text) ? text : null;
  } catch {
    return null;
  }
}

/** The branch HEAD points to, or null for a detached HEAD. */
export async function defaultBranch(repo: RepoLocation): Promise<string | null> {
  try {
    return (await git(repo.path, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim() || null;
  } catch (err) {
    if (err instanceof GitError) return null;
    throw err;
  }
}

/** The latest commit on HEAD, or null for a repository without commits. */
export async function lastCommit(repo: RepoLocation): Promise<CommitBrief | null> {
  try {
    const out = await git(repo.path, ['log', '-1', '--format=%H%x00%s%x00%an%x00%aI', 'HEAD']);
    const [sha, subject, author, date] = out.trimEnd().split('\0');
    if (!sha || subject === undefined || author === undefined || !date) return null;
    return { sha, subject, author, date };
  } catch (err) {
    if (err instanceof GitError) return null;
    throw err;
  }
}

export async function summarize(repo: RepoLocation): Promise<RepoSummary> {
  const [description, branch, commit] = await Promise.all([
    readDescription(repo),
    defaultBranch(repo),
    lastCommit(repo),
  ]);
  return {
    name: repo.name,
    description,
    bare: repo.bare,
    defaultBranch: branch,
    lastCommit: commit,
  };
}

export async function refCounts(repo: RepoLocation): Promise<{ branches: number; tags: number }> {
  const out = await git(repo.path, [
    'for-each-ref',
    '--format=%(refname)',
    'refs/heads',
    'refs/tags',
  ]);
  const refs = out.split('\n').filter(Boolean);
  return {
    branches: refs.filter((r) => r.startsWith('refs/heads/')).length,
    tags: refs.filter((r) => r.startsWith('refs/tags/')).length,
  };
}
