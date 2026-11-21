import { existsSync } from 'node:fs';
import { chmod, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TestRepo } from './repo.js';

/**
 * A repository built to make git misbehave: its config names a program for
 * every hook git offers into a read command, and sets output options that
 * break our parsers. The program only creates `marker`, so a test can check
 * that git never ran it.
 */
export interface HostileRepo {
  repo: TestRepo;
  /** Exists once any of the repository's programs ran. */
  marker: string;
  /** The program that creates it. */
  program: string;
  /** Whether that happened. */
  ran: () => boolean;
  /** The first two commits, plain. */
  first: string;
  second: string;
  /** A third commit with a (fake) signature, now the tip of main. */
  signed: string;
}

const SIGNATURES = {
  openpgp: ['-----BEGIN PGP SIGNATURE-----', '-----END PGP SIGNATURE-----'],
  ssh: ['-----BEGIN SSH SIGNATURE-----', '-----END SSH SIGNATURE-----'],
  x509: ['-----BEGIN SIGNED MESSAGE-----', '-----END SIGNED MESSAGE-----'],
} as const;

export interface HostileOptions {
  /** Which kind of signature the signed commit carries (git picks the program by it). */
  signature?: keyof typeof SIGNATURES;
  /** Put the config in a file the repository includes, instead of .git/config. */
  viaInclude?: boolean;
  extraConfig?: Record<string, string>;
}

export async function createHostileRepo(
  parent: string,
  name: string,
  { signature = 'openpgp', viaInclude = false, extraConfig = {} }: HostileOptions = {},
): Promise<HostileRepo> {
  const marker = path.join(parent, `${name}-program-ran`);
  const program = path.join(parent, `${name}-program.sh`);
  await writeFile(program, `#!/bin/sh\ntouch '${marker}'\ncat\n`);
  await chmod(program, 0o755);

  const repo = await TestRepo.create(parent, name);
  const first = await repo.commit('first', {
    'README.md': '# Hostile\n\nfind me\n',
    'a.txt': 'one\n',
    // export-subst expands this in archives; %G? asks gpg about the commit.
    'version.txt': '$Format:%H %G?$\n',
    '.gitattributes': '* filter=evil diff=evil export-subst\n',
  });
  const second = await repo.commit('second', { 'a.txt': 'one\ntwo\n' });

  // A commit with a gpgsig header, so that verifying signatures means
  // starting gpg. The signature is not valid; git still asks gpg.
  const tree = (await repo.run(['rev-parse', 'HEAD^{tree}'])).trim();
  const object = path.join(parent, `${name}-commit.txt`);
  await writeFile(
    object,
    [
      `tree ${tree}`,
      `parent ${second}`,
      'author Test Author <author@example.com> 1735722000 +0000',
      'committer Test Author <author@example.com> 1735722000 +0000',
      `gpgsig ${SIGNATURES[signature][0]}`,
      ' ',
      ' iQEzBAABCAAdFiEE',
      ` ${SIGNATURES[signature][1]}`,
      '',
      'signed',
      '',
    ].join('\n'),
  );
  const signed = (await repo.run(['hash-object', '-t', 'commit', '-w', object])).trim();
  await repo.run(['update-ref', 'refs/heads/main', signed]);

  const mailmap = path.join(parent, `${name}-mailmap`);
  await writeFile(mailmap, 'Renamed By Mailmap <author@example.com>\n');

  await writeFile(path.join(parent, `${name}-allowed-signers`), '');
  const attributes = path.join(parent, `${name}-attributes`);
  await writeFile(attributes, '* filter=evil diff=evil\n');

  const config: Record<string, string> = {
    'log.showSignature': 'true',
    'gpg.program': program,
    'gpg.ssh.program': program,
    'gpg.x509.program': program,
    // ssh verification only starts the program when this is set.
    'gpg.ssh.allowedSignersFile': path.join(parent, `${name}-allowed-signers`),
    'filter.evil.smudge': program,
    'filter.evil.clean': program,
    'filter.evil.process': program,
    'filter.evil.required': 'true',
    'tar.tar.gz.command': program,
    'tar.tgz.command': program,
    'tar.tar.command': program,
    'diff.evil.textconv': program,
    'diff.external': program,
    'core.fsmonitor': program,
    'core.pager': program,
    'pager.log': program,
    'blame.ignoreRevsFile': path.join(parent, 'does-not-exist'),
    'diff.orderFile': path.join(parent, 'does-not-exist'),
    'mailmap.file': mailmap,
    'core.attributesFile': attributes,
    'color.ui': 'always',
    'color.diff': 'always',
    'color.grep': 'always',
    'color.branch': 'always',
    'diff.noprefix': 'true',
    'diff.mnemonicPrefix': 'true',
    'diff.relative': 'true',
    'diff.submodule': 'log',
    'grep.column': 'true',
    'i18n.logOutputEncoding': 'UTF-16',
    'log.follow': 'true',
    ...extraConfig,
  };
  const include = path.join(parent, `${name}-included.config`);
  for (const [key, value] of Object.entries(config)) {
    await repo.run(viaInclude ? ['config', '-f', include, key, value] : ['config', key, value]);
  }
  if (viaInclude) await repo.run(['config', 'include.path', include]);

  return { repo, marker, program, ran: () => existsSync(marker), first, second, signed };
}
