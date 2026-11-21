import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { pipeline, Readable } from 'node:stream';
import { promisify } from 'node:util';
import { createGzip, deflateRaw } from 'node:zlib';
import { HttpError } from '../lib/errors.js';
import { TAR_END, tarGlobalHeader, tarHeader, tarPadding, type ArchiveEntry } from '../lib/tar.js';
import { fitsInZip, ZipWriter } from '../lib/zip.js';
import type { RepoLocation } from './repos.js';
import { git, GitError, gitBuffer, gitProcess } from './run.js';

export type ArchiveFormat = 'zip' | 'tar.gz';

const deflate = promisify(deflateRaw);

/**
 * Archives are built here rather than by `git archive`. `git archive` runs
 * the filter driver (smudge or process command) that a file's attributes
 * name, and the tar compressors set in config, and the repository chooses
 * both. Reading objects with `ls-tree` and `cat-file --batch` (no
 * `--filters`, no `--textconv`) never looks at attributes, so no config can
 * add a program, whatever it says and whenever it changes.
 *
 * What is lost: `export-ignore` and `export-subst` attributes are not
 * applied. Files are archived exactly as they are stored in git.
 */

/** A zip holds each file in memory while it is compressed; tar streams. */
export const MAX_ZIP_FILE_BYTES = 100 * 1024 * 1024;
/** Symlink targets are read before anything is sent; git's own limit is PATH_MAX. */
const MAX_LINK_BYTES = 4096;

export interface TreeRecord {
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size: number | null;
  /** The path as git stores it: bytes, not necessarily UTF-8. */
  path: Buffer;
}

const HEADER = /^(\d{6}) (blob|tree|commit) ([0-9a-f]+) +(-|\d+|BAD)$/;

/**
 * Parses `ls-tree -r -t -z --long` output, keeping paths as bytes. Unlike
 * the tree view it fails on anything it does not understand: git prints the
 * size "BAD" for an object it cannot read, and leaving that file out would
 * make an incomplete archive look complete.
 */
export function parseArchiveTree(output: Buffer): TreeRecord[] {
  const records: TreeRecord[] = [];
  let start = 0;
  while (start < output.length) {
    let end = output.indexOf(0, start);
    if (end === -1) end = output.length;
    const record = output.subarray(start, end);
    start = end + 1;
    if (record.length === 0) continue;
    const tab = record.indexOf(9);
    const match = tab === -1 ? null : HEADER.exec(record.subarray(0, tab).toString('latin1'));
    if (!match || match[4] === 'BAD') {
      throw new GitError(['ls-tree'], null, `cannot read "${record.toString('utf8')}"`);
    }
    records.push({
      mode: match[1]!,
      type: match[2] as TreeRecord['type'],
      sha: match[3]!,
      size: match[4] === '-' ? null : Number(match[4]),
      path: Buffer.from(record.subarray(tab + 1)),
    });
  }
  return records;
}

const isLink = (r: TreeRecord) => r.type === 'blob' && r.mode === '120000';

/** A path as a string with one character per byte, for comparing and as a key. */
const key = (path: Buffer) => path.toString('latin1');

/**
 * Why a tree cannot be archived safely, or null. git refuses to check out
 * such trees, but they can be built by hand, and an archive of one would
 * write outside its folder when unpacked: `..`, `.` or empty components, a
 * `.git` folder, two entries with the same path (a symlink and a folder
 * called `link`, then `link/file` goes through the link), anything below a
 * symlink, and symlinks that point at an absolute path or climb out of the
 * archive. `links` holds each symlink's target, keyed by `key()`.
 */
export function unsafeTreeReason(records: TreeRecord[], links: Map<string, Buffer>): string | null {
  const seen = new Set<string>();
  const symlinks = new Set<string>();
  for (const record of records) {
    const name = key(record.path);
    for (const part of name.split('/')) {
      if (part === '' || part === '.' || part === '..')
        return `the path "${name}" leaves its folder`;
      if (part.toLowerCase() === '.git') return `the path "${name}" contains .git`;
    }
    if (seen.has(name)) return `"${name}" appears twice`;
    seen.add(name);
    if (isLink(record)) symlinks.add(name);
  }

  for (const record of records) {
    const name = key(record.path);
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) {
      if (symlinks.has(parts.slice(0, i).join('/'))) return `"${name}" is inside a symlink`;
    }
    if (!isLink(record)) continue;

    const target = links.get(name);
    if (!target) return `the target of "${name}" is missing`;
    if (target.includes(0)) return `the symlink "${name}" is not a path`;
    if (target[0] === 0x2f) return `the symlink "${name}" points at an absolute path`;
    // Depth below the archive's root folder, starting at the link's folder.
    let depth = parts.length - 1;
    for (const part of key(target).split('/')) {
      if (part === '' || part === '.') continue;
      depth += part === '..' ? -1 : 1;
      if (depth < 0) return `the symlink "${name}" points out of the archive`;
    }
  }
  return null;
}

/**
 * Reads objects from `git cat-file --batch` in the order their shas were
 * written. The output is "<sha> <type> <size>\n<content>\n" per object, or
 * "<sha> missing\n". Content is handed on in the chunks it arrives in, so
 * a large file never has to fit in memory.
 */
export class BlobReader {
  private readonly queue: Buffer[] = [];
  private readonly source: AsyncIterator<Buffer>;
  private stderr = '';
  private readonly exited: Promise<number | null>;

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    this.source = child.stdout[Symbol.asyncIterator]();
    child.stderr.on('data', (chunk: Buffer) => {
      if (this.stderr.length < 4096) this.stderr += chunk.toString();
    });
    this.exited = new Promise((resolve) => child.on('close', (code) => resolve(code)));
  }

  private async fill(): Promise<void> {
    const next = await this.source.next();
    if (next.done) {
      throw new GitError(['cat-file'], null, this.stderr || 'unexpected end of output');
    }
    this.queue.push(next.value);
  }

  /** Up to `limit` bytes from the front of what has arrived, without copying. */
  private async piece(limit: number): Promise<Buffer> {
    if (this.queue.length === 0) await this.fill();
    const first = this.queue[0]!;
    if (first.length <= limit) return this.queue.shift()!;
    this.queue[0] = first.subarray(limit);
    return first.subarray(0, limit);
  }

  private async line(): Promise<string> {
    const parts: Buffer[] = [];
    let length = 0;
    for (;;) {
      if (this.queue.length === 0) await this.fill();
      const first = this.queue[0]!;
      const newline = first.indexOf(10);
      if (newline === -1) {
        parts.push(this.queue.shift()!);
        length += first.length;
        if (length > 1024) throw new GitError(['cat-file'], null, 'unexpected output');
        continue;
      }
      parts.push(first.subarray(0, newline));
      const rest = first.subarray(newline + 1);
      if (rest.length) this.queue[0] = rest;
      else this.queue.shift();
      return Buffer.concat(parts).toString('latin1');
    }
  }

  /** The next blob, in chunks; `sha` and `size` must match what git reports. */
  async *stream(sha: string, size: number | null): AsyncGenerator<Buffer> {
    const [name, type, length] = (await this.line()).split(' ');
    if (name !== sha || type !== 'blob' || (size !== null && Number(length) !== size)) {
      throw new GitError(['cat-file'], null, `object ${sha} is ${type ?? 'missing'}`);
    }
    let remaining = Number(length);
    while (remaining > 0) {
      const piece = await this.piece(remaining);
      remaining -= piece.length;
      yield piece;
    }
    await this.piece(1); // the newline after the content
  }

  /** The whole next blob, for small or capped content. */
  async read(sha: string, size: number | null): Promise<Buffer> {
    const parts: Buffer[] = [];
    for await (const piece of this.stream(sha, size)) parts.push(piece);
    return Buffer.concat(parts);
  }

  /** Waits for git to exit and fails unless it exited cleanly. */
  async close(): Promise<void> {
    const code = await this.exited;
    if (code !== 0) throw new GitError(['cat-file'], code, this.stderr);
  }

  kill() {
    if (this.child.exitCode === null) this.child.kill();
  }
}

function blobReader(repo: RepoLocation, shas: string[]): BlobReader {
  const child = gitProcess(repo, ['cat-file', '--batch']);
  const reader = new BlobReader(child);
  child.stdin.on('error', () => {}); // git exiting early is reported by close()
  child.stdin.end(shas.map((sha) => `${sha}\n`).join(''));
  return reader;
}

/** The targets of all symlinks, keyed by path; read before anything is sent. */
async function readLinks(repo: RepoLocation, records: TreeRecord[]): Promise<Map<string, Buffer>> {
  const links = records.filter(isLink);
  const targets = new Map<string, Buffer>();
  if (links.length === 0) return targets;
  const reader = blobReader(
    repo,
    links.map((l) => l.sha),
  );
  try {
    for (const link of links) targets.set(key(link.path), await reader.read(link.sha, link.size));
    await reader.close();
  } finally {
    reader.kill();
  }
  return targets;
}

/** The entry for a record in the archive, as `git archive` with its default umask. */
function archiveEntry(record: TreeRecord, prefix: Buffer, mtime: number): ArchiveEntry {
  const path = Buffer.concat([prefix, Buffer.from('/'), record.path]);
  if (record.type !== 'blob') {
    // A submodule is an empty folder, as in `git archive`.
    return { path, type: 'dir', mode: 0o775, mtime, size: 0 };
  }
  if (isLink(record)) return { path, type: 'symlink', mode: 0o777, mtime, size: 0 };
  return {
    path,
    type: 'file',
    mode: record.mode === '100755' ? 0o775 : 0o664,
    mtime,
    size: record.size ?? 0,
  };
}

async function* archiveChunks(
  repo: RepoLocation,
  commit: string,
  prefix: string,
  format: ArchiveFormat,
  records: TreeRecord[],
  links: Map<string, Buffer>,
  mtime: number,
): AsyncGenerator<Buffer> {
  const files = records.filter((r) => r.type === 'blob' && !isLink(r));
  const reader = blobReader(
    repo,
    files.map((f) => f.sha),
  );
  const zip = format === 'zip' ? new ZipWriter() : null;
  const prefixBytes = Buffer.from(prefix);
  const root: ArchiveEntry = { path: prefixBytes, type: 'dir', mode: 0o775, mtime, size: 0 };
  const empty = Buffer.alloc(0);
  try {
    if (zip) {
      yield zip.add(root, empty, empty, false);
    } else {
      yield tarGlobalHeader(commit, mtime);
      yield tarHeader(root);
    }

    for (const record of records) {
      const entry = archiveEntry(record, prefixBytes, mtime);
      if (entry.type === 'symlink') entry.linkTarget = links.get(key(record.path));

      if (zip) {
        // Capped at MAX_ZIP_FILE_BYTES before the download started.
        const content =
          entry.type === 'file'
            ? await reader.read(record.sha, record.size)
            : (entry.linkTarget ?? empty);
        const deflated = entry.type === 'file' && content.length > 0;
        yield zip.add(entry, content, deflated ? await deflate(content) : content, deflated);
      } else {
        yield tarHeader(entry);
        if (entry.type === 'file') {
          yield* reader.stream(record.sha, record.size);
          yield tarPadding(entry.size);
        }
      }
    }

    // Only a complete, successful read gets the end of the archive. Anything
    // else throws, and the response is cut off instead of looking whole.
    await reader.close();
    yield zip ? zip.finish() : TAR_END;
  } finally {
    reader.kill();
  }
}

/**
 * The files at `commit` as a zip or tar.gz stream, inside a `<prefix>/`
 * folder. Everything that can be checked up front is checked before the
 * stream is returned, so those failures are ordinary error responses. If git
 * fails while the archive is being sent, the stream errors before the
 * archive's end is written.
 */
export async function archiveStream(
  repo: RepoLocation,
  commit: string,
  prefix: string,
  format: ArchiveFormat,
): Promise<Readable> {
  const [tree, time] = await Promise.all([
    gitBuffer(repo, ['ls-tree', '-r', '-t', '-z', '--long', commit]),
    git(repo, ['show', '-s', '--format=%ct', commit, '--']),
  ]);
  const records = parseArchiveTree(tree);
  const mtime = Number(time.trim());

  if (format === 'zip') {
    const bytes = records.reduce((sum, r) => sum + (r.size ?? 0), 0);
    if (!fitsInZip(records.length + 1, bytes)) {
      throw new HttpError(413, 'Too large for a zip file. Download a tar.gz instead.', 'too_large');
    }
    if (records.some((r) => (r.size ?? 0) > MAX_ZIP_FILE_BYTES)) {
      throw new HttpError(
        413,
        'A file is over 100 MB, too large for a zip download. Download a tar.gz instead.',
        'too_large',
      );
    }
  }

  if (records.some((r) => isLink(r) && (r.size ?? 0) > MAX_LINK_BYTES)) {
    throw new HttpError(422, 'This tree has a symlink that is not a path.', 'unsafe_tree');
  }
  const links = await readLinks(repo, records);
  const reason = unsafeTreeReason(records, links);
  if (reason) {
    throw new HttpError(422, `This tree cannot be archived safely: ${reason}.`, 'unsafe_tree');
  }

  const stream = Readable.from(archiveChunks(repo, commit, prefix, format, records, links, mtime), {
    objectMode: false,
  });
  if (format === 'zip') return stream;
  // pipeline() destroys the gzip stream with the error if reading fails.
  return pipeline(stream, createGzip(), () => {});
}
