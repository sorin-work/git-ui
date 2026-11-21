import * as zlib from 'node:zlib';
import type { ArchiveEntry } from './tar.js';

const nativeCrc32 = (zlib as { crc32?: (data: Buffer) => number }).crc32;

/**
 * A minimal zip writer: each file is passed in whole (already deflated or
 * stored) and the central directory is written by `finish()`. No zip64, so
 * callers check `fitsInZip` first.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Buffer): number {
  // zlib.crc32 exists from Node 22.2; the table is the fallback.
  if (nativeCrc32) return nativeCrc32(data);
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const MAX_32 = 0xffffffff;
const MAX_ENTRIES = 0xffff;

/** Whether `count` entries with `totalBytes` of content fit without zip64. */
export function fitsInZip(count: number, totalBytes: number): boolean {
  // Headers and the worst case of deflate growing a file add a little.
  return count < MAX_ENTRIES && totalBytes + count * 1024 < MAX_32;
}

/** MS-DOS date and time, which zip stores in local time; we use UTC. */
function dosDateTime(seconds: number): { time: number; date: number } {
  const d = new Date(Math.max(seconds, 315532800) * 1000); // not before 1980
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
    date: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

const UTF8_NAMES = 0x0800;
const UNIX_TYPE = { file: 0o100000, dir: 0o040000, symlink: 0o120000 } as const;

interface Written {
  name: Buffer;
  method: number;
  crc: number;
  compressed: number;
  size: number;
  offset: number;
  time: number;
  date: number;
  attributes: number;
}

export class ZipWriter {
  private readonly written: Written[] = [];
  private offset = 0;

  /**
   * The local header and data for one entry. `data` is the content as it
   * goes into the file, `raw` the original bytes (for the CRC and size).
   */
  add(entry: ArchiveEntry, raw: Buffer, data: Buffer, deflated: boolean): Buffer {
    const name = Buffer.from(entry.type === 'dir' ? `${entry.path}/` : entry.path, 'utf8');
    const { time, date } = dosDateTime(entry.mtime);
    const record: Written = {
      name,
      method: deflated ? 8 : 0,
      crc: crc32(raw),
      compressed: data.length,
      size: raw.length,
      offset: this.offset,
      time,
      date,
      // Unix type and mode in the high half, the MS-DOS folder flag below.
      attributes:
        (((UNIX_TYPE[entry.type] | entry.mode) << 16) | (entry.type === 'dir' ? 0x10 : 0)) >>> 0,
    };
    if (record.offset + data.length + name.length + 30 > MAX_32) {
      throw new Error('The archive is too large for a zip file');
    }
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(UTF8_NAMES, 6);
    header.writeUInt16LE(record.method, 8);
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt32LE(record.crc, 14);
    header.writeUInt32LE(record.compressed, 18);
    header.writeUInt32LE(record.size, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    this.written.push(record);
    this.offset += header.length + name.length + data.length;
    return Buffer.concat([header, name, data]);
  }

  /** The central directory and its end record. */
  finish(): Buffer {
    const parts: Buffer[] = [];
    let size = 0;
    for (const r of this.written) {
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0);
      header.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix
      header.writeUInt16LE(20, 6);
      header.writeUInt16LE(UTF8_NAMES, 8);
      header.writeUInt16LE(r.method, 10);
      header.writeUInt16LE(r.time, 12);
      header.writeUInt16LE(r.date, 14);
      header.writeUInt32LE(r.crc, 16);
      header.writeUInt32LE(r.compressed, 20);
      header.writeUInt32LE(r.size, 24);
      header.writeUInt16LE(r.name.length, 28);
      header.writeUInt32LE(r.attributes, 38);
      header.writeUInt32LE(r.offset, 42);
      parts.push(header, r.name);
      size += header.length + r.name.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.written.length, 8);
    end.writeUInt16LE(this.written.length, 10);
    end.writeUInt32LE(size, 12);
    end.writeUInt32LE(this.offset, 16);
    return Buffer.concat([...parts, end]);
  }
}
