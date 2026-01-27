<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { getBlame } from '../api';
import PathBreadcrumbs from '../components/PathBreadcrumbs.vue';
import { useAsync } from '../composables/useAsync';
import { useRepo } from '../composables/useRepo';
import { highlightLines } from '../lib/highlight';
import { languageForPath } from '../lib/languages';
import { blobUrl, commitUrl, joinPathParam } from '../lib/paths';
import { plural } from '../lib/text';
import { relativeTime } from '../lib/time';

const route = useRoute();
const { name: repo, currentRef } = useRepo();
const path = computed(() => joinPathParam(route.params.path as string | string[] | undefined));

const result = useAsync(
  () => getBlame(repo.value, currentRef.value, path.value),
  () => [repo.value, currentRef.value, path.value],
);

const highlighted = computed(() => {
  const lines = result.data.value?.lines ?? [];
  return highlightLines(lines.map((l) => l.content).join('\n'), languageForPath(path.value));
});

/** 0 for the oldest commit in the file, 1 for the newest; drives the age bar color. */
const age = computed(() => {
  const commits = result.data.value?.commits ?? {};
  const times = Object.values(commits).map((c) => new Date(c.date).getTime());
  const min = Math.min(...times);
  const span = Math.max(...times) - min || 1;
  return (sha: string) => (new Date(commits[sha]?.date ?? 0).getTime() - min) / span;
});

const rows = computed(() =>
  (result.data.value?.lines ?? []).map((line, i, all) => ({
    ...line,
    html: highlighted.value[i] ?? '',
    startsGroup: i === 0 || all[i - 1]!.sha !== line.sha,
    commit: result.data.value!.commits[line.sha],
  })),
);
</script>

<template>
  <div class="blame-view">
    <PathBreadcrumbs :repo="repo" :git-ref="currentRef" :path="path" />

    <div v-if="result.error.value" class="alert alert--error">{{ result.error.value.message }}</div>
    <p v-else-if="result.loading.value && !result.data.value" class="muted">Loading…</p>

    <div v-if="result.data.value" class="panel file">
      <header class="file__header">
        <span class="file__meta muted">
          Blame · {{ plural(Object.keys(result.data.value.commits).length, 'commit') }}
        </span>
        <RouterLink :to="blobUrl(repo, currentRef, path)" class="button button--small">
          View file
        </RouterLink>
      </header>
      <div class="code">
        <table class="code__table blame">
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.number"
              :class="{ 'blame__group-start': row.startsGroup }"
            >
              <td class="blame__commit">
                <template v-if="row.startsGroup && row.commit">
                  <RouterLink :to="commitUrl(repo, row.sha)" class="blame__summary">
                    {{ row.commit.summary }}
                  </RouterLink>
                  <span class="blame__meta muted">
                    {{ row.commit.author }} · {{ relativeTime(row.commit.date) }}
                  </span>
                </template>
              </td>
              <td
                class="blame__age"
                :style="{ opacity: 0.15 + 0.85 * age(row.sha) }"
                aria-hidden="true"
              ></td>
              <td class="code__number" :data-line="row.number"></td>
              <!-- eslint-disable-next-line vue/no-v-html -- escaped by highlightLines -->
              <td class="code__line hljs" v-html="row.html || ' '"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
