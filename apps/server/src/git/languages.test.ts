import { describe, expect, it } from 'vitest';
import { languageOf, languageShares } from './languages.js';

describe('languageOf', () => {
  it('maps extensions and well-known file names', () => {
    expect(languageOf('src/app.tsx')?.name).toBe('TypeScript');
    expect(languageOf('apps/server/Dockerfile')?.name).toBe('Dockerfile');
    expect(languageOf('LICENSE')).toBeNull();
  });
});

describe('languageShares', () => {
  it('adds up bytes per language, largest first', () => {
    const shares = languageShares([
      { path: 'src/a.ts', size: 600 },
      { path: 'src/b.ts', size: 200 },
      { path: 'src/App.vue', size: 150 },
      { path: 'README.md', size: 50 },
    ]);
    expect(shares.map((s) => [s.name, s.percent])).toEqual([
      ['TypeScript', 80],
      ['Vue', 15],
      ['Markdown', 5],
    ]);
  });

  it('skips lock files, dependencies and minified bundles', () => {
    const shares = languageShares([
      { path: 'src/index.js', size: 100 },
      { path: 'package-lock.json', size: 1_000_000 },
      { path: 'node_modules/x/index.js', size: 1_000_000 },
      { path: 'public/app.min.js', size: 1_000_000 },
    ]);
    expect(shares).toEqual([{ name: 'JavaScript', color: '#e9c400', bytes: 100, percent: 100 }]);
  });

  it('groups languages under 1% as Other', () => {
    const shares = languageShares([
      { path: 'a.py', size: 9950 },
      { path: 'b.sh', size: 30 },
      { path: 'c.sql', size: 20 },
    ]);
    expect(shares.map((s) => s.name)).toEqual(['Python', 'Other']);
    expect(shares[1]!.bytes).toBe(50);
  });

  it('is empty when nothing is recognised', () => {
    expect(languageShares([{ path: 'LICENSE', size: 1000 }])).toEqual([]);
  });
});
