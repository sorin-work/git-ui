export interface FuzzyMatch {
  score: number;
  /** Indexes in the text of the matched characters, for highlighting. */
  positions: number[];
}

const isBoundary = (text: string, i: number) => i === 0 || '/._- '.includes(text[i - 1]!);

/**
 * Greedy subsequence match starting at `start`. When a character also occurs
 * a little later at the start of a word, that occurrence is preferred, so
 * "fs" matches the F and S of "file-store" rather than "fileS".
 */
function matchFrom(query: string, lower: string, text: string, start: number): number[] | null {
  const positions: number[] = [];
  let from = start;
  for (const char of query) {
    let at = lower.indexOf(char, from);
    if (at === -1) return null;
    const continues = positions.at(-1) === at - 1;
    if (!continues && !isBoundary(text, at)) {
      for (let k = at + 1; k < Math.min(lower.length, at + 12); k++) {
        if (lower[k] === char && isBoundary(text, k)) {
          at = k;
          break;
        }
      }
    }
    positions.push(at);
    from = at + 1;
  }
  return positions;
}

/**
 * Matches `query` as a subsequence of `text`, case-insensitively, like the
 * "go to file" box of most editors. Higher scores are better: consecutive
 * characters, matches at the start of a word and matches in the file name
 * (rather than its folders) count extra. Returns null when it doesn't match.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return { score: 0, positions: [] };
  const lower = text.toLowerCase();
  const nameStart = text.lastIndexOf('/') + 1;

  // Matching inside the file name beats matching across folders.
  const positions = matchFrom(q, lower, text, nameStart) ?? matchFrom(q, lower, text, 0);
  if (!positions) return null;

  let score = 0;
  positions.forEach((at, i) => {
    score += 1;
    if (i > 0 && positions[i - 1] === at - 1) score += 5;
    if (isBoundary(text, at)) score += 3;
    if (at >= nameStart) score += 2;
  });
  // Shorter paths win ties.
  score -= text.length / 100;
  return { score, positions };
}

/** The best `limit` matches, highest score first. */
export function fuzzyFilter(query: string, items: string[], limit = 50) {
  const matches: { item: string; match: FuzzyMatch }[] = [];
  for (const item of items) {
    const match = fuzzyMatch(query, item);
    if (match) matches.push({ item, match });
  }
  return matches.sort((a, b) => b.match.score - a.match.score).slice(0, limit);
}
