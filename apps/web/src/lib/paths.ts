/**
 * Links inside a repository. Every dynamic part is URL-encoded: a branch
 * such as "feature/login" must stay one path segment ("feature%2Flogin"),
 * and file names may contain "#", "?" or spaces.
 */

const seg = encodeURIComponent;

/** Encodes each folder of a repository path but keeps the slashes. */
export function encodePath(path: string): string {
  return path.split('/').map(seg).join('/');
}

export function repoUrl(repo: string, view: string, ref?: string): string {
  return `/${seg(repo)}/${view}${ref === undefined ? '' : `/${seg(ref)}`}`;
}

export function treeUrl(repo: string, ref: string, path = ''): string {
  return `${repoUrl(repo, 'tree', ref)}${path ? `/${encodePath(path)}` : ''}`;
}

export function blobUrl(repo: string, ref: string, path: string): string {
  return `${repoUrl(repo, 'blob', ref)}/${encodePath(path)}`;
}

export function blameUrl(repo: string, ref: string, path: string): string {
  return `${repoUrl(repo, 'blame', ref)}/${encodePath(path)}`;
}

export function commitsUrl(repo: string, ref: string, path = ''): string {
  return `${repoUrl(repo, 'commits', ref)}${path ? `?path=${seg(path)}` : ''}`;
}

export function commitUrl(repo: string, sha: string): string {
  return repoUrl(repo, 'commit', sha);
}

/** Route params for `:path(.*)*` come back as an array of segments. */
export function joinPathParam(param: string | string[] | undefined): string {
  if (param === undefined) return '';
  return Array.isArray(param) ? param.join('/') : param;
}

/** Parent folder of a path ('' for top-level entries). */
export function parentPath(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

/** "1.4 KB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
