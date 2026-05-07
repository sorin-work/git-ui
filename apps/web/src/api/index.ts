import { get, repoPath, toQuery } from './client';
import type {
  Blame,
  CommitBrief,
  Blob,
  Branch,
  CommitPage,
  CommitWithDiff,
  Comparison,
  Insights,
  Repo,
  RepoSummary,
  SearchResult,
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

export async function getLatestCommits(
  repo: string,
  ref: string | undefined,
  path: string,
): Promise<Record<string, CommitBrief>> {
  return (
    await get<{ commits: Record<string, CommitBrief> }>(`${repoPath(repo)}/tree/latest`, {
      ref,
      path,
    })
  ).commits;
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

export function compareRefs(repo: string, base: string, head: string): Promise<Comparison> {
  return get<Comparison>(`${repoPath(repo)}/compare`, { base, head });
}

export function searchCode(
  repo: string,
  ref: string,
  q: string,
  caseSensitive = false,
): Promise<SearchResult> {
  return get<SearchResult>(`${repoPath(repo)}/search`, {
    ref,
    q,
    case: caseSensitive ? 1 : undefined,
  });
}

export function getInsights(repo: string, ref: string): Promise<Insights> {
  return get<Insights>(`${repoPath(repo)}/insights`, { ref });
}

export function getBlame(repo: string, ref: string, path: string): Promise<Blame> {
  return get<Blame>(`${repoPath(repo)}/blame`, { ref, path });
}

export function listFiles(repo: string, ref: string) {
  return get<{ ref: string; commit: string; files: string[]; truncated: boolean }>(
    `${repoPath(repo)}/files`,
    { ref },
  );
}

/** Download link for the files at a ref. */
export function archiveUrl(repo: string, ref: string, format: 'zip' | 'tar.gz'): string {
  return `/api${repoPath(repo)}/archive${toQuery({ ref, format })}`;
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
