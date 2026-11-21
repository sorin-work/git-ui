/**
 * A minimal tar writer (POSIX ustar with pax extended headers), enough for
 * the archives git-ui offers: regular files, directories and symlinks.
 * Names and link targets are raw bytes, as git stores them. Names that are
 * not plain ASCII or too long for ustar, long link targets, sizes over 8 GB
 * and times outside the octal field go into a pax header, as `git archive`
 * does.
 */

export type ArchiveEntryType = 'file' | 'dir' | 'symlink';

export interface ArchiveEntry {
  /** Path inside the archive, without a trailing slash, as raw bytes. */
  path: Buffer;
  type: ArchiveEntryType;
  /** Permission bits, e.g. 0o664. */
  mode: number;
  /** Seconds since the epoch. */
  mtime: number;
  /** File size in bytes (0 for folders and symlinks). */
  size: number;
  linkTarget?: Buffer;
}

const BLOCK = 512;

/** Two empty blocks end an archive. */
export const TAR_END = Buffer.alloc(BLOCK * 2);

/** The largest value an octal field of `length` bytes (with its NUL) holds. */
const maxOctal = (length: number) => 8 ** (length - 1) - 1;

function writeOctal(header: Buffer, value: number, offset: number, length: number) {
  const clamped = Math.min(Math.max(0, Math.floor(value)), maxOctal(length));
  header.write(clamped.toString(8).padStart(length - 1, '0') + '\0', offset, length, 'ascii');
}

/** A printable ASCII stand-in for readers that ignore pax headers. */
function asciiName(value: Buffer): Buffer {
  const out = Buffer.from(value.subarray(0, 100));
  for (let i = 0; i < out.length; i++) if (out[i]! < 0x20 || out[i]! > 0x7e) out[i] = 0x5f;
  return out;
}

function isPlain(value: Buffer, limit: number): boolean {
  return value.length <= limit && value.every((b) => b >= 0x20 && b <= 0x7e);
}

function ustarHeader(
  name: Buffer,
  typeflag: string,
  mode: number,
  size: number,
  mtime: number,
  linkname: Buffer = Buffer.alloc(0),
): Buffer {
  const header = Buffer.alloc(BLOCK);
  name.copy(header, 0, 0, Math.min(name.length, 100));
  writeOctal(header, mode, 100, 8);
  writeOctal(header, 0, 108, 8); // uid
  writeOctal(header, 0, 116, 8); // gid
  writeOctal(header, size, 124, 12);
  writeOctal(header, mtime, 136, 12);
  header.write('        ', 148, 8, 'ascii'); // checksum placeholder
  header.write(typeflag, 156, 1, 'ascii');
  linkname.copy(header, 157, 0, Math.min(linkname.length, 100));
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  header.write('root', 265, 32, 'ascii');
  header.write('root', 297, 32, 'ascii');
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return header;
}

/** One pax record: "<length> <key>=<value>\n", where length counts itself. */
export function paxRecord(key: string, value: string | Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(` ${key}=`), Buffer.from(value), Buffer.from('\n')]);
  let length = body.length + 1;
  while (String(length).length + body.length !== length) {
    length = String(length).length + body.length;
  }
  return Buffer.concat([Buffer.from(String(length)), body]);
}

/** Bytes of padding after `size` bytes of content. */
export function tarPadding(size: number): Buffer {
  const rest = size % BLOCK;
  return rest === 0 ? Buffer.alloc(0) : Buffer.alloc(BLOCK - rest);
}

function paxBlock(name: string, typeflag: 'x' | 'g', records: Buffer, mtime: number): Buffer {
  return Buffer.concat([
    ustarHeader(Buffer.from(name), typeflag, 0o644, records.length, mtime),
    records,
    tarPadding(records.length),
  ]);
}

/** A global pax header with a comment, as git writes the commit id. */
export function tarGlobalHeader(comment: string, mtime: number): Buffer {
  return paxBlock('pax_global_header', 'g', paxRecord('comment', comment), mtime);
}

/** The header block(s) for an entry; its content and `tarPadding` follow. */
export function tarHeader(entry: ArchiveEntry): Buffer {
  const name = entry.type === 'dir' ? Buffer.concat([entry.path, Buffer.from('/')]) : entry.path;
  const size = entry.type === 'file' ? entry.size : 0;
  const link = entry.linkTarget ?? Buffer.alloc(0);
  const typeflag = entry.type === 'dir' ? '5' : entry.type === 'symlink' ? '2' : '0';

  const records: Buffer[] = [];
  if (!isPlain(name, 100)) records.push(paxRecord('path', name));
  if (!isPlain(link, 100)) records.push(paxRecord('linkpath', link));
  if (size > maxOctal(12)) records.push(paxRecord('size', String(size)));
  const mtime = Math.floor(entry.mtime);
  if (mtime < 0 || mtime > maxOctal(12)) records.push(paxRecord('mtime', String(mtime)));

  const header = ustarHeader(asciiName(name), typeflag, entry.mode, size, mtime, asciiName(link));
  return records.length
    ? Buffer.concat([paxBlock('pax_header', 'x', Buffer.concat(records), 0), header])
    : header;
}
