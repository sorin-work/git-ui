import { describe, expect, it } from 'vitest';
import { highlightLines, shouldHighlight, splitHighlightedLines } from './highlight';

describe('splitHighlightedLines', () => {
  it('closes and reopens spans that cross line breaks', () => {
    const html = '<span class="hljs-comment">/* one\ntwo */</span> x';
    expect(splitHighlightedLines(html)).toEqual([
      '<span class="hljs-comment">/* one</span>',
      '<span class="hljs-comment">two */</span> x',
    ]);
  });

  it('handles nested spans', () => {
    const html = '<span class="a"><span class="b">1\n2</span>3</span>';
    expect(splitHighlightedLines(html)).toEqual([
      '<span class="a"><span class="b">1</span></span>',
      '<span class="a"><span class="b">2</span>3</span>',
    ]);
  });
});

describe('highlightLines', () => {
  it('returns one entry per line without the trailing newline', () => {
    expect(highlightLines('a\nb\n', null)).toEqual(['a', 'b']);
  });

  it('escapes HTML in files without a known language', () => {
    expect(highlightLines('<script>alert(1)</script>', null)).toEqual([
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    ]);
  });

  it('escapes HTML inside highlighted code', () => {
    const [line] = highlightLines('const s = "<img onerror=x>";', 'javascript');
    expect(line).not.toContain('<img');
    expect(line).toContain('&lt;img');
  });

  it('does not highlight huge or minified files', () => {
    const minified = `var a=1;${'b<c&&d();'.repeat(1000)}`;
    const [line] = highlightLines(minified, 'javascript');
    expect(line).not.toContain('<span');
    expect(line).toContain('b&lt;c&amp;&amp;d();');
    expect(shouldHighlight('x\n'.repeat(100))).toBe(true);
    expect(shouldHighlight('x'.repeat(200_001))).toBe(false);
  });

  it('falls back to plain text for unregistered languages', () => {
    expect(highlightLines('x = 1', 'cobol')).toEqual(['x = 1']);
  });
});
