import { gunzipSync } from 'node:zlib';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from '../../test/app.js';
import { createHostileRepo, type HostileRepo } from '../../test/hostile.js';
import { tempDir } from '../../test/repo.js';

describe('a repository whose config tries to run programs', () => {
  let root: Awaited<ReturnType<typeof tempDir>>;
  let app: FastifyInstance;
  const repos: Record<string, HostileRepo> = {};

  beforeAll(async () => {
    root = await tempDir();
    repos.hostile = await createHostileRepo(root.dir, 'hostile');
    repos.ssh = await createHostileRepo(root.dir, 'ssh', { signature: 'ssh' });
    repos.x509 = await createHostileRepo(root.dir, 'x509', { signature: 'x509' });
    repos.included = await createHostileRepo(root.dir, 'included', { viaInclude: true });
    app = await testApp(root.dir);
  });

  afterAll(async () => {
    await app.close();
    await root.cleanup();
  });

  const get = async (url: string) => {
    const res = await app.inject(url);
    expect(res.statusCode, `${url}: ${res.body.slice(0, 200)}`).toBe(200);
    return res;
  };

  const pages = (name: string, repo: HostileRepo) => [
    `/api/repos/${name}`,
    `/api/repos/${name}/tree`,
    `/api/repos/${name}/tree/latest`,
    `/api/repos/${name}/files`,
    `/api/repos/${name}/blob?path=a.txt`,
    `/api/repos/${name}/raw?path=a.txt`,
    `/api/repos/${name}/blame?path=a.txt`,
    `/api/repos/${name}/commits`,
    `/api/repos/${name}/commits?path=a.txt`,
    `/api/repos/${name}/commits/${repo.signed}`,
    `/api/repos/${name}/commits/${repo.second}`,
    `/api/repos/${name}/compare?base=${repo.first}&head=main`,
    `/api/repos/${name}/branches`,
    `/api/repos/${name}/tags`,
    `/api/repos/${name}/search?q=find`,
    `/api/repos/${name}/insights`,
    `/api/repos/${name}/languages`,
    `/api/repos/${name}/archive?format=zip`,
    `/api/repos/${name}/archive?format=tar.gz`,
  ];

  it.each(['hostile', 'ssh', 'x509', 'included'])(
    'never runs them, on any page (%s)',
    async (name) => {
      const repo = repos[name]!;
      const statuses: Record<string, number> = {};
      for (const url of ['/api/repos', ...pages(name, repo)]) {
        statuses[url] = (await app.inject(url)).statusCode;
      }
      expect(repo.ran()).toBe(false);
      expect(Object.entries(statuses).filter(([, status]) => status !== 200)).toEqual([]);
    },
  );

  it('reads output in the format the parsers expect', async () => {
    const { second } = repos.hostile!;
    const commits = (await get('/api/repos/hostile/commits')).json();
    expect(commits.items.map((c: { subject: string }) => c.subject)).toEqual([
      'signed',
      'second',
      'first',
    ]);

    const commit = (await get(`/api/repos/hostile/commits/${second}`)).json();
    expect(commit.files).toHaveLength(1);
    expect(commit.files[0].path).toBe('a.txt');
    expect(commit.files[0].hunks[0].header).toBe('@@ -1 +1,2 @@');

    const search = (await get('/api/repos/hostile/search?q=find')).json();
    expect(search.matches).toEqual([{ path: 'README.md', line: 3, text: 'find me' }]);

    const insights = (await get('/api/repos/hostile/insights')).json();
    expect(insights.contributors[0].name).toBe('Test Author');

    const blame = (await get('/api/repos/hostile/blame?path=a.txt')).json();
    expect(blame.lines).toHaveLength(2);
  });

  it('archives files as stored in git', async () => {
    const res = await get('/api/repos/hostile/archive?format=tar.gz');
    const tar = gunzipSync(res.rawPayload).toString('latin1');
    expect(tar).toContain('hostile-main/a.txt');
    expect(tar).toContain('one\ntwo\n');
    // Attributes are never read, so export-subst is not applied either.
    expect(tar).toContain('$Format:%H %G?$');
    expect(repos.hostile!.ran()).toBe(false);
  });

  it('runs nothing even when the config changes during a download', async () => {
    const { repo, ran, program } = repos.hostile!;
    let swapping = true;
    const swap = (async () => {
      for (let i = 0; swapping; i++) {
        // Swap the program in and out, as someone with write access could.
        await repo.run(['config', 'filter.evil.process', i % 2 ? '' : program]);
        await repo.run(['config', 'tar.zip.command', i % 2 ? 'cat' : program]);
      }
    })();
    try {
      for (let i = 0; i < 10; i++) {
        await get(`/api/repos/hostile/archive?format=${i % 2 ? 'zip' : 'tar.gz'}`);
      }
    } finally {
      swapping = false;
      await swap;
    }
    expect(ran()).toBe(false);
  });
});
