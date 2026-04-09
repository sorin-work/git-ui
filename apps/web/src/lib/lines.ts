export interface LineRange {
  start: number;
  end: number;
}

/** "#L12" -> 12..12, "#L20-L12" -> 12..20, anything else -> null. */
export function parseLineHash(hash: string): LineRange | null {
  const match = /^#L(\d+)(?:-L?(\d+))?$/.exec(hash);
  if (!match) return null;
  const a = Number(match[1]);
  const b = match[2] === undefined ? a : Number(match[2]);
  if (a < 1 || b < 1) return null;
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

export function lineHash(range: LineRange): string {
  return range.start === range.end ? `#L${range.start}` : `#L${range.start}-L${range.end}`;
}
