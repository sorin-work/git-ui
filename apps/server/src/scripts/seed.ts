import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { loadConfig } from '../config.js';
import { RepoRegistry } from '../git/repos.js';
import { createDemoRepos } from '../seed/demo-repos.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const { reposDir } = loadConfig();
await mkdir(reposDir, { recursive: true });

if ((await new RepoRegistry(reposDir).list()).length > 0) {
  console.log(`${reposDir} already contains repositories, not adding the demo ones.`);
} else {
  const names = await createDemoRepos(reposDir);
  console.log(`Created ${names.join(', ')} in ${reposDir}`);
}
