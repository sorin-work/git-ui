<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { getCommit } from '../api';
import DiffModeToggle from '../components/DiffModeToggle.vue';
import DiffView from '../components/DiffView.vue';
import { useAsync } from '../composables/useAsync';
import { useRepo } from '../composables/useRepo';
import { commitUrl, treeUrl } from '../lib/paths';
import { saveDiffMode, savedDiffMode } from '../lib/diff';
import { plural } from '../lib/text';
import { formatDateTime, relativeTime } from '../lib/time';

const route = useRoute();
const { name: repo } = useRepo();
const sha = computed(() => route.params.sha as string);

const result = useAsync(
  () => getCommit(repo.value, sha.value),
  () => [repo.value, sha.value],
);

const commit = computed(() => result.data.value?.commit);

const diffMode = ref(savedDiffMode());
watch(diffMode, saveDiffMode);
</script>

<template>
  <div class="commit-view">
    <div v-if="result.error.value" class="alert alert--error">{{ result.error.value.message }}</div>
    <p v-else-if="result.loading.value && !result.data.value" class="muted">Loading…</p>

    <template v-if="commit && result.data.value">
      <article class="panel commit-header">
        <h1 class="commit-header__subject">{{ commit.subject }}</h1>
        <pre v-if="commit.body" class="commit-header__body">{{ commit.body }}</pre>
        <footer class="commit-header__meta">
          <div>
            <strong>{{ commit.author.name }}</strong>
            <span class="muted"> &lt;{{ commit.author.email }}&gt; authored </span>
            <time :datetime="commit.author.date" :title="formatDateTime(commit.author.date)">
              {{ relativeTime(commit.author.date) }}
            </time>
            <template v-if="commit.committer.name !== commit.author.name">
              <span class="muted"> · committed by </span>
              <strong>{{ commit.committer.name }}</strong>
            </template>
          </div>
          <div class="commit-header__ids">
            <span v-if="commit.parents.length" class="muted">
              {{ commit.parents.length > 1 ? 'Parents' : 'Parent' }}
              <RouterLink
                v-for="parent in commit.parents"
                :key="parent"
                :to="commitUrl(repo, parent)"
                class="sha"
              >
                {{ parent.slice(0, 7) }}
              </RouterLink>
            </span>
            <span class="muted"
              >Commit <code class="sha">{{ commit.sha }}</code></span
            >
            <RouterLink :to="treeUrl(repo, commit.sha)" class="button button--small">
              Browse files
            </RouterLink>
          </div>
        </footer>
      </article>

      <p class="diff-summary">
        <DiffModeToggle v-model="diffMode" class="diff-summary__toggle" />
        <strong>{{ plural(result.data.value.stats.files, 'file') }}</strong> changed,
        <span class="added">{{ plural(result.data.value.stats.additions, 'addition') }}</span
        >,
        <span class="deleted">{{ plural(result.data.value.stats.deletions, 'deletion') }}</span>
      </p>

      <DiffView
        v-for="file in result.data.value.files"
        :key="file.path"
        :file="file"
        :mode="diffMode"
      />
    </template>
  </div>
</template>
