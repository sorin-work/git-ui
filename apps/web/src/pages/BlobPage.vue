<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { getBlob, rawUrl } from '../api';
import CodeView from '../components/CodeView.vue';
import PathBreadcrumbs from '../components/PathBreadcrumbs.vue';
import { useAsync } from '../composables/useAsync';
import { useRepo } from '../composables/useRepo';
import { isMarkdown, renderMarkdown, resolveRelative } from '../lib/markdown';
import {
  blameUrl,
  blobUrl,
  commitsUrl,
  formatBytes,
  joinPathParam,
  parentPath,
} from '../lib/paths';
import { plural } from '../lib/text';

const route = useRoute();
const { name: repo, currentRef } = useRepo();

const path = computed(() => joinPathParam(route.params.path as string | string[] | undefined));

const blob = useAsync(
  () => getBlob(repo.value, currentRef.value, path.value),
  () => [repo.value, currentRef.value, path.value],
);
const blob_ = blob.data;

/** Markdown files open rendered; "Code" shows the source with line numbers. */
const view = ref<'preview' | 'code'>('preview');
const preview = computed(() => {
  const blob = blob_.value;
  if (!blob?.content || !isMarkdown(blob.name)) return null;
  const folder = parentPath(blob.path);
  return renderMarkdown(blob.content, {
    image: (src) => rawUrl(repo.value, blob.commit, resolveRelative(folder, src)),
    link: (href) => blobUrl(repo.value, currentRef.value, resolveRelative(folder, href)),
  });
});

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
          <template v-if="blob.data.value.content !== null"
            >{{ plural(lineCount, 'line') }} ·
          </template>
          {{ formatBytes(blob.data.value.size) }}
          <template v-if="blob.data.value.language"> · {{ blob.data.value.language }}</template>
        </span>
        <span class="file__actions">
          <span v-if="preview" class="segmented" role="radiogroup" aria-label="View">
            <button
              v-for="mode in ['preview', 'code'] as const"
              :key="mode"
              type="button"
              role="radio"
              :aria-checked="view === mode"
              :class="{ active: view === mode }"
              @click="view = mode"
            >
              {{ mode === 'preview' ? 'Preview' : 'Code' }}
            </button>
          </span>
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
      <!-- eslint-disable vue/no-v-html -- sanitized by renderMarkdown -->
      <article
        v-else-if="preview && view === 'preview'"
        class="markdown"
        v-html="preview"
      ></article>
      <!-- eslint-enable vue/no-v-html -->
      <CodeView
        v-else-if="blob.data.value.content !== null"
        :content="blob.data.value.content"
        :language="blob.data.value.language"
      />
    </div>
  </div>
</template>
