import { describe, expect, it } from 'vitest';
import { isSafeRef, isSafeRepoName, isSha, normalizeRepoPath } from './validate.js';

describe('isSafeRef', () => {
  it.each([
    'main',
    'feature/login-form',
    'v1.2.3',
    'release-2025.11',
    'HEAD',
    'a1b2c3d',
    'user@host',
  ])('accepts %s', (ref) => {
    expect(isSafeRef(ref)).toBe(true);
  });

  it.each([
    '',
    '-n',
    '--output=/tmp/x',
    '/main',
    'main/',
    'a..b',
    'a//b',
    'main.lock',
    'main@{1}',
    'with space',
    'semi;colon',
    '$(id)',
    'x'.repeat(256),
  ])('rejects %j', (ref) => {
    expect(isSafeRef(ref)).toBe(false);
  });
});

describe('isSha', () => {
  it('accepts abbreviated and full hashes', () => {
    expect(isSha('a1b2')).toBe(true);
    expect(isSha('0123456789abcdef0123456789abcdef01234567')).toBe(true);
  });

  it('rejects other strings', () => {
    expect(isSha('abc')).toBe(false);
    expect(isSha('main')).toBe(false);
    expect(isSha('g123456')).toBe(false);
  });
});

describe('normalizeRepoPath', () => {
  it.each([
    ['', ''],
    ['/', ''],
    ['src', 'src'],
    ['/src/lib/', 'src/lib'],
    ['src//lib', 'src/lib'],
    ['docs/My File.md', 'docs/My File.md'],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeRepoPath(input)).toBe(expected);
  });

  it.each(['../etc/passwd', 'src/../../x', './src', 'a\0b', 'a\\b', 'line\nbreak'])(
    'rejects %j',
    (input) => {
      expect(normalizeRepoPath(input)).toBeNull();
    },
  );
});

describe('isSafeRepoName', () => {
  it('accepts plain directory names', () => {
    expect(isSafeRepoName('git-ui')).toBe(true);
    expect(isSafeRepoName('project.git')).toBe(true);
  });

  it('rejects traversal and hidden names', () => {
    expect(isSafeRepoName('..')).toBe(false);
    expect(isSafeRepoName('.hidden')).toBe(false);
    expect(isSafeRepoName('a/b')).toBe(false);
  });
});
