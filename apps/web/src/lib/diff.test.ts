import { describe, expect, it } from 'vitest';
import type { DiffLine, Hunk } from '../api';
import { splitRows } from './diff';

const ctx = (n: number): DiffLine => ({
  type: 'context',
  content: `c${n}`,
  oldLine: n,
  newLine: n,
});
const del = (n: number): DiffLine => ({ type: 'del', content: `d${n}`, oldLine: n, newLine: null });
const add = (n: number): DiffLine => ({ type: 'add', content: `a${n}`, oldLine: null, newLine: n });

const hunk = (lines: DiffLine[]): Hunk => ({
  header: '@@',
  oldStart: 1,
  oldLines: 0,
  newStart: 1,
  newLines: 0,
  section: '',
  lines,
});

describe('splitRows', () => {
  it('pairs deletions with the additions that replace them', () => {
    expect(splitRows(hunk([ctx(1), del(2), del(3), add(2), ctx(4)]))).toEqual([
      { left: ctx(1), right: ctx(1) },
      { left: del(2), right: add(2) },
      { left: del(3), right: null },
      { left: ctx(4), right: ctx(4) },
    ]);
  });

  it('puts lone additions on the right', () => {
    expect(splitRows(hunk([add(1), add(2)]))).toEqual([
      { left: null, right: add(1) },
      { left: null, right: add(2) },
    ]);
  });

  it('does not pair additions with deletions that come after them', () => {
    expect(splitRows(hunk([add(1), del(1)]))).toEqual([
      { left: null, right: add(1) },
      { left: del(1), right: null },
    ]);
  });
});
