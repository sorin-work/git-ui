import { describe, expect, it } from 'vitest';
import {
  blobUrl,
  commitsUrl,
  encodePath,
  formatBytes,
  joinPathParam,
  parentPath,
  treeUrl,
} from './paths';

describe('paths', () => {
  it('joins catch-all route params', () => {
    expect(joinPathParam(undefined)).toBe('');
    expect(joinPathParam(['src', 'lib', 'a.ts'])).toBe('src/lib/a.ts');
    expect(joinPathParam('README.md')).toBe('README.md');
  });

  it('finds the parent folder', () => {
    expect(parentPath('src/lib/a.ts')).toBe('src/lib');
    expect(parentPath('a.ts')).toBe('');
  });

  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [15_360, '15 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
  ])('formats %i bytes as %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});

describe('repository links', () => {
  it('keeps branch names with slashes in one path segment', () => {
    expect(treeUrl('notes', 'feature/login')).toBe('/notes/tree/feature%2Flogin');
    expect(commitsUrl('notes', 'release/2.0', 'src/a b.ts')).toBe(
      '/notes/commits/release%2F2.0?path=src%2Fa%20b.ts',
    );
  });

  it('encodes file names but keeps folder separators', () => {
    expect(blobUrl('notes', 'main', 'docs/C# notes?.md')).toBe(
      '/notes/blob/main/docs/C%23%20notes%3F.md',
    );
    expect(encodePath('über/café.md')).toBe('%C3%BCber/caf%C3%A9.md');
  });
});
