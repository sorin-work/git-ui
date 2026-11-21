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

/**
 * The ref to put in a URL for a tag. A bare name means the branch when a
 * branch and a tag share it (the server looks for branches first), so such
 * a tag is linked by its full name.
 */
export function tagRef(name: string, branches: Iterable<string>): string {
  for (const branch of branches) if (branch === name) return `refs/tags/${name}`;
  return name;
}

/** How a ref from a URL is shown: short shas and names without refs/heads/ or refs/tags/. */
export function refLabel(ref: string): string {
  if (/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(ref)) return ref.slice(0, 7);
  return ref.replace(/^refs\/(heads|tags)\//, '');
}
