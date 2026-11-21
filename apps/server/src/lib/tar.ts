/**
 * A minimal tar writer (POSIX ustar with pax extended headers), enough for
 * the archives git-ui offers: regular files, directories and symlinks.
 * Names too long for ustar, link targets over 100 bytes and sizes over 8 GB
 * go into a pax header, as `git archive` does.
 */

export type ArchiveEntryType = 'file' | 'dir' | 'symlink';

export interface ArchiveEntry {
  /** Path inside the archive, without a trailing slash. */
  path: string;
  type: ArchiveEntryType;
  /** Permission bits, e.g. 0o664. */
  mode: number;
  /** Seconds since the epoch. */
  mtime: number;
  /** File size, or the symlink target's length. */
  size: number;
  linkTarget?: string;
}

const BLOCK = 512;

/** Two empty blocks end an archive. */
export const TAR_END = Buffer.alloc(BLOCK * 2);

function writeString(header: Buffer, value: string, offset: number, length: number) {
  header.write(value, offset, length, 'ascii');
}

function writeOctal(header: Buffer, value: number, offset: number, length: number) {
  // length - 1 digits and a NUL.
  header.write(value.toString(8).padStart(length - 1, '0') + '\0', offset, length, 'ascii');
}

function ustarHeader(
  name: string,
  typeflag: string,
  mode: number,
  size: number,
  mtime: number,
  linkname = '',
): Buffer {
  const header = Buffer.alloc(BLOCK);
  writeString(header, name, 0, 100);
  writeOctal(header, mode, 100, 8);
  writeOctal(header, 0, 108, 8); // uid
  writeOctal(header, 0, 116, 8); // gid
  writeOctal(header, size, 124, 12);
  writeOctal(header, mtime, 136, 12);
  header.write('        ', 148, 8, 'ascii'); // checksum placeholder
  header.write(typeflag, 156, 1, 'ascii');
  writeString(header, linkname, 157, 100);
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  writeString(header, 'root', 265, 32);
  writeString(header, 'root', 297, 32);
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return header;
}

/** One pax record: "<length> <key>=<value>\n", where length counts itself. */
export function paxRecord(key: string, value: string): string {
  const body = ` ${key}=${value}\n`;
  let length = Buffer.byteLength(body) + 1;
  while (String(length).length + Buffer.byteLength(body) !== length) {
    length = String(length).length + Buffer.byteLength(body);
  }
  return `${length}${body}`;
}

/** Bytes of padding after `size` bytes of content. */
export function tarPadding(size: number): Buffer {
  const rest = size % BLOCK;
  return rest === 0 ? Buffer.alloc(0) : Buffer.alloc(BLOCK - rest);
}

function paxHeader(name: string, records: string, mtime: number): Buffer {
  const body = Buffer.from(records, 'utf8');
  return Buffer.concat([
    ustarHeader(name, 'x', 0o644, body.length, mtime),
    body,
    tarPadding(body.length),
  ]);
}

/** A global pax header with a comment, as git writes the commit id. */
export function tarGlobalHeader(comment: string, mtime: number): Buffer {
  const body = Buffer.from(paxRecord('comment', comment), 'utf8');
  return Buffer.concat([
    ustarHeader('pax_global_header', 'g', 0o666, body.length, mtime),
    body,
    tarPadding(body.length),
  ]);
}

function ascii(value: string): string {
  return value.replace(/[^\x20-\x7e]/g, '_').slice(0, 100);
}

const MAX_OCTAL_SIZE = 8 ** 11 - 1;

/** The header block(s) for an entry; its content and `tarPadding` follow. */
export function tarHeader(entry: ArchiveEntry): Buffer {
  const name = entry.type === 'dir' ? `${entry.path}/` : entry.path;
  const size = entry.type === 'file' ? entry.size : 0;
  const link = entry.linkTarget ?? '';
  const typeflag = entry.type === 'dir' ? '5' : entry.type === 'symlink' ? '2' : '0';

  let records = '';
  if (Buffer.byteLength(name) > 100 || /[^\x20-\x7e]/.test(name)) {
    records += paxRecord('path', name);
  }
  if (Buffer.byteLength(link) > 100 || /[^\x20-\x7e]/.test(link)) {
    records += paxRecord('linkpath', link);
  }
  if (size > MAX_OCTAL_SIZE) records += paxRecord('size', String(size));

  const header = ustarHeader(
    // Readers that ignore pax still get a recognisable name.
    ascii(name),
    typeflag,
    entry.mode,
    size > MAX_OCTAL_SIZE ? 0 : size,
    entry.mtime,
    ascii(link),
  );
  return records ? Buffer.concat([paxHeader('pax_header', records, entry.mtime), header]) : header;
}
