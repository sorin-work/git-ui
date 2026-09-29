import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { contributors, weeklyActivity } from '../git/insights.js';
import { repositoryLanguages } from '../git/languages.js';
import { cached } from '../lib/cache.js';
import type { RepoRegistry } from '../git/repos.js';
import { resolveCommit } from '../git/resolve.js';
import { findRepo } from './repos.js';

const insightsQuery = z.object({ ref: z.string().max(255).optional() });

export async function insightsRoutes(
  app: FastifyInstance,
  { registry }: { registry: RepoRegistry },
) {
  app.get('/repos/:repo/insights', async (request) => {
    const repo = await findRepo(registry, request.params);
    const query = insightsQuery.parse(request.query);
    const { ref, commit } = await resolveCommit(repo, query.ref);
    const [people, weeks] = await Promise.all([
      contributors(repo, commit),
      weeklyActivity(repo, commit),
    ]);
    return { ref, commit, contributors: people, activity: weeks };
  });

  app.get('/repos/:repo/languages', async (request) => {
    const repo = await findRepo(registry, request.params);
    const query = insightsQuery.parse(request.query);
    const { ref, commit } = await resolveCommit(repo, query.ref);
    const languages = await cached(['languages', repo.path, commit], () =>
      repositoryLanguages(repo, commit),
    );
    return { ref, commit, languages };
  });
}
