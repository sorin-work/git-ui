import { mkdir } from 'node:fs/promises';
import { RepoRegistry } from '../git/repos.js';
import { createDemoRepos } from './demo-repos.js';

interface Logger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

/**
 * Creates the demo repositories when `reposDir` has no repositories yet.
 * Failing to create them (usually a folder the server cannot write to) is
 * logged and otherwise ignored: the app still starts, just with no demo data.
 */
export async function seedDemoReposIfEmpty(reposDir: string, log: Logger): Promise<string[]> {
  if ((await new RepoRegistry(reposDir).list()).length > 0) return [];
  try {
    await mkdir(reposDir, { recursive: true });
    const names = await createDemoRepos(reposDir);
    log.info({ repos: names }, 'created demo repositories');
    return names;
  } catch (err) {
    log.warn(
      { err, reposDir },
      'could not create the demo repositories; check that the folder is writable or set SEED_DEMO=false',
    );
    return [];
  }
}
