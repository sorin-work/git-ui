import { describe, expect, it } from 'vitest';
import { plural } from './text';
import { relativeTime } from './time';

describe('plural', () => {
  it('picks the right form', () => {
    expect(plural(1, 'branch', 'branches')).toBe('1 branch');
    expect(plural(2, 'branch', 'branches')).toBe('2 branches');
    expect(plural(0, 'file')).toBe('0 files');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-03-10T12:00:00Z');

  it.each([
    ['2026-03-10T11:59:30Z', '30 seconds ago'],
    ['2026-03-10T09:00:00Z', '3 hours ago'],
    ['2026-03-09T12:00:00Z', 'yesterday'],
    ['2026-02-20T12:00:00Z', '3 weeks ago'],
    ['2025-03-10T12:00:00Z', 'last year'],
  ])('%s -> %s', (date, expected) => {
    expect(relativeTime(date, now, 'en')).toBe(expected);
  });
});
