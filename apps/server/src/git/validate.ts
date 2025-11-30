/**
 * Input checks for values that end up as git arguments. They are deliberately
 * stricter than git itself: anything unusual is rejected rather than escaped.
 */

const REF_CHARS = /^[A-Za-z0-9._/@+-]+$/;

/** A branch, tag or commit name that is safe to pass to git. */
export function isSafeRef(ref: string): boolean {
  return (
    ref.length > 0 &&
    ref.length <= 255 &&
    REF_CHARS.test(ref) &&
    !ref.startsWith('-') &&
    !ref.startsWith('/') &&
    !ref.endsWith('/') &&
    !ref.endsWith('.') &&
    !ref.endsWith('.lock') &&
    !ref.includes('..') &&
    !ref.includes('//') &&
    !ref.includes('@{')
  );
}

export function isSha(value: string): boolean {
  return /^[0-9a-f]{4,64}$/i.test(value);
}

/**
 * Normalizes a path inside a repository: no leading or trailing slashes and
 * no empty segments. Returns '' for the root and null for anything that tries
 * to leave the repository or contains control characters.
 */
export function normalizeRepoPath(input: string): string | null {
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\0-\x1f\\]/.test(input)) return null;
  const segments = input.split('/').filter((s) => s !== '');
  if (segments.some((s) => s === '.' || s === '..')) return null;
  return segments.join('/');
}

/** Repository names as they appear in URLs: a single directory name. */
export function isSafeRepoName(name: string): boolean {
  return /^[A-Za-z0-9._-]{1,100}$/.test(name) && !name.startsWith('.');
}
