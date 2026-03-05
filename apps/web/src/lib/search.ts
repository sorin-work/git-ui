export interface TextPart {
  text: string;
  match: boolean;
}

/**
 * Splits `text` into the parts that match `query` and the rest, so the
 * matches can be highlighted without building HTML strings.
 */
export function splitMatches(text: string, query: string, caseSensitive = false): TextPart[] {
  if (!query) return [{ text, match: false }];
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const parts: TextPart[] = [];
  let from = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}
