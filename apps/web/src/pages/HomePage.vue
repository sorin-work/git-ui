<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { listRepos } from '../api';
import { useAsync } from '../composables/useAsync';
import { plural } from '../lib/text';
import { relativeTime } from '../lib/time';

const { data: repos, error, loading } = useAsync(listRepos);
const filter = ref('');

const visible = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  return (repos.value ?? []).filter(
    (r) =>
      !needle ||
      r.name.toLowerCase().includes(needle) ||
      (r.description ?? '').toLowerCase().includes(needle),
  );
});
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <h1>Repositories</h1>
        <p v-if="repos" class="muted">{{ plural(repos.length, 'repository', 'repositories') }}</p>
      </div>
      <input
        v-model="filter"
        class="input search-input"
        type="search"
        placeholder="Filter repositories…"
        aria-label="Filter repositories"
      />
    </header>

    <p v-if="loading && !repos" class="muted">Loading…</p>
    <div v-if="error" class="alert alert--error">{{ error.message }}</div>

    <div v-if="repos && repos.length === 0" class="panel empty">
      <h2>No repositories yet</h2>
      <p class="muted">
        Put git repositories (bare or regular clones) in the folder set by <code>REPOS_DIR</code>.
      </p>
    </div>

    <ul v-if="visible.length" class="repo-list">
      <li v-for="repo in visible" :key="repo.name" class="panel repo-card">
        <div class="repo-card__head">
          <RouterLink :to="{ name: 'repo', params: { repo: repo.name } }" class="repo-card__name">
            {{ repo.name }}
          </RouterLink>
          <span v-if="repo.bare" class="badge">bare</span>
        </div>
        <p v-if="repo.description" class="repo-card__description">{{ repo.description }}</p>
        <p class="repo-card__meta muted">
          <template v-if="repo.lastCommit">
            <span v-if="repo.defaultBranch" class="badge badge--branch">{{
              repo.defaultBranch
            }}</span>
            {{ repo.lastCommit.subject }} ·
            <span :title="repo.lastCommit.date">{{ relativeTime(repo.lastCommit.date) }}</span>
          </template>
          <template v-else>No commits yet</template>
        </p>
      </li>
    </ul>
    <p v-else-if="repos && repos.length" class="muted">No repositories match “{{ filter }}”.</p>
  </section>
</template>
