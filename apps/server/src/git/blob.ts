import type { RepoLocation } from './repos.js';
import { git, gitBuffer } from './run.js';

/** Files bigger than this are not sent to the browser for display. */
export const MAX_DISPLAY_BYTES = 1024 * 1024;

export interface BlobContent {
  size: number;
  binary: boolean;
  /** True when the file is too big to display; `content` is then null. */
  truncated: boolean;
  content: string | null;
}

/** Same heuristic as git: a NUL byte in the first 8000 bytes means binary. */
export function looksBinary(bytes: Buffer): boolean {
  return bytes.subarray(0, 8000).includes(0);
}

export async function blobSize(repo: RepoLocation, commit: string, path: string): Promise<number> {
  return Number((await git(repo.path, ['cat-file', '-s', `${commit}:${path}`])).trim());
}

export function readBlobBytes(repo: RepoLocation, commit: string, path: string): Promise<Buffer> {
  return gitBuffer(repo.path, ['cat-file', 'blob', `${commit}:${path}`]);
}

export async function readBlob(
  repo: RepoLocation,
  commit: string,
  path: string,
): Promise<BlobContent> {
  const size = await blobSize(repo, commit, path);
  if (size > MAX_DISPLAY_BYTES) {
    return { size, binary: false, truncated: true, content: null };
  }
  const bytes = await readBlobBytes(repo, commit, path);
  if (looksBinary(bytes)) {
    return { size, binary: true, truncated: false, content: null };
  }
  return { size, binary: false, truncated: false, content: bytes.toString('utf8') };
}
