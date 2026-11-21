import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { pipeline, Readable } from 'node:stream';
import { promisify } from 'node:util';
import { createGzip, deflateRaw } from 'node:zlib';
import { HttpError } from '../lib/errors.js';
import { TAR_END, tarGlobalHeader, tarHeader, tarPadding, type ArchiveEntry } from '../lib/tar.js';
import { fitsInZip, ZipWriter } from '../lib/zip.js';
import type { RepoLocation } from './repos.js';
import { git, GitError, gitProcess } from './run.js';
import type { TreeEntry } from './tree.js';

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

const RECORD = /^(\d{6}) (blob|tree|commit) ([0-9a-f]+) +(-|\d+|BAD)\t(.*)$/s;

/**
 * Parses `ls-tree -r -t -z --long` for an archive. Unlike the tree view it
 * fails on anything it does not understand: git prints the size "BAD" for
 * an object it cannot read, and leaving that file out would make an
 * incomplete archive look complete.
 */
export function parseArchiveTree(output: string): TreeEntry[] {
  return output
    .split('\0')
    .filter(Boolean)
    .map((record) => {
      const match = RECORD.exec(record);
      if (!match || match[4] === 'BAD') {
        throw new GitError(['ls-tree'], null, `cannot read "${record}"`);
      }
      const [, mode, type, sha, size, path] = match as unknown as string[];
      return {
        name: path!.slice(path!.lastIndexOf('/') + 1),
        path: path!,
        type: type as TreeEntry['type'],
        mode: mode!,
        sha: sha!,
        size: size === '-' ? null : Number(size),
      };
    });
}

/** The mode an entry gets in the archive, as `git archive` with its default umask. */
function archiveEntry(entry: TreeEntry, prefix: string, mtime: number): ArchiveEntry {
  const path = `${prefix}/${entry.path}`;
  if (entry.type === 'tree' || entry.type === 'commit') {
    // A submodule is an empty folder, as in `git archive`.
    return { path, type: 'dir', mode: 0o775, mtime, size: 0 };
  }
  if (entry.mode === '120000') {
    return { path, type: 'symlink', mode: 0o777, mtime, size: entry.size ?? 0 };
  }
  return {
    path,
    type: 'file',
    mode: entry.mode === '100755' ? 0o775 : 0o664,
    mtime,
    size: entry.size ?? 0,
  };
}

/**
 * Reads blobs from `git cat-file --batch` in the order their shas were
 * written. The output is "<sha> <type> <size>\n<content>\n" per object, or
 * "<sha> missing\n".
 */
export class BlobReader {
  private readonly chunks: Buffer[] = [];
  private buffered = 0;
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
    if (next.done)
      throw new GitError(['cat-file'], null, this.stderr || 'unexpected end of output');
    this.chunks.push(next.value);
    this.buffered += next.value.length;
  }

  private take(length: number): Buffer {
    const all = this.chunks.length === 1 ? this.chunks[0]! : Buffer.concat(this.chunks);
    this.chunks.length = 0;
    const rest = all.subarray(length);
    if (rest.length) this.chunks.push(rest);
    this.buffered = rest.length;
    return all.subarray(0, length);
  }

  private async line(): Promise<string> {
    for (;;) {
      const index = this.chunks.findIndex((c) => c.includes(10));
      if (index !== -1) {
        const before = this.chunks.slice(0, index).reduce((n, c) => n + c.length, 0);
        return this.take(before + this.chunks[index]!.indexOf(10) + 1)
          .toString('utf8')
          .trimEnd();
      }
      await this.fill();
    }
  }

  private async bytes(length: number): Promise<Buffer> {
    while (this.buffered < length) await this.fill();
    return Buffer.from(this.take(length));
  }

  /** The next blob's content; `sha` is what was asked for, to check the order. */
  async next(sha: string): Promise<Buffer> {
    const header = (await this.line()).split(' ');
    if (header[0] !== sha || header[1] !== 'blob') {
      throw new GitError(['cat-file'], null, `object ${sha} is ${header[1] ?? 'missing'}`);
    }
    const content = await this.bytes(Number(header[2]));
    await this.bytes(1); // the newline after the content
    return content;
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

async function* archiveChunks(
  repo: RepoLocation,
  commit: string,
  prefix: string,
  format: ArchiveFormat,
  entries: TreeEntry[],
  mtime: number,
): AsyncGenerator<Buffer> {
  const blobs = entries.filter((e) => e.type === 'blob');
  const child = gitProcess(repo, ['cat-file', '--batch']);
  const reader = new BlobReader(child);
  child.stdin.on('error', () => {}); // git exiting early is reported by close()
  child.stdin.end(blobs.map((e) => `${e.sha}\n`).join(''));

  const zip = format === 'zip' ? new ZipWriter() : null;
  const root: ArchiveEntry = { path: prefix, type: 'dir', mode: 0o775, mtime, size: 0 };
  try {
    if (zip) {
      yield zip.add(root, Buffer.alloc(0), Buffer.alloc(0), false);
    } else {
      yield tarGlobalHeader(commit, mtime);
      yield tarHeader(root);
    }

    for (const tree of entries) {
      const entry = archiveEntry(tree, prefix, mtime);
      const content = tree.type === 'blob' ? await reader.next(tree.sha) : Buffer.alloc(0);
      if (entry.type === 'symlink') entry.linkTarget = content.toString('utf8');

      if (zip) {
        const deflated = entry.type === 'file' && content.length > 0;
        const data = deflated ? await deflate(content) : content;
        yield zip.add(entry, content, data, deflated);
      } else {
        yield tarHeader(entry);
        if (entry.type === 'file') {
          yield content;
          yield tarPadding(content.length);
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
 * folder. If git fails while the archive is being sent, the stream errors
 * before the archive's end is written.
 */
export async function archiveStream(
  repo: RepoLocation,
  commit: string,
  prefix: string,
  format: ArchiveFormat,
): Promise<Readable> {
  const [tree, time] = await Promise.all([
    git(repo, ['ls-tree', '-r', '-t', '-z', '--long', commit]),
    git(repo, ['show', '-s', '--format=%ct', commit, '--']),
  ]);
  const entries = parseArchiveTree(tree);
  const mtime = Number(time.trim());

  if (format === 'zip') {
    const bytes = entries.reduce((sum, e) => sum + (e.size ?? 0), 0);
    if (!fitsInZip(entries.length + 1, bytes)) {
      throw new HttpError(413, 'Too large for a zip file. Download a tar.gz instead.', 'too_large');
    }
  }

  const stream = Readable.from(archiveChunks(repo, commit, prefix, format, entries, mtime), {
    objectMode: false,
  });
  if (format === 'zip') return stream;
  // pipeline() destroys the gzip stream with the error if reading fails.
  return pipeline(stream, createGzip(), () => {});
}
