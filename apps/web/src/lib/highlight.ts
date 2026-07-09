import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import dart from 'highlight.js/lib/languages/dart';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import elixir from 'highlight.js/lib/languages/elixir';
import go from 'highlight.js/lib/languages/go';
import graphql from 'highlight.js/lib/languages/graphql';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import less from 'highlight.js/lib/languages/less';
import lua from 'highlight.js/lib/languages/lua';
import makefile from 'highlight.js/lib/languages/makefile';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scala from 'highlight.js/lib/languages/scala';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const LANGUAGES = {
  bash,
  c,
  cpp,
  csharp,
  css,
  dart,
  diff,
  dockerfile,
  elixir,
  go,
  graphql,
  ini,
  java,
  javascript,
  json,
  kotlin,
  less,
  lua,
  makefile,
  markdown,
  php,
  python,
  ruby,
  rust,
  scala,
  scss,
  sql,
  swift,
  typescript,
  xml,
  yaml,
};

for (const [name, definition] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, definition);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * highlight.js returns one HTML string for the whole file, and a token such as
 * a multi-line comment can span several lines. Splits that HTML into one
 * string per line, closing open spans at the end of a line and reopening them
 * on the next, so every line is valid HTML on its own.
 */
export function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let current = '';

  const tag = /<span[^>]*>|<\/span>|\n/g;
  let last = 0;
  for (let match = tag.exec(html); match; match = tag.exec(html)) {
    current += html.slice(last, match.index);
    last = match.index + match[0].length;
    if (match[0] === '\n') {
      lines.push(current + '</span>'.repeat(open.length));
      current = open.join('');
    } else if (match[0] === '</span>') {
      open.pop();
      current += match[0];
    } else {
      open.push(match[0]);
      current += match[0];
    }
  }
  lines.push(current + html.slice(last));
  return lines;
}

/**
 * Above these sizes highlighting is skipped: highlight.js runs on the main
 * thread and a large minified bundle (one enormous line) could freeze the tab
 * for seconds.
 */
export const MAX_HIGHLIGHT_CHARS = 200_000;
export const MAX_HIGHLIGHT_LINE = 3_000;

export function shouldHighlight(text: string): boolean {
  if (text.length > MAX_HIGHLIGHT_CHARS) return false;
  let lineStart = 0;
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) {
    if (i - lineStart > MAX_HIGHLIGHT_LINE) return false;
    lineStart = i + 1;
  }
  return text.length - lineStart <= MAX_HIGHLIGHT_LINE;
}

/** Highlighted HTML for each line of `code`. Unknown languages are escaped plain text. */
export function highlightLines(code: string, language: string | null): string[] {
  const text = code.endsWith('\n') ? code.slice(0, -1) : code;
  if (!language || !hljs.getLanguage(language) || !shouldHighlight(text)) {
    return text.split('\n').map(escapeHtml);
  }
  const html = hljs.highlight(text, { language, ignoreIllegals: true }).value;
  return splitHighlightedLines(html);
}
