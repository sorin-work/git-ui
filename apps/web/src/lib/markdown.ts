import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: false });

/**
 * Renders markdown from a repository to HTML that is safe to insert: READMEs
 * are written by anyone with push access, so scripts, event handlers and
 * javascript: links are stripped.
 */
export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false });
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
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
