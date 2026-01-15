import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: false });

export interface LinkResolver {
  /** URL for an image path relative to the markdown file. */
  image?: (path: string) => string;
  /** URL for a link to another file in the repository. */
  link?: (path: string) => string;
}

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/** Resolves `target` against the folder `base` ('' for the root), inside the repository. */
export function resolveRelative(base: string, target: string): string {
  const parts = target.startsWith('/') ? [] : base.split('/').filter(Boolean);
  for (const segment of target.split(/[?#]/)[0]!.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') parts.pop();
    else parts.push(decodeURIComponent(segment));
  }
  return parts.join('/');
}

/**
 * Renders markdown from a repository to HTML that is safe to insert: READMEs
 * are written by anyone with push access, so scripts, event handlers and
 * javascript: links are stripped. Relative image and link targets are
 * rewritten with `resolver` so they point into the repository.
 */
export function renderMarkdown(source: string, resolver: LinkResolver = {}): string {
  const html = marked.parse(source, { async: false });

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'IMG' && resolver.image) {
      const src = node.getAttribute('src');
      if (src && !ABSOLUTE.test(src)) node.setAttribute('src', resolver.image(src));
    }
    if (node.tagName === 'A' && resolver.link) {
      const href = node.getAttribute('href');
      if (href && !ABSOLUTE.test(href)) node.setAttribute('href', resolver.link(href));
    }
  });
  try {
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes');
  }
}

const README = /^readme(\.(md|markdown|txt|rst))?$/i;

/** Picks the README to show for a folder: markdown first, then plain text. */
export function findReadme<T extends { name: string; type: string }>(entries: T[]): T | null {
  const candidates = entries.filter((e) => e.type === 'blob' && README.test(e.name));
  return (
    candidates.find((e) => /\.(md|markdown)$/i.test(e.name)) ??
    candidates.find((e) => /^readme$/i.test(e.name)) ??
    candidates[0] ??
    null
  );
}

export function isMarkdown(name: string): boolean {
  return /\.(md|markdown)$/i.test(name);
}
