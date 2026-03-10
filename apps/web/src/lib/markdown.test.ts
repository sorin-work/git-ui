import { describe, expect, it } from 'vitest';
import { findReadme, renderMarkdown, resolveRelative } from './markdown';

describe('renderMarkdown', () => {
  it('renders GitHub-flavoured markdown', () => {
    const html = renderMarkdown('# Title\n\n| a | b |\n| - | - |\n| 1 | 2 |\n');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<table>');
  });

  it('removes scripts, event handlers and javascript: links', () => {
    const html = renderMarkdown(
      '<script>alert(1)</script>\n\n<img src="x.png" onerror="alert(2)">\n\n[click](javascript:alert(3))',
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
  });

  it('rewrites relative images and links but leaves absolute ones alone', () => {
    const html = renderMarkdown(
      '![logo](img/logo.png) ![remote](https://example.com/a.png) [guide](docs/guide.md) [top](#top)',
      { image: (p) => `/raw/${p}`, link: (p) => `/blob/${p}` },
    );
    expect(html).toContain('src="/raw/img/logo.png"');
    expect(html).toContain('src="https://example.com/a.png"');
    expect(html).toContain('href="/blob/docs/guide.md"');
    expect(html).toContain('href="#top"');
  });
});

describe('resolveRelative', () => {
  it.each([
    ['', 'img/a.png', 'img/a.png'],
    ['docs', 'img/a.png', 'docs/img/a.png'],
    ['docs/api', '../img/a.png', 'docs/img/a.png'],
    ['docs', '/root.md', 'root.md'],
    ['docs', './a%20b.md#section', 'docs/a b.md'],
    ['', '../../outside.md', 'outside.md'],
  ])('%j + %j -> %j', (base, target, expected) => {
    expect(resolveRelative(base, target)).toBe(expected);
  });
});

describe('findReadme', () => {
  const blob = (name: string) => ({ name, type: 'blob' });

  it('prefers markdown READMEs, in any case', () => {
    expect(findReadme([blob('README'), blob('readme.MD'), blob('index.ts')])?.name).toBe(
      'readme.MD',
    );
  });

  it('ignores folders called README and returns null when there is none', () => {
    expect(findReadme([{ name: 'README', type: 'tree' }])).toBeNull();
    expect(findReadme([blob('main.go')])).toBeNull();
  });
});
