// Shapes returned by the server.

export interface CommitBrief {
  sha: string;
  subject: string;
  author: string;
  date: string;
}

export interface RepoSummary {
  name: string;
  description: string | null;
  bare: boolean;
  defaultBranch: string | null;
  lastCommit: CommitBrief | null;
}

export interface Repo extends RepoSummary {
  branches: number;
  tags: number;
}

export type EntryType = 'tree' | 'blob' | 'commit';

export interface TreeEntry {
  name: string;
  path: string;
  type: EntryType;
  mode: string;
  sha: string;
  size: number | null;
}

export interface Tree {
  ref: string;
  commit: string;
  path: string;
  entries: TreeEntry[];
}

export interface Blob {
  ref: string;
  commit: string;
  path: string;
  name: string;
  language: string | null;
  image: boolean;
  size: number;
  binary: boolean;
  truncated: boolean;
  content: string | null;
}

export interface Person {
  name: string;
  email: string;
  date: string;
}

export interface CommitSummary {
  sha: string;
  shortSha: string;
  parents: string[];
  author: Person;
  committer: Person;
  subject: string;
}

export interface CommitDetail extends CommitSummary {
  body: string;
}

export interface CommitPage {
  ref: string;
  commit: string;
  page: number;
  pageSize: number;
  hasMore: boolean;
  items: CommitSummary[];
}

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
  section: string;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  oldPath: string | null;
  status: 'added' | 'deleted' | 'modified' | 'renamed' | 'copied';
  binary: boolean;
  additions: number;
  deletions: number;
  similarity: number | null;
  oldMode: string | null;
  newMode: string | null;
  hunks: Hunk[];
}

export interface DiffStats {
  files: number;
  additions: number;
  deletions: number;
}

export interface CommitWithDiff {
  commit: CommitDetail;
  files: FileDiff[];
  stats: DiffStats;
}

export interface Branch {
  name: string;
  sha: string;
  date: string;
  subject: string;
  author: string;
  isDefault: boolean;
  ahead: number;
  behind: number;
}

export interface Tag {
  name: string;
  sha: string;
  date: string;
  annotated: boolean;
  subject: string;
}
