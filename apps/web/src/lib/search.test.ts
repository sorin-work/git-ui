import { describe, expect, it } from 'vitest';
import { splitMatches } from './search';

describe('splitMatches', () => {
  it('marks every occurrence, ignoring case by default', () => {
    expect(splitMatches('Total and subtotal', 'total')).toEqual([
      { text: 'Total', match: true },
      { text: ' and sub', match: false },
      { text: 'total', match: true },
    ]);
  });

  it('can match case exactly', () => {
    expect(splitMatches('Total total', 'total', true)).toEqual([
      { text: 'Total ', match: false },
      { text: 'total', match: true },
    ]);
  });

  it('returns the text unchanged without a query or a match', () => {
    expect(splitMatches('abc', '')).toEqual([{ text: 'abc', match: false }]);
    expect(splitMatches('abc', 'x')).toEqual([{ text: 'abc', match: false }]);
  });
});
