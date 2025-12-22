/** Links inside a repository. */

export function treeUrl(repo: string, ref: string, path = ''): string {
  return `/${repo}/tree/${ref}${path ? `/${path}` : ''}`;
}

export function blobUrl(repo: string, ref: string, path: string): string {
  return `/${repo}/blob/${ref}/${path}`;
}

export function commitsUrl(repo: string, ref: string, path = ''): string {
  return `/${repo}/commits/${ref}${path ? `?path=${encodeURIComponent(path)}` : ''}`;
}

export function commitUrl(repo: string, sha: string): string {
  return `/${repo}/commit/${sha}`;
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
