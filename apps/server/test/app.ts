import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

/** The real app, quiet, serving repositories from `reposDir`. */
export function testApp(reposDir: string, env: Record<string, string> = {}) {
  return buildApp(
    loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', REPOS_DIR: reposDir, ...env }),
  );
}
