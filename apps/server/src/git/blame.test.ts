import { describe, expect, it } from 'vitest';
import { parseBlame } from './blame.js';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

const PORCELAIN = [
  `${A} 1 1 2`,
  'author Ana Pop',
  'author-mail <ana@example.com>',
  'author-time 1767225600',
  'author-tz +0000',
  'committer Ana Pop',
  'committer-mail <ana@example.com>',
  'committer-time 1767225600',
  'committer-tz +0000',
  'summary Initial commit',
  'filename app.js',
  '\tconst a = 1;',
  `${A} 2 2`,
  '\tconst b = 2;',
  `${B} 3 3 1`,
  'author Ben Ode',
  'author-mail <ben@example.com>',
  'author-time 1767312000',
  'author-tz +0200',
  'committer Ben Ode',
  'committer-mail <ben@example.com>',
  'committer-time 1767312000',
  'committer-tz +0200',
  'summary Log the sum',
  `previous ${A} app.js`,
  'filename app.js',
  '\tconsole.log(a + b);',
  '',
].join('\n');

describe('parseBlame', () => {
  it('attributes every line to a commit', () => {
    const { lines } = parseBlame(PORCELAIN);
    expect(lines).toEqual([
      { number: 1, content: 'const a = 1;', sha: A, originalNumber: 1 },
      { number: 2, content: 'const b = 2;', sha: A, originalNumber: 2 },
      { number: 3, content: 'console.log(a + b);', sha: B, originalNumber: 3 },
    ]);
  });

  it('collects commit details once per commit', () => {
    const { commits } = parseBlame(PORCELAIN);
    expect(commits).toEqual({
      [A]: {
        author: 'Ana Pop',
        email: 'ana@example.com',
        date: '2026-01-01T00:00:00.000Z',
        summary: 'Initial commit',
      },
      [B]: {
        author: 'Ben Ode',
        email: 'ben@example.com',
        date: '2026-01-02T00:00:00.000Z',
        summary: 'Log the sum',
      },
    });
  });

  it('keeps tabs and leading whitespace in content', () => {
    const { lines } = parseBlame(`${A} 1 1 1\nauthor X\nsummary s\n\t\t  indented\n`);
    expect(lines[0]!.content).toBe('\t  indented');
  });

  it('returns nothing for empty output', () => {
    expect(parseBlame('')).toEqual({ lines: [], commits: {} });
  });
});
