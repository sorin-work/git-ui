<script setup lang="ts">
import { computed } from 'vue';
import { getBlob, rawUrl } from '../api';
import { useAsync } from '../composables/useAsync';
import { isMarkdown, renderMarkdown, resolveRelative } from '../lib/markdown';
import { blobUrl, parentPath } from '../lib/paths';

const props = defineProps<{ repo: string; gitRef: string; path: string; name: string }>();

const readme = useAsync(
  () => getBlob(props.repo, props.gitRef, props.path),
  () => [props.repo, props.gitRef, props.path],
);

const html = computed(() => {
  const content = readme.data.value?.content;
  if (!content || !isMarkdown(props.name)) return null;
  const folder = parentPath(props.path);
  return renderMarkdown(content, {
    image: (src) => rawUrl(props.repo, props.gitRef, resolveRelative(folder, src)),
    link: (href) => blobUrl(props.repo, props.gitRef, resolveRelative(folder, href)),
  });
});
</script>

<template>
  <section v-if="readme.data.value?.content" class="panel readme">
    <header class="readme__header">{{ name }}</header>
    <!-- eslint-disable-next-line vue/no-v-html -- sanitized by renderMarkdown -->
    <article v-if="html" class="markdown" v-html="html"></article>
    <pre v-else class="readme__plain">{{ readme.data.value.content }}</pre>
  </section>
</template>
