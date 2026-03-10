import { describe, expect, it } from 'vitest';
import { formatBytes, joinPathParam, parentPath } from './paths';

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
