import { describe, expect, it } from 'vitest';
import { crc32, dosDateTime, fitsInZip, isUtf8 } from '../lib/zip.js';
import { paxRecord, tarHeader } from '../lib/tar.js';
import { parseArchiveTree, unsafeTreeReason, type TreeRecord } from './archive.js';

const SHA = 'a'.repeat(40);

function record(path: string | Buffer, mode = '100644'): TreeRecord {
  const type = mode === '040000' ? 'tree' : mode === '160000' ? 'commit' : 'blob';
  return { mode, type, sha: SHA, size: type === 'blob' ? 1 : null, path: Buffer.from(path) };
}

function reason(records: TreeRecord[], links: Record<string, string> = {}) {
  const map = new Map(Object.entries(links).map(([k, v]) => [k, Buffer.from(v)]));
  return unsafeTreeReason(records, map);
}

describe('archive writers', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });

  it('counts the length prefix in pax records', () => {
    expect(paxRecord('path', 'a').toString()).toBe('9 path=a\n');
    const long = paxRecord('path', 'x'.repeat(95)).toString();
    expect(long.length).toBe(Number(long.split(' ')[0]));
  });

  it('writes a ustar header with a valid checksum', () => {
    const header = tarHeader({
      path: Buffer.from('p/a.txt'),
      type: 'file',
      mode: 0o664,
      mtime: 1,
      size: 3,
    });
    expect(header.length).toBe(512);
    expect(header.subarray(257, 262).toString()).toBe('ustar');
    const stored = Number.parseInt(header.subarray(148, 154).toString(), 8);
    const copy = Buffer.from(header);
    copy.write('        ', 148, 8, 'ascii');
    expect(copy.reduce((sum, b) => sum + b, 0)).toBe(stored);
  });

  it('puts long, non-ASCII and non-UTF-8 names in a pax header as raw bytes', () => {
    const header = tarHeader({
      path: Buffer.from(`p/${'d/'.repeat(60)}café.txt`),
      type: 'file',
      mode: 0o664,
      mtime: 1,
      size: 0,
    });
    expect(header.length).toBe(512 * 3);
    expect(header.subarray(156, 157).toString()).toBe('x');
    expect(header.toString('utf8')).toContain('café.txt');

    const latin1 = Buffer.from([0x70, 0x2f, 0xe9, 0x2e, 0x74]); // "p/\xe9.t"
    const raw = tarHeader({ path: latin1, type: 'file', mode: 0o664, mtime: 1, size: 0 });
    expect(raw.includes(Buffer.concat([Buffer.from('path='), latin1, Buffer.from('\n')]))).toBe(
      true,
    );
  });

  it('keeps times the octal field cannot hold in pax', () => {
    const future = 8 ** 11 + 5;
    const header = tarHeader({
      path: Buffer.from('p/a'),
      type: 'file',
      mode: 0o664,
      mtime: future,
      size: 0,
    });
    expect(header.toString('latin1')).toContain(`mtime=${future}\n`);
    const before = tarHeader({
      path: Buffer.from('p/a'),
      type: 'file',
      mode: 0o664,
      mtime: -5,
      size: 0,
    });
    expect(before.toString('latin1')).toContain('mtime=-5\n');
  });

  it('clamps zip dates to 1980 to 2107', () => {
    expect(dosDateTime(0)).toEqual(dosDateTime(315532800));
    expect(dosDateTime(1e12)).toEqual(dosDateTime(4354819198));
    expect(dosDateTime(Number.NaN)).toEqual(dosDateTime(315532800));
    expect(dosDateTime(1e12).date >> 9).toBe(127);
  });

  it('flags zip names as UTF-8 only when they are', () => {
    expect(isUtf8(Buffer.from('café'))).toBe(true);
    expect(isUtf8(Buffer.from([0xe9]))).toBe(false);
  });

  it('knows when a zip would need zip64', () => {
    expect(fitsInZip(10, 1000)).toBe(true);
    expect(fitsInZip(70_000, 1000)).toBe(false);
    expect(fitsInZip(10, 5 * 1024 ** 3)).toBe(false);
  });
});

describe('archive trees', () => {
  it('parses ls-tree output with raw byte paths and fails on unreadable objects', () => {
    const path = Buffer.from([0x61, 0xe9]);
    const output = Buffer.concat([
      Buffer.from(`100644 blob ${SHA}       5\t`),
      path,
      Buffer.from([0]),
      Buffer.from(`040000 tree ${SHA}       -\tsrc\0`),
    ]);
    const records = parseArchiveTree(output);
    expect(records[0]!.path.equals(path)).toBe(true);
    expect(records[1]).toMatchObject({ type: 'tree', size: null });
    expect(() => parseArchiveTree(Buffer.from(`100644 blob ${SHA}     BAD\ta\0`))).toThrow();
  });

  it('accepts an ordinary tree', () => {
    expect(
      reason(
        [
          record('src', '040000'),
          record('src/a.ts'),
          record('link', '120000'),
          record('sub', '160000'),
        ],
        { link: 'src/a.ts' },
      ),
    ).toBeNull();
    expect(reason([record('a', '040000'), record('a/l', '120000')], { 'a/l': '../b' })).toBeNull();
  });

  it('refuses paths that leave their folder or touch .git', () => {
    expect(reason([record('../evil')])).toMatch(/leaves its folder/);
    expect(reason([record('a/./b')])).toMatch(/leaves its folder/);
    expect(reason([record('a//b')])).toMatch(/leaves its folder/);
    expect(reason([record('x/.GIT/config')])).toMatch(/contains .git/);
  });

  it('refuses duplicates and anything below a symlink', () => {
    expect(reason([record('link', '120000'), record('link', '040000')], { link: 'x' })).toMatch(
      /appears twice/,
    );
    expect(reason([record('link', '120000'), record('link/pwn')], { link: 'x' })).toMatch(
      /inside a symlink/,
    );
  });

  it('refuses symlinks that point at absolute paths or out of the archive', () => {
    expect(reason([record('l', '120000')], { l: '/etc/passwd' })).toMatch(/absolute path/);
    expect(reason([record('l', '120000')], { l: '../x' })).toMatch(/out of the archive/);
    expect(
      reason([record('a', '040000'), record('a/l', '120000')], { 'a/l': 'b/../../../x' }),
    ).toMatch(/out of the archive/);
    expect(reason([record('l', '120000')], { l: 'a\0b' })).toMatch(/not a path/);
  });
});
