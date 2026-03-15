import { describe, expect, it } from 'vitest';
import { bucketByWeek, parseShortlog } from './insights.js';

describe('parseShortlog', () => {
  it('reads counts, names and emails, most commits first', () => {
    expect(
      parseShortlog('     3\tBen Ode <ben@example.com>\n    12\tAna Pop <ana@example.com>\n'),
    ).toEqual([
      { name: 'Ana Pop', email: 'ana@example.com', commits: 12 },
      { name: 'Ben Ode', email: 'ben@example.com', commits: 3 },
    ]);
  });

  it('copes with authors without an email', () => {
    expect(parseShortlog('     1\tbuild-bot <>\n     2\tlegacy\n')).toEqual([
      { name: 'legacy', email: '', commits: 2 },
      { name: 'build-bot', email: '', commits: 1 },
    ]);
  });
});

describe('bucketByWeek', () => {
  const at = (iso: string) => Date.parse(iso);

  it('counts commits per Monday-based week up to the given date', () => {
    const weeks = bucketByWeek(
      [
        at('2026-03-02T09:00:00Z'), // Monday
        at('2026-03-08T23:59:00Z'), // Sunday, same week
        at('2026-03-09T00:00:00Z'), // next Monday
        at('2026-03-12T10:00:00Z'),
      ],
      at('2026-03-12T10:00:00Z'),
      3,
    );
    expect(weeks).toEqual([
      { start: '2026-02-23', commits: 0 },
      { start: '2026-03-02', commits: 2 },
      { start: '2026-03-09', commits: 2 },
    ]);
  });

  it('ignores commits outside the window', () => {
    const weeks = bucketByWeek([at('2020-01-01T00:00:00Z')], at('2026-03-12T00:00:00Z'), 4);
    expect(weeks.every((w) => w.commits === 0)).toBe(true);
    expect(weeks).toHaveLength(4);
  });
});
