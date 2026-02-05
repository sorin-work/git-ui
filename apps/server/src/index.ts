import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { RepoRegistry } from './git/repos.js';
import { createDemoRepos } from './seed/demo-repos.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const config = loadConfig();
const app = await buildApp(config);

if (config.seedDemo && (await new RepoRegistry(config.reposDir).list()).length === 0) {
  await mkdir(config.reposDir, { recursive: true });
  const names = await createDemoRepos(config.reposDir);
  app.log.info({ repos: names }, 'created demo repositories');
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.log.info({ signal }, 'shutting down');
    void app.close().then(() => process.exit(0));
  });
}
