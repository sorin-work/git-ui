import { get, repoPath, toQuery } from './client';
import type {
  Blob,
  Branch,
  CommitPage,
  CommitWithDiff,
  Repo,
  RepoSummary,
  Tag,
  Tree,
} from './types';

export * from './types';
export { ApiError } from './client';

export async function listRepos(): Promise<RepoSummary[]> {
  return (await get<{ repos: RepoSummary[] }>('/repos')).repos;
}

export async function getRepo(repo: string): Promise<Repo> {
  return (await get<{ repo: Repo }>(repoPath(repo))).repo;
}

export function getTree(repo: string, ref?: string, path?: string): Promise<Tree> {
  return get<Tree>(`${repoPath(repo)}/tree`, { ref, path });
}

export function getBlob(repo: string, ref: string | undefined, path: string): Promise<Blob> {
  return get<Blob>(`${repoPath(repo)}/blob`, { ref, path });
}

export interface CommitFilters {
  ref?: string;
  path?: string;
  author?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

/** Direct URL to a file's bytes, for <img> tags, raw views and downloads. */
export function rawUrl(repo: string, ref: string, path: string, download = false): string {
  return `/api${repoPath(repo)}/raw${toQuery({ ref, path, download: download ? 1 : undefined })}`;
}

export function listCommits(repo: string, filters: CommitFilters): Promise<CommitPage> {
  return get<CommitPage>(`${repoPath(repo)}/commits`, { ...filters });
}

export function getCommit(repo: string, sha: string): Promise<CommitWithDiff> {
  return get<CommitWithDiff>(`${repoPath(repo)}/commits/${encodeURIComponent(sha)}`);
}

export function listBranches(repo: string) {
  return get<{ defaultBranch: string | null; branches: Branch[] }>(`${repoPath(repo)}/branches`);
}

export async function listTags(repo: string): Promise<Tag[]> {
  return (await get<{ tags: Tag[] }>(`${repoPath(repo)}/tags`)).tags;
}
