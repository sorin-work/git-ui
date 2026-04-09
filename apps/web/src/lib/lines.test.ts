import { describe, expect, it } from 'vitest';
import { lineHash, parseLineHash } from './lines';

describe('line anchors', () => {
  it.each([
    ['#L12', { start: 12, end: 12 }],
    ['#L10-L20', { start: 10, end: 20 }],
    ['#L20-L10', { start: 10, end: 20 }],
    ['#L3-7', { start: 3, end: 7 }],
  ])('parses %s', (hash, range) => {
    expect(parseLineHash(hash)).toEqual(range);
  });

  it.each(['', '#', '#L', '#L0', '#top', '#L1-'])('ignores %j', (hash) => {
    expect(parseLineHash(hash)).toBeNull();
  });

  it('formats single lines and ranges', () => {
    expect(lineHash({ start: 5, end: 5 })).toBe('#L5');
    expect(lineHash({ start: 5, end: 9 })).toBe('#L5-L9');
  });
});
