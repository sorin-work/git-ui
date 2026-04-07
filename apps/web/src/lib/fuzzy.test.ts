import { describe, expect, it } from 'vitest';
import { fuzzyFilter, fuzzyMatch } from './fuzzy';

describe('fuzzyMatch', () => {
  it('matches characters in order, ignoring case', () => {
    expect(fuzzyMatch('rdm', 'README.md')?.positions).toEqual([0, 3, 4]);
    expect(fuzzyMatch('xyz', 'README.md')).toBeNull();
    expect(fuzzyMatch('mdr', 'README.md')).toBeNull();
  });

  it('matches everything for an empty query', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({ score: 0, positions: [] });
  });
});

describe('fuzzyFilter', () => {
  const files = [
    'docs/storage/overview.md',
    'src/storage/file-store.ts',
    'src/store.ts',
    'test/store.test.ts',
    'README.md',
  ];

  it('ranks file-name and consecutive matches first', () => {
    const results = fuzzyFilter('store', files).map((r) => r.item);
    expect(results[0]).toBe('src/store.ts');
    expect(results).not.toContain('README.md');
  });

  it('understands abbreviations of the file name', () => {
    expect(fuzzyFilter('fst', files)[0]?.item).toBe('src/storage/file-store.ts');
  });

  it('limits the number of results', () => {
    expect(fuzzyFilter('s', files, 2)).toHaveLength(2);
  });
});
