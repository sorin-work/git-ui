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

  it('says "just now" for very recent commits and small clock skew', () => {
    expect(relativeTime('2026-03-10T11:59:40Z', now, 'en')).toBe('just now');
    expect(relativeTime('2026-03-10T12:00:20Z', now, 'en')).toBe('just now');
  });

  it('shows a plain date for commits dated in the future', () => {
    expect(relativeTime('2026-03-15T12:00:00Z', now, 'en')).toBe('Mar 15, 2026');
  });

  it.each([
    ['2026-03-10T11:58:50Z', '1 minute ago'],
    ['2026-03-10T09:00:00Z', '3 hours ago'],
    ['2026-03-09T12:00:00Z', 'yesterday'],
    ['2026-02-20T12:00:00Z', '3 weeks ago'],
    ['2025-03-10T12:00:00Z', 'last year'],
  ])('%s -> %s', (date, expected) => {
    expect(relativeTime(date, now, 'en')).toBe(expected);
  });
});
