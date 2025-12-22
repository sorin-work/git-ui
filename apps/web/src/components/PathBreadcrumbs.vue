<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { treeUrl } from '../lib/paths';

const props = defineProps<{ repo: string; gitRef: string; path: string }>();

const crumbs = computed(() => {
  const segments = props.path.split('/').filter(Boolean);
  return segments.map((name, i) => ({
    name,
    path: segments.slice(0, i + 1).join('/'),
    last: i === segments.length - 1,
  }));
});
</script>

<template>
  <nav class="breadcrumbs" aria-label="Path">
    <RouterLink :to="treeUrl(repo, gitRef)" class="breadcrumbs__root">{{ repo }}</RouterLink>
    <template v-for="crumb in crumbs" :key="crumb.path">
      <span class="breadcrumbs__sep">/</span>
      <strong v-if="crumb.last">{{ crumb.name }}</strong>
      <RouterLink v-else :to="treeUrl(repo, gitRef, crumb.path)">{{ crumb.name }}</RouterLink>
    </template>
  </nav>
</template>
