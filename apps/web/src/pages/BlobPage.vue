<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { getBlob, rawUrl } from '../api';
import CodeView from '../components/CodeView.vue';
import PathBreadcrumbs from '../components/PathBreadcrumbs.vue';
import { useAsync } from '../composables/useAsync';
import { useRepo } from '../composables/useRepo';
import { blameUrl, commitsUrl, formatBytes, joinPathParam } from '../lib/paths';

const route = useRoute();
const { name: repo, currentRef } = useRepo();

const path = computed(() => joinPathParam(route.params.path as string | string[] | undefined));

const blob = useAsync(
  () => getBlob(repo.value, currentRef.value, path.value),
  () => [repo.value, currentRef.value, path.value],
);

const lineCount = computed(() => {
  const content = blob.data.value?.content;
  if (!content) return 0;
  return content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
});
</script>

<template>
  <div class="blob-view">
    <PathBreadcrumbs :repo="repo" :git-ref="currentRef" :path="path" />

    <div v-if="blob.error.value" class="alert alert--error">{{ blob.error.value.message }}</div>
    <p v-else-if="blob.loading.value && !blob.data.value" class="muted">Loading…</p>

    <div v-if="blob.data.value" class="panel file">
      <header class="file__header">
        <span class="file__meta muted">
          <template v-if="blob.data.value.content !== null">{{ lineCount }} lines · </template>
          {{ formatBytes(blob.data.value.size) }}
          <template v-if="blob.data.value.language"> · {{ blob.data.value.language }}</template>
        </span>
        <span class="file__actions">
          <a
            :href="rawUrl(repo, blob.data.value.commit, path)"
            class="button button--small"
            target="_blank"
            rel="noopener"
            >Raw</a
          >
          <a :href="rawUrl(repo, blob.data.value.commit, path, true)" class="button button--small"
            >Download</a
          >
          <RouterLink
            v-if="blob.data.value.content !== null"
            :to="blameUrl(repo, currentRef, path)"
            class="button button--small"
          >
            Blame
          </RouterLink>
          <RouterLink :to="commitsUrl(repo, currentRef, path)" class="button button--small">
            History
          </RouterLink>
        </span>
      </header>

      <div v-if="blob.data.value.image" class="file__image">
        <img :src="rawUrl(repo, blob.data.value.commit, path)" :alt="blob.data.value.name" />
      </div>
      <div v-else-if="blob.data.value.binary" class="file__notice muted">
        Binary file, not shown. Use Download to get it.
      </div>
      <div v-else-if="blob.data.value.truncated" class="file__notice muted">
        This file is too large to display.
      </div>
      <CodeView
        v-else-if="blob.data.value.content !== null"
        :content="blob.data.value.content"
        :language="blob.data.value.language"
      />
    </div>
  </div>
</template>
