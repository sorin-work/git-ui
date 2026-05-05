import { describe, expect, it } from 'vitest';
import { latestPerEntry, parseNameOnlyLog } from './latest.js';

const record = (sha: string, subject: string, files: string[]) =>
  `\x1e${sha}\x1f${subject}\x1fAna\x1f2026-05-01T10:00:00+00:00\0\n${files.join('\0')}\0`;

describe('parseNameOnlyLog', () => {
  it('reads commits and the files they touched', () => {
    const records = parseNameOnlyLog(
      record('b', 'Second', ['src/a.ts', 'src/lib/b.ts']) + record('a', 'First', ['README.md']),
    );
    expect(records).toEqual([
      {
        commit: { sha: 'b', subject: 'Second', author: 'Ana', date: '2026-05-01T10:00:00+00:00' },
        files: ['src/a.ts', 'src/lib/b.ts'],
      },
      {
        commit: { sha: 'a', subject: 'First', author: 'Ana', date: '2026-05-01T10:00:00+00:00' },
        files: ['README.md'],
      },
    ]);
  });
});

describe('latestPerEntry', () => {
  const records = parseNameOnlyLog(
    record('c3', 'Touch lib', ['src/lib/b.ts']) +
      record('c2', 'Touch both', ['src/a.ts', 'src/lib/c.ts']) +
      record('c1', 'Initial', ['src/a.ts', 'src/lib/b.ts', 'README.md']),
  );

  it('assigns each entry the newest commit that changed it or anything inside it', () => {
    const result = latestPerEntry(records, 'src', ['a.ts', 'lib']);
    expect(result['lib']?.sha).toBe('c3');
    expect(result['a.ts']?.sha).toBe('c2');
  });

  it('works at the repository root', () => {
    const result = latestPerEntry(records, '', ['src', 'README.md']);
    expect(result['src']?.sha).toBe('c3');
    expect(result['README.md']?.sha).toBe('c1');
  });

  it('leaves out entries it did not see', () => {
    expect(latestPerEntry(records, 'src', ['missing.ts'])).toEqual({});
  });
});
