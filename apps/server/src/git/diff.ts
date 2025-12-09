export type FileStatus = 'added' | 'deleted' | 'modified' | 'renamed' | 'copied';

export interface DiffLine {
  type: 'context' | 'add' | 'del';
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface Hunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Function or section name git puts after the second @@, if any. */
  section: string;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  oldPath: string | null;
  status: FileStatus;
  binary: boolean;
  additions: number;
  deletions: number;
  /** Similarity percentage for renames and copies. */
  similarity: number | null;
  oldMode: string | null;
  newMode: string | null;
  hunks: Hunk[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

function stripPrefix(path: string): string {
  return path.replace(/^[ab]\//, '');
}

function newFile(header: string): FileDiff {
  // "diff --git a/old b/new". Paths may contain spaces, so prefer the ---/+++
  // and rename lines when they exist; this is only the fallback.
  const rest = header.slice('diff --git '.length);
  const split = rest.indexOf(' b/');
  const oldPath = stripPrefix(split === -1 ? rest : rest.slice(0, split));
  const path = split === -1 ? oldPath : rest.slice(split + 3);
  return {
    path,
    oldPath: oldPath === path ? null : oldPath,
    status: 'modified',
    binary: false,
    additions: 0,
    deletions: 0,
    similarity: null,
    oldMode: null,
    newMode: null,
    hunks: [],
  };
}

/** Parses unified diff output (`git diff`, `git show --patch`) into files and hunks. */
export function parseDiff(patch: string): FileDiff[] {
  const files: FileDiff[] = [];
  let file: FileDiff | null = null;
  let hunk: Hunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      file = newFile(line);
      files.push(file);
      hunk = null;
      continue;
    }
    if (!file) continue;

    if (hunk === null) {
      if (line.startsWith('new file mode ')) {
        file.status = 'added';
        file.newMode = line.slice('new file mode '.length);
      } else if (line.startsWith('deleted file mode ')) {
        file.status = 'deleted';
        file.oldMode = line.slice('deleted file mode '.length);
      } else if (line.startsWith('old mode ')) {
        file.oldMode = line.slice('old mode '.length);
      } else if (line.startsWith('new mode ')) {
        file.newMode = line.slice('new mode '.length);
      } else if (line.startsWith('rename from ')) {
        file.status = 'renamed';
        file.oldPath = line.slice('rename from '.length);
      } else if (line.startsWith('rename to ')) {
        file.path = line.slice('rename to '.length);
      } else if (line.startsWith('copy from ')) {
        file.status = 'copied';
        file.oldPath = line.slice('copy from '.length);
      } else if (line.startsWith('copy to ')) {
        file.path = line.slice('copy to '.length);
      } else if (line.startsWith('similarity index ')) {
        file.similarity = Number.parseInt(line.slice('similarity index '.length), 10);
      } else if (line.startsWith('Binary files ') || line === 'GIT binary patch') {
        file.binary = true;
      } else if (line.startsWith('--- ')) {
        const old = line.slice(4);
        if (old !== '/dev/null' && file.status !== 'renamed' && file.status !== 'copied') {
          file.oldPath = stripPrefix(old) === file.path ? null : stripPrefix(old);
        }
      } else if (line.startsWith('+++ ')) {
        const next = line.slice(4);
        if (next !== '/dev/null') file.path = stripPrefix(next);
      }
    }

    const header = HUNK_HEADER.exec(line);
    if (header) {
      const [, oldStart, oldCount, newStart, newCount, section] = header;
      hunk = {
        header: line,
        oldStart: Number(oldStart),
        oldLines: oldCount === undefined ? 1 : Number(oldCount),
        newStart: Number(newStart),
        newLines: newCount === undefined ? 1 : Number(newCount),
        section: section ?? '',
        lines: [],
      };
      file.hunks.push(hunk);
      oldLine = hunk.oldStart;
      newLine = hunk.newStart;
      continue;
    }
    if (!hunk) continue;

    const marker = line[0];
    const content = line.slice(1);
    if (marker === '+') {
      hunk.lines.push({ type: 'add', content, oldLine: null, newLine: newLine++ });
      file.additions++;
    } else if (marker === '-') {
      hunk.lines.push({ type: 'del', content, oldLine: oldLine++, newLine: null });
      file.deletions++;
    } else if (marker === ' ' || marker === '\\') {
      hunk.lines.push({ type: 'context', content, oldLine: oldLine++, newLine: newLine++ });
    }
  }

  return files;
}
