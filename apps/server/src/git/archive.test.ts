import { describe, expect, it } from 'vitest';
import { crc32, fitsInZip } from '../lib/zip.js';
import { paxRecord, tarHeader } from '../lib/tar.js';

describe('archive writers', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });

  it('counts the length prefix in pax records', () => {
    expect(paxRecord('path', 'a')).toBe('9 path=a\n');
    const long = paxRecord('path', 'x'.repeat(95));
    expect(long.length).toBe(Number(long.split(' ')[0]));
  });

  it('writes a ustar header with a valid checksum', () => {
    const header = tarHeader({ path: 'p/a.txt', type: 'file', mode: 0o664, mtime: 1, size: 3 });
    expect(header.length).toBe(512);
    expect(header.subarray(257, 262).toString()).toBe('ustar');
    const stored = Number.parseInt(header.subarray(148, 154).toString(), 8);
    const copy = Buffer.from(header);
    copy.write('        ', 148, 8, 'ascii');
    expect(copy.reduce((sum, b) => sum + b, 0)).toBe(stored);
  });

  it('puts long and non-ASCII names in a pax header', () => {
    const header = tarHeader({
      path: `p/${'d/'.repeat(60)}café.txt`,
      type: 'file',
      mode: 0o664,
      mtime: 1,
      size: 0,
    });
    expect(header.length).toBe(512 * 3);
    expect(header.subarray(156, 157).toString()).toBe('x');
    expect(header.toString('utf8')).toContain('café.txt');
  });

  it('knows when a zip would need zip64', () => {
    expect(fitsInZip(10, 1000)).toBe(true);
    expect(fitsInZip(70_000, 1000)).toBe(false);
    expect(fitsInZip(10, 5 * 1024 ** 3)).toBe(false);
  });
});
