<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { listCommits, type CommitSummary } from '../api';
import { useRepo } from '../composables/useRepo';
import { commitUrl, treeUrl } from '../lib/paths';
import { formatDate, relativeTime } from '../lib/time';

const PAGE_SIZE = 30;

const route = useRoute();
const router = useRouter();
const { name: repo, currentRef } = useRepo();

const path = computed(() => (route.query.path as string | undefined) ?? '');
const author = ref((route.query.author as string | undefined) ?? '');
const search = ref((route.query.q as string | undefined) ?? '');

const commits = ref<CommitSummary[]>([]);
const page = ref(1);
const hasMore = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
let request = 0;

async function load(reset: boolean) {
  const id = ++request;
  loading.value = true;
  error.value = null;
  const nextPage = reset ? 1 : page.value + 1;
  try {
    const result = await listCommits(repo.value, {
      ref: currentRef.value,
      path: path.value || undefined,
      author: (route.query.author as string | undefined) || undefined,
      q: (route.query.q as string | undefined) || undefined,
      page: nextPage,
      pageSize: PAGE_SIZE,
    });
    if (id !== request) return;
    commits.value = reset ? result.items : [...commits.value, ...result.items];
    page.value = nextPage;
    hasMore.value = result.hasMore;
  } catch (err) {
    if (id === request) error.value = err instanceof Error ? err.message : String(err);
  } finally {
    if (id === request) loading.value = false;
  }
}

watch(
  () => [repo.value, currentRef.value, route.query.path, route.query.author, route.query.q],
  () => load(true),
  { immediate: true },
);

function applyFilters() {
  void router.replace({
    query: {
      ...route.query,
      author: author.value.trim() || undefined,
      q: search.value.trim() || undefined,
    },
  });
}

/** Commits grouped by the day they were made, newest first. */
const groups = computed(() => {
  const byDay = new Map<string, CommitSummary[]>();
  for (const commit of commits.value) {
    const day = formatDate(commit.committer.date);
    byDay.set(day, [...(byDay.get(day) ?? []), commit]);
  }
  return [...byDay.entries()].map(([day, items]) => ({ day, items }));
});
</script>

<template>
  <div class="commits-view">
    <form class="filters" @submit.prevent="applyFilters">
      <input v-model="search" class="input" type="search" placeholder="Search messages…" />
      <input v-model="author" class="input" type="search" placeholder="Author name or email…" />
      <button class="button" type="submit">Filter</button>
    </form>

    <p v-if="path" class="muted path-filter">
      History of
      <RouterLink :to="treeUrl(repo, currentRef, path)"
        ><code>{{ path }}</code></RouterLink
      >
      ·
      <RouterLink :to="{ query: { ...route.query, path: undefined } }">show all commits</RouterLink>
    </p>

    <div v-if="error" class="alert alert--error">{{ error }}</div>

    <section v-for="group in groups" :key="group.day" class="commit-group">
      <h2 class="commit-group__day">Commits on {{ group.day }}</h2>
      <ul class="panel commit-list">
        <li v-for="commit in group.items" :key="commit.sha" class="commit-row">
          <div class="commit-row__main">
            <RouterLink :to="commitUrl(repo, commit.sha)" class="commit-row__subject">
              {{ commit.subject }}
            </RouterLink>
            <div class="commit-row__meta muted">
              <strong>{{ commit.author.name }}</strong>
              committed
              <time :datetime="commit.committer.date" :title="commit.committer.date">
                {{ relativeTime(commit.committer.date) }}
              </time>
            </div>
          </div>
          <div class="commit-row__actions">
            <RouterLink :to="commitUrl(repo, commit.sha)" class="sha">{{
              commit.shortSha
            }}</RouterLink>
            <RouterLink
              :to="treeUrl(repo, commit.sha)"
              class="button button--small"
              title="Browse files at this commit"
            >
              Browse
            </RouterLink>
          </div>
        </li>
      </ul>
    </section>

    <div v-if="!loading && commits.length === 0 && !error" class="panel empty">
      <h2>No commits found</h2>
      <p class="muted">Try another branch or clear the filters.</p>
    </div>

    <div class="load-more">
      <button v-if="hasMore" class="button" :disabled="loading" @click="load(false)">
        {{ loading ? 'Loading…' : 'Load more' }}
      </button>
      <p v-else-if="loading" class="muted">Loading…</p>
    </div>
  </div>
</template>
