import { chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TestRepo, tempDir } from '../../test/repo.js';
import { seedDemoReposIfEmpty } from './startup.js';

const isRoot = process.getuid?.() === 0;

describe('seedDemoReposIfEmpty', () => {
  let root: Awaited<ReturnType<typeof tempDir>>;
  const log = () => ({ info: vi.fn(), warn: vi.fn() });

  beforeAll(async () => {
    root = await tempDir();
  });

  afterAll(async () => {
    await chmod(path.join(root.dir, 'read-only'), 0o755).catch(() => {});
    await root.cleanup();
  });

  it('leaves a folder that already has repositories alone', async () => {
    const dir = path.join(root.dir, 'existing');
    await mkdir(dir);
    await TestRepo.create(dir, 'mine');
    expect(await seedDemoReposIfEmpty(dir, log())).toEqual([]);
  });

  it.skipIf(isRoot)('logs a warning instead of failing when the folder is read-only', async () => {
    const dir = path.join(root.dir, 'read-only');
    await mkdir(dir);
    await chmod(dir, 0o555);
    const logger = log();
    await expect(seedDemoReposIfEmpty(dir, logger)).resolves.toEqual([]);
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn.mock.calls[0]![1]).toMatch(/SEED_DEMO=false/);
  });
});
