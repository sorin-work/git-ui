import type { DiffLine, Hunk } from '../api';

export interface SplitRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

/**
 * Lays a hunk out side by side: context lines appear on both sides, and each
 * run of deletions is paired line by line with the additions that follow it.
 */
export function splitRows(hunk: Hunk): SplitRow[] {
  const rows: SplitRow[] = [];
  let removed: DiffLine[] = [];
  let added: DiffLine[] = [];

  const flush = () => {
    for (let i = 0; i < Math.max(removed.length, added.length); i++) {
      rows.push({ left: removed[i] ?? null, right: added[i] ?? null });
    }
    removed = [];
    added = [];
  };

  for (const line of hunk.lines) {
    if (line.type === 'del') {
      if (added.length) flush();
      removed.push(line);
    } else if (line.type === 'add') {
      added.push(line);
    } else {
      flush();
      rows.push({ left: line, right: line });
    }
  }
  flush();
  return rows;
}

export type DiffMode = 'unified' | 'split';

const STORAGE_KEY = 'git-ui:diff-mode';

export function savedDiffMode(): DiffMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'split' ? 'split' : 'unified';
  } catch {
    return 'unified';
  }
}

export function saveDiffMode(mode: DiffMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage may be disabled; the choice just won't be remembered.
  }
}
