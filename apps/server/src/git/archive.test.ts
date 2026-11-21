import { describe, expect, it } from 'vitest';
import { filterOverrides, parseConfigList } from './archive.js';

describe('archive safety', () => {
  it('parses NUL-separated config listings, values with newlines included', () => {
    expect(
      parseConfigList('filter.lfs.smudge\ngit-lfs smudge\0filter.x.y.required\ntrue\0a.b\0'),
    ).toEqual([
      ['filter.lfs.smudge', 'git-lfs smudge'],
      ['filter.x.y.required', 'true'],
      ['a.b', ''],
    ]);
    expect(parseConfigList('k\nline one\nline two\0')).toEqual([['k', 'line one\nline two']]);
  });

  it('blanks every command of each filter driver', () => {
    expect(filterOverrides(['lfs', 'a.b'])).toEqual([
      '-c',
      'filter.lfs.smudge=',
      '-c',
      'filter.lfs.process=',
      '-c',
      'filter.lfs.required=false',
      '-c',
      'filter.a.b.smudge=',
      '-c',
      'filter.a.b.process=',
      '-c',
      'filter.a.b.required=false',
    ]);
  });
});
