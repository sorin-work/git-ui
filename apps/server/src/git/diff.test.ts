import { describe, expect, it } from 'vitest';
import { parseDiff } from './diff.js';

const lines = (...parts: string[]) => parts.join('\n') + '\n';

describe('parseDiff', () => {
  it('parses a modified file with two hunks and section names', () => {
    const [file] = parseDiff(
      lines(
        'diff --git a/src/math.ts b/src/math.ts',
        'index 1111111..2222222 100644',
        '--- a/src/math.ts',
        '+++ b/src/math.ts',
        '@@ -1,3 +1,3 @@',
        ' export const one = 1;',
        '-export const two = 3;',
        '+export const two = 2;',
        ' export const three = 3;',
        '@@ -10,2 +10,3 @@ export function add(a: number, b: number) {',
        '   return a + b;',
        '+  // done',
        ' }',
      ),
    );

    expect(file).toMatchObject({
      path: 'src/math.ts',
      oldPath: null,
      status: 'modified',
      additions: 2,
      deletions: 1,
    });
    expect(file!.hunks).toHaveLength(2);
    expect(file!.hunks[1]).toMatchObject({
      oldStart: 10,
      oldLines: 2,
      newStart: 10,
      newLines: 3,
      section: 'export function add(a: number, b: number) {',
    });
    expect(file!.hunks[0]!.lines).toEqual([
      { type: 'context', content: 'export const one = 1;', oldLine: 1, newLine: 1 },
      { type: 'del', content: 'export const two = 3;', oldLine: 2, newLine: null },
      { type: 'add', content: 'export const two = 2;', oldLine: null, newLine: 2 },
      { type: 'context', content: 'export const three = 3;', oldLine: 3, newLine: 3 },
    ]);
    expect(file!.hunks[1]!.lines.map((l) => [l.oldLine, l.newLine])).toEqual([
      [10, 10],
      [null, 11],
      [11, 12],
    ]);
  });

  it('parses added and deleted files', () => {
    const files = parseDiff(
      lines(
        'diff --git a/new.txt b/new.txt',
        'new file mode 100644',
        'index 0000000..3b18e51',
        '--- /dev/null',
        '+++ b/new.txt',
        '@@ -0,0 +1 @@',
        '+hello',
        'diff --git a/gone.txt b/gone.txt',
        'deleted file mode 100644',
        'index 3b18e51..0000000',
        '--- a/gone.txt',
        '+++ /dev/null',
        '@@ -1 +0,0 @@',
        '-bye',
      ),
    );
    expect(
      files.map((f) => [f.path, f.status, f.additions, f.deletions, f.newMode, f.oldMode]),
    ).toEqual([
      ['new.txt', 'added', 1, 0, '100644', null],
      ['gone.txt', 'deleted', 0, 1, null, '100644'],
    ]);
    expect(files[0]!.hunks[0]).toMatchObject({
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: 1,
    });
  });

  it('parses renames with and without changes', () => {
    const files = parseDiff(
      lines(
        'diff --git a/a.txt b/b.txt',
        'similarity index 100%',
        'rename from a.txt',
        'rename to b.txt',
        'diff --git a/lib/old.js b/lib/new.js',
        'similarity index 80%',
        'rename from lib/old.js',
        'rename to lib/new.js',
        'index 1111111..2222222 100644',
        '--- a/lib/old.js',
        '+++ b/lib/new.js',
        '@@ -1 +1 @@',
        '-a',
        '+b',
      ),
    );
    expect(files.map((f) => [f.oldPath, f.path, f.status, f.similarity])).toEqual([
      ['a.txt', 'b.txt', 'renamed', 100],
      ['lib/old.js', 'lib/new.js', 'renamed', 80],
    ]);
    expect(files[1]!.hunks).toHaveLength(1);
  });

  it('marks binary files and mode changes', () => {
    const files = parseDiff(
      lines(
        'diff --git a/logo.png b/logo.png',
        'index 1111111..2222222 100644',
        'Binary files a/logo.png and b/logo.png differ',
        'diff --git a/run.sh b/run.sh',
        'old mode 100644',
        'new mode 100755',
      ),
    );
    expect(files[0]).toMatchObject({ path: 'logo.png', binary: true, hunks: [] });
    expect(files[1]).toMatchObject({ path: 'run.sh', oldMode: '100644', newMode: '100755' });
  });

  it('keeps paths with spaces intact', () => {
    const [file] = parseDiff(
      lines(
        'diff --git a/docs/My Notes.md b/docs/My Notes.md',
        'index 1111111..2222222 100644',
        '--- a/docs/My Notes.md',
        '+++ b/docs/My Notes.md',
        '@@ -1 +1 @@',
        '-a',
        '+b',
      ),
    );
    expect(file!.path).toBe('docs/My Notes.md');
    expect(file!.oldPath).toBeNull();
  });

  it('flags lines without a final newline instead of counting them', () => {
    const [file] = parseDiff(
      lines(
        'diff --git a/a.txt b/a.txt',
        'index 1111111..2222222 100644',
        '--- a/a.txt',
        '+++ b/a.txt',
        '@@ -1,2 +1,3 @@',
        ' first',
        '-last',
        '\\ No newline at end of file',
        '+last',
        '+added',
      ),
    );
    expect(file!.hunks[0]!.lines).toEqual([
      { type: 'context', content: 'first', oldLine: 1, newLine: 1 },
      { type: 'del', content: 'last', oldLine: 2, newLine: null, noNewline: true },
      { type: 'add', content: 'last', oldLine: null, newLine: 2 },
      { type: 'add', content: 'added', oldLine: null, newLine: 3 },
    ]);
    expect(file).toMatchObject({ additions: 2, deletions: 1 });
  });

  it('returns nothing for an empty diff', () => {
    expect(parseDiff('')).toEqual([]);
  });
});
