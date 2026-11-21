import { pipeline, type Readable } from 'node:stream';
import { createGzip } from 'node:zlib';
import { HttpError } from '../lib/errors.js';
import type { RepoLocation } from './repos.js';
import { git, GitError, gitStream } from './run.js';

export type ArchiveFormat = 'zip' | 'tar.gz';

/**
 * `-c` options that switch off every filter driver the repository defines.
 *
 * `git archive` passes each file through the smudge or process command of
 * the filter its .gitattributes names, and the driver names come from the
 * repository, so there is no single setting that turns them all off. Reading
 * the config runs nothing, so we list the drivers first and blank each one.
 * A driver without a command is skipped, and `required=false` stops git from
 * failing on it.
 */
export function filterOverrides(names: Iterable<string>): string[] {
  const args: string[] = [];
  for (const name of names) {
    args.push(
      '-c',
      `filter.${name}.smudge=`,
      '-c',
      `filter.${name}.process=`,
      '-c',
      `filter.${name}.required=false`,
    );
  }
  return args;
}

/** Parses `git config --null --get-regexp` output into [key, value] pairs. */
export function parseConfigList(output: string): [string, string][] {
  return output
    .split('\0')
    .filter(Boolean)
    .map((record) => {
      const newline = record.indexOf('\n');
      return newline === -1 ? [record, ''] : [record.slice(0, newline), record.slice(newline + 1)];
    });
}

const unsafeConfig = (message: string) => new HttpError(409, message, 'unsafe_config');

/**
 * The extra arguments `git archive` needs to be safe for this repository.
 *
 * Besides filters, `tar.<format>.command` lets config define the program an
 * archive is piped through, and a format named `zip` takes the place of the
 * built-in zip writer. Plain `tar` cannot be replaced that way, so tarballs
 * are compressed here instead of by git; a zip is refused when the
 * repository redefines it.
 */
export async function archiveSafetyArgs(
  repo: RepoLocation,
  format: ArchiveFormat,
): Promise<string[]> {
  let output = '';
  try {
    output = await git(repo, ['config', '--null', '--get-regexp', '^(filter|tar)\\.']);
  } catch (err) {
    // Exit code 1: no such keys.
    if (!(err instanceof GitError && err.exitCode === 1)) throw err;
  }

  const filters = new Set<string>();
  for (const [key] of parseConfigList(output)) {
    if (key.startsWith('filter.')) {
      const name = key.slice('filter.'.length, key.lastIndexOf('.'));
      // `-c` splits at the first "=", so such a name cannot be overridden.
      if (name.includes('=')) {
        throw unsafeConfig('This repository defines a filter that cannot be switched off.');
      }
      if (name) filters.add(name);
    } else if (format === 'zip' && key.startsWith('tar.zip.')) {
      throw unsafeConfig(
        'This repository replaces the zip format with a program. Download a tar.gz instead.',
      );
    }
  }
  return filterOverrides(filters);
}

/** The files at `commit` as a zip or tar.gz stream, inside a `<prefix>/` folder. */
export async function archiveStream(
  repo: RepoLocation,
  commit: string,
  prefix: string,
  format: ArchiveFormat,
): Promise<Readable> {
  const safety = await archiveSafetyArgs(repo, format);
  const args = [
    ...safety,
    'archive',
    `--format=${format === 'zip' ? 'zip' : 'tar'}`,
    `--prefix=${prefix}/`,
    commit,
  ];
  const stream = gitStream(repo, args);
  if (format === 'zip') return stream;
  // pipeline() destroys the gzip stream with git's error if git fails.
  return pipeline(stream, createGzip(), () => {});
}
